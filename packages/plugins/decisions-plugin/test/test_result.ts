import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toToolResult } from "../src/index";
import { summariseForLlm } from "../src/summary";
import type { DecisionsData, ItemResult } from "../src/types";
import { parseWireResponse } from "../src/wire";
import { OK_RESPONSE, QUESTIONS } from "./fixtures";

const ANSWERED: ItemResult = { id: "t1", text: "blank checkout page", answers: parseWireResponse(OK_RESPONSE, QUESTIONS) };
const FAILED: ItemResult = { id: "t2", text: "?", error: "Decisions API returned HTTP 500 — boom" };

function dataWith(items: ItemResult[]): DecisionsData {
  return { title: "Triage", model: "decisions-1", questions: QUESTIONS, items, elapsedMs: 412 };
}

describe("summariseForLlm", () => {
  it("gives a header and one compact JSON line per item", () => {
    const [header, first, second] = summariseForLlm(dataWith([ANSWERED, FAILED])).split("\n");
    assert.match(header ?? "", /^Decisions API \(decisions-1\): 2 item\(s\) × 3 question\(s\) in 412 ms, 1 failed\./);
    assert.deepEqual(JSON.parse(first ?? ""), {
      id: "t1",
      team: { choice: "payments", p: 0.91, confidence: 0.88 },
      urgency: { score: 1.6, level: "Blocking revenue now", confidence: 0.8 },
      is_spam: { p: 0.03 },
    });
    assert.deepEqual(JSON.parse(second ?? ""), { id: "t2", error: "Decisions API returned HTTP 500 — boom" });
  });
});

describe("toToolResult", () => {
  it("renders a card when at least one item was answered", () => {
    const result = toToolResult(dataWith([ANSWERED, FAILED]));
    assert.ok("data" in result);
    assert.equal(result.title, "Triage");
    assert.equal(result.data.items.length, 2);
    assert.match(result.message, /1 failed/);
  });

  it("returns instructions only — no card — when every call failed", () => {
    const result = toToolResult(dataWith([FAILED]));
    assert.deepEqual(result, {
      instructions: "Every Decisions API call failed, so there is nothing to show. First error: Decisions API returned HTTP 500 — boom",
    });
  });

  it("omits the title when the caller gave none", () => {
    const result = toToolResult({ model: "decisions-1", questions: QUESTIONS, items: [ANSWERED], elapsedMs: 1 });
    assert.ok("data" in result);
    assert.equal("title" in result, false);
  });
});
