import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapWithConcurrency, MAX_CONCURRENT_REQUESTS, PREVIEW_TEXT_CHARS, runDecisions, type RunDeps } from "../src/run";
import { DecideArgsSchema } from "../src/schemas";
import { fakeFetch, jsonResponse, memoryFileOps, OK_RESPONSE, QUESTIONS, sentBody, type RecordedCall } from "./fixtures";

const CONFIG = { apiKey: "sk-test", model: "decisions-1" };

function deps(respond: (call: RecordedCall) => Response | Promise<Response>, files: Record<string, Uint8Array> = {}): { deps: RunDeps; calls: RecordedCall[] } {
  const { fetch, calls } = fakeFetch(respond);
  let clock = 1000;
  const now = (): number => {
    clock += 5;
    return clock;
  };
  return { deps: { fetch, artifacts: memoryFileOps(files), config: CONFIG, now }, calls };
}

describe("mapWithConcurrency", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (delay, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delay));
      inFlight -= 1;
      return `${index}:${delay}`;
    });
    assert.deepEqual(results, ["0:30", "1:10", "2:20", "3:5", "4:15"]);
    assert.equal(peak, 2);
  });

  it("handles an empty list", async () => {
    assert.deepEqual(await mapWithConcurrency([], MAX_CONCURRENT_REQUESTS, async () => 1), []);
  });
});

describe("runDecisions", () => {
  it("judges every item against every question and times the run", async () => {
    const { deps: runDeps, calls } = deps(() => jsonResponse(OK_RESPONSE));
    const args = DecideArgsSchema.parse({
      title: "Triage",
      questions: QUESTIONS,
      items: [{ id: "t1", text: "blank checkout page" }, { text: "free crypto!!" }],
    });
    const data = await runDecisions(runDeps, args);
    assert.equal(calls.length, 2);
    assert.equal(data.title, "Triage");
    assert.equal(data.model, "decisions-1");
    assert.equal(data.elapsedMs, 5);
    assert.deepEqual(
      data.items.map((item) => item.id),
      ["t1", "item_2"],
    );
    assert.equal(data.items[0]?.answers?.team?.type, "choice");
  });

  it("records a failing item's error and keeps the others", async () => {
    const { deps: runDeps } = deps((call) => {
      const body = sentBody(call);
      const failing = typeof body === "object" && body !== null && "state" in body && body.state === "bad";
      return failing ? jsonResponse({ error: { message: "boom" } }, 500) : jsonResponse(OK_RESPONSE);
    });
    const args = DecideArgsSchema.parse({ questions: QUESTIONS, items: [{ text: "ok" }, { text: "bad" }, { text: "ok too" }] });
    const data = await runDecisions(runDeps, args);
    assert.equal(data.items[1]?.error, "Decisions API returned HTTP 500 — boom");
    assert.equal(data.items[1]?.answers, undefined);
    assert.ok(data.items[0]?.answers && data.items[2]?.answers);
  });

  it("turns an unreadable image into that item's error without calling the API", async () => {
    const { deps: runDeps, calls } = deps(() => jsonResponse(OK_RESPONSE));
    const args = DecideArgsSchema.parse({ questions: QUESTIONS, items: [{ image: "data/attachments/2026/10/a.png" }] });
    const data = await runDecisions(runDeps, args);
    assert.equal(calls.length, 0);
    assert.match(data.items[0]?.error ?? "", /copy the file under artifacts\/ first/);
  });

  it("sends artifacts/ images as data URLs", async () => {
    const { deps: runDeps, calls } = deps(() => jsonResponse(OK_RESPONSE), { "images/a.png": new Uint8Array([1, 2, 3]) });
    const args = DecideArgsSchema.parse({ questions: QUESTIONS, items: [{ text: "caption", image: "artifacts/images/a.png" }] });
    await runDecisions(runDeps, args);
    assert.deepEqual(sentBody(calls[0]), {
      model: "decisions-1",
      state: [
        { type: "input_text", text: "caption" },
        { type: "input_image", image_url: "data:image/png;base64,AQID" },
      ],
      questions: buildExpectedQuestions(),
    });
  });

  it("keeps only a slice of long texts in the result", async () => {
    const { deps: runDeps } = deps(() => jsonResponse(OK_RESPONSE));
    const args = DecideArgsSchema.parse({ questions: QUESTIONS, items: [{ text: "x".repeat(PREVIEW_TEXT_CHARS + 100) }] });
    const data = await runDecisions(runDeps, args);
    assert.equal(data.items[0]?.text?.length, PREVIEW_TEXT_CHARS);
  });
});

function buildExpectedQuestions(): unknown {
  return {
    team: {
      type: "choice",
      instructions: "Which team should own this ticket?",
      criteria: { payments: "Checkout, billing, payments", frontend: "Rendering, layout, browser" },
    },
    urgency: { type: "score", instructions: "How urgent is this?", criteria: ["Can wait", "This week", "Blocking revenue now"] },
    is_spam: { type: "predicate", instructions: "Is this spam?" },
  };
}
