import { test, expect, type Page } from "@playwright/test";
import { mockAllApis } from "../fixtures/api";

// Settings → Personality / Rules (the "Assistant" group). The mocks keep
// server state in memory and echo every PUT, so each test can assert both
// what the UI sent and what it shows after a reopen.

interface PersonalityState {
  tone: string;
  traits: Record<string, string>;
  customInstructions: string;
}

interface RuleState {
  id: string;
  kind: string;
  text: string;
  enabled: boolean;
}

interface ProfileState {
  personality: PersonalityState;
  rules: { rules: RuleState[]; plugins: Record<string, string> };
}

async function mockProfileApi(page: Page, initial?: Partial<ProfileState>): Promise<{ state: ProfileState }> {
  await mockAllApis(page);
  const state: ProfileState = {
    personality: {
      tone: "default",
      traits: { warmth: "default", enthusiasm: "default", formatting: "default", emoji: "default" },
      customInstructions: "",
    },
    rules: { rules: [], plugins: {} },
    ...initial,
  };
  await page.route(
    (url) => url.pathname === "/api/config/personality",
    (route) => {
      if (route.request().method() === "PUT") state.personality = route.request().postDataJSON() as PersonalityState;
      return route.fulfill({ json: state.personality });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/config/rules",
    (route) => {
      if (route.request().method() === "PUT") state.rules = route.request().postDataJSON() as ProfileState["rules"];
      return route.fulfill({ json: state.rules });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/config/rules/catalog",
    (route) => route.fulfill({ json: { plugins: ["generateImage", "presentForm"], mcpServers: ["github"] } }),
  );
  return { state };
}

async function openTab(page: Page, tab: "personality" | "rules"): Promise<void> {
  await page.locator('[data-testid="settings-btn"]').click();
  await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
  await page.locator(`[data-testid="settings-tab-${tab}"]`).click();
  await expect(page.locator(`[data-testid="settings-${tab}-tab"]`)).toBeVisible();
}

test.describe("Settings → Personality", () => {
  test("tone and characteristics save on click, instructions on Save", async ({ page }) => {
    const { state } = await mockProfileApi(page);
    await page.goto("/chat");
    await openTab(page, "personality");

    await page.locator('[data-testid="settings-personality-tone"]').selectOption("candid");
    await expect.poll(() => state.personality.tone).toBe("candid");

    await page.locator('[data-testid="settings-personality-emoji-less"]').click();
    await expect.poll(() => state.personality.traits.emoji).toBe("less");
    await expect(page.locator('[data-testid="settings-personality-emoji-less"]')).toHaveAttribute("aria-checked", "true");
    // The other characteristics were left alone.
    expect(state.personality.traits.warmth).toBe("default");

    const textarea = page.locator('[data-testid="settings-personality-instructions"]');
    await textarea.fill("Call me Shu. Answer in Japanese.");
    await expect(page.locator('[data-testid="settings-personality-instructions-dirty"]')).toBeVisible();
    await page.locator('[data-testid="settings-personality-instructions-save"]').click();
    await expect.poll(() => state.personality.customInstructions).toBe("Call me Shu. Answer in Japanese.");
    await expect(page.locator('[data-testid="settings-personality-instructions-dirty"]')).toHaveCount(0);

    await page.locator('[data-testid="settings-close-btn"]').click();
    await openTab(page, "personality");
    await expect(page.locator('[data-testid="settings-personality-tone"]')).toHaveValue("candid");
    await expect(textarea).toHaveValue("Call me Shu. Answer in Japanese.");
  });

  test("closing with unsaved instructions asks first", async ({ page }) => {
    await mockProfileApi(page);
    await page.goto("/chat");
    await openTab(page, "personality");
    await page.locator('[data-testid="settings-personality-instructions"]').fill("Draft I have not saved");

    let prompted = false;
    page.once("dialog", (dialog) => {
      prompted = true;
      void dialog.dismiss();
    });
    await page.locator('[data-testid="settings-close-btn"]').click();
    await expect.poll(() => prompted).toBe(true);
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
  });
});

test.describe("Settings → Rules", () => {
  test("shows the default rules on request", async ({ page }) => {
    await mockProfileApi(page);
    await page.goto("/chat");
    await openTab(page, "rules");

    await expect(page.locator('[data-testid="settings-rules-defaults"]')).toHaveCount(0);
    await page.locator('[data-testid="settings-rules-defaults-toggle"]').click();
    await expect(page.locator('[data-testid="settings-rules-defaults"]')).toContainText("Delete files or data");
  });

  test("adds, edits, switches off and deletes a rule", async ({ page }) => {
    const { state } = await mockProfileApi(page);
    await page.goto("/chat");
    await openTab(page, "rules");
    await expect(page.locator('[data-testid="settings-rules-empty"]')).toBeVisible();

    await page.locator('[data-testid="settings-rules-add"]').click();
    await page.locator('[data-testid="settings-rule-editor-kind-never"]').click();
    await page.locator('[data-testid="settings-rule-editor-text"]').fill("Posting anything to social media");
    await page.locator('[data-testid="settings-rule-editor-save"]').click();
    await expect.poll(() => state.rules.rules.length).toBe(1);
    const [added] = state.rules.rules;
    expect(added).toMatchObject({ kind: "never", text: "Posting anything to social media", enabled: true });
    const ruleId = added?.id ?? "";
    await expect(page.locator(`[data-testid="settings-rule-${ruleId}"]`)).toContainText("Posting anything to social media");

    await page.locator(`[data-testid="settings-rule-edit-${ruleId}"]`).click();
    await page.locator('[data-testid="settings-rule-editor-kind-ask"]').click();
    await page.locator('[data-testid="settings-rule-editor-text"]').fill("Posting to social media");
    await page.locator('[data-testid="settings-rule-editor-save"]').click();
    await expect.poll(() => state.rules.rules[0]?.kind).toBe("ask");
    expect(state.rules.rules[0]?.text).toBe("Posting to social media");

    await page.locator(`[data-testid="settings-rule-toggle-${ruleId}"]`).click();
    await expect.poll(() => state.rules.rules[0]?.enabled).toBe(false);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator(`[data-testid="settings-rule-delete-${ruleId}"]`).click();
    await expect.poll(() => state.rules.rules.length).toBe(0);
    await expect(page.locator('[data-testid="settings-rules-empty"]')).toBeVisible();
  });

  test("a failed save reports the error and leaves the rule as it was", async ({ page }) => {
    await mockProfileApi(page, { rules: { rules: [{ id: "r1", kind: "ask", text: "Booking travel", enabled: true }], plugins: {} } });
    // Registered last, so it is checked first: every PUT fails, GETs fall through.
    await page.route(
      (url) => url.pathname === "/api/config/rules",
      (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, json: { error: "disk full" } }) : route.fallback()),
    );
    await page.goto("/chat");
    await openTab(page, "rules");

    const toggle = page.locator('[data-testid="settings-rule-toggle-r1"]');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.locator('[data-testid="settings-rules-error"]')).toContainText("disk full");
    await expect(toggle).toBeChecked();
  });

  test("sets plugin permissions from the Manage view", async ({ page }) => {
    const { state } = await mockProfileApi(page);
    await page.goto("/chat");
    await openTab(page, "rules");

    await page.locator('[data-testid="settings-rules-plugins-open"]').click();
    await expect(page.locator('[data-testid="settings-plugin-permissions"]')).toBeVisible();

    await page.locator('[data-testid="settings-plugin-permission-generateImage-never"]').click();
    await expect.poll(() => state.rules.plugins.generateImage).toBe("never");
    await page.locator('[data-testid="settings-plugin-permission-mcp__github-ask"]').click();
    await expect.poll(() => state.rules.plugins.mcp__github).toBe("ask");

    // Back to Allow drops the entry — the file only records changes.
    await page.locator('[data-testid="settings-plugin-permission-generateImage-allow"]').click();
    await expect.poll(() => "generateImage" in state.rules.plugins).toBe(false);

    await page.locator('[data-testid="settings-plugin-permissions-back"]').click();
    await expect(page.locator('[data-testid="settings-rules-add"]')).toBeVisible();
  });
});
