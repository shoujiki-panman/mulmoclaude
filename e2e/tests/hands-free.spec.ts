// E2E coverage for hands-free mode (Settings → Voice → Hands-free):
//  1. The camera option adds the chat-input camera button, remembered per device.
//  2. With the camera on, the next send attaches a JPEG snapshot of the preview.
//  3. Read-aloud speaks the reply a run ends on and Stop ends it — and stays
//     silent while the option is off (the default).
//
// Voice auto-send is not driven here: it needs a real mic plus whisper.cpp.
// Its gate and timer are unit-tested (test_autoSend.ts, test_useVoiceAutoSend.ts).

import { test, expect, type Page } from "@playwright/test";
import { mockAllApis } from "../fixtures/api";
import { openSettings } from "../fixtures/chat";
import { mockAgentWithPubSub, releaseStream, urlEndsWith } from "../fixtures/pubsub";

// Chromium's fake camera (a moving test pattern) with the permission prompt
// auto-accepted, so getUserMedia resolves headlessly.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
});

const SPOKEN_KEY = "__e2eSpoken";

/** Seed hands-free prefs before the app boots (re-applied on every load). */
async function seedPrefs(page: Page, prefs: Record<string, string>): Promise<void> {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, prefs);
}

/** Replace the browser's speech engine with a recorder. It reports
 *  "speaking" from the first utterance until cancel(), like a long reply
 *  that is still being read. */
async function installFakeSpeech(page: Page): Promise<void> {
  await page.addInitScript((spokenKey) => {
    const spoken: { text: string; lang: string }[] = [];
    let speaking = false;
    class FakeUtterance {
      text: string;
      lang = "";
      constructor(text: string) {
        this.text = text;
      }
    }
    const engine = {
      get speaking() {
        return speaking;
      },
      get pending() {
        return false;
      },
      speak(utterance: FakeUtterance) {
        spoken.push({ text: utterance.text, lang: utterance.lang });
        speaking = true;
      },
      cancel() {
        speaking = false;
      },
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: engine });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
    Reflect.set(globalThis, spokenKey, spoken);
  }, SPOKEN_KEY);
}

async function spokenUtterances(page: Page): Promise<unknown> {
  const json = await page.evaluate((spokenKey) => JSON.stringify(Reflect.get(globalThis, spokenKey) ?? []), SPOKEN_KEY);
  return JSON.parse(json);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByTestId("user-input").fill(text);
  await page.getByTestId("send-btn").click();
}

/** Send, then let the scripted reply stream. The mock socket starts its
 *  stream as soon as the page subscribes (at load); held until after the
 *  send, the reply lands as THIS run's output, the way a real reply does. */
async function sendAndStreamReply(page: Page, text: string): Promise<void> {
  await sendMessage(page, text);
  await releaseStream(page);
}

test.describe("hands-free camera", () => {
  test("the Settings option adds a camera button, remembered across reloads", async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/");
    await expect(page.getByTestId("camera-btn")).toHaveCount(0);

    await openSettings(page);
    await page.getByTestId("settings-tab-voice").click();
    await expect(page.getByTestId("settings-hands-free")).toBeVisible();
    await page.getByTestId("settings-hands-free-camera-input").check();
    await page.getByTestId("settings-close-btn").click();

    await expect(page.getByTestId("camera-btn")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("handsFree.camera"))).toBe("1");
    await page.reload();
    await expect(page.getByTestId("camera-btn")).toBeVisible();
  });

  test("with the camera on, sending attaches a JPEG snapshot of the preview", async ({ page }) => {
    await mockAllApis(page);
    await seedPrefs(page, { "handsFree.camera": "1" });
    await mockAgentWithPubSub(page, [{ type: "text", message: "Looks fine." }]);
    const uploads: { filename: string; dataUrl: string }[] = [];
    await page.route(urlEndsWith("/api/attachments"), async (route) => {
      uploads.push(route.request().postDataJSON() as { filename: string; dataUrl: string });
      await route.fulfill({ json: { path: "data/attachments/2026/10/snap.jpg", originalPath: "data/attachments/2026/10/snap.jpg", mimeType: "image/jpeg" } });
    });

    await page.goto("/");
    await page.getByTestId("camera-btn").click();
    const preview = page.getByTestId("camera-preview");
    await expect(preview).toBeVisible();
    // A snapshot can only be taken once the first frame has arrived.
    await expect.poll(() => preview.evaluate((video) => (video instanceof HTMLVideoElement ? video.videoWidth : 0))).toBeGreaterThan(0);

    await sendMessage(page, "is this joint ok?");

    await expect.poll(() => uploads.length).toBe(1);
    expect(uploads[0]?.filename).toMatch(/^camera-\d{8}-\d{6}\.jpg$/);
    expect(uploads[0]?.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});

test.describe("hands-free read-aloud", () => {
  test("reads the reply a run ends on (code and URLs left out) and Stop ends it", async ({ page }) => {
    await mockAllApis(page);
    await installFakeSpeech(page);
    await seedPrefs(page, { "handsFree.readAloud": "1" });
    await mockAgentWithPubSub(
      page,
      [{ type: "text", message: "Heat the iron to **350°C**. Then [check](https://example.com/joints) the joint.\n\n```c\nint x;\n```" }],
      { startOnRelease: true },
    );

    await page.goto("/");
    await sendAndStreamReply(page, "how hot?");

    await expect(page.getByTestId("read-aloud-indicator")).toBeVisible();
    expect(await spokenUtterances(page)).toEqual([{ text: "Heat the iron to 350°C. Then check the joint.", lang: "en-US" }]);

    await page.getByTestId("read-aloud-stop-btn").click();
    await expect(page.getByTestId("read-aloud-indicator")).toHaveCount(0);
  });

  test("stays silent while the option is off (the default)", async ({ page }) => {
    await mockAllApis(page);
    await installFakeSpeech(page);
    await mockAgentWithPubSub(page, [{ type: "text", message: "Pong" }], { startOnRelease: true });

    await page.goto("/");
    await sendAndStreamReply(page, "ping");

    await expect(page.locator("text=Pong").first()).toBeVisible();
    // The run is over once Send replaces Stop again.
    await expect(page.getByTestId("send-btn")).toBeVisible();
    await expect(page.getByTestId("read-aloud-indicator")).toHaveCount(0);
    expect(await spokenUtterances(page)).toEqual([]);
  });
});
