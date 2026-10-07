import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatPercent, formatScore, nearestLevel, roundTo2 } from "../src/format";
import type { ChoiceQuestion, ScoreQuestion } from "../src/schemas";
import { cellText, choiceBars, scoreBars } from "../src/viewModel";
import { QUESTIONS } from "./fixtures";

const [TEAM, URGENCY, IS_SPAM] = QUESTIONS;
const CHOICE: ChoiceQuestion = {
  id: "team",
  type: "choice",
  question: "?",
  options: [
    { id: "payments", description: "Payments" },
    { id: "frontend", description: "Frontend" },
    { id: "account", description: "Account" },
  ],
};
const SCORE: ScoreQuestion = { id: "urgency", type: "score", question: "?", levels: ["low", "medium", "high"] };

describe("format helpers", () => {
  it("rounds and formats probabilities and scores", () => {
    assert.equal(roundTo2(0.8734), 0.87);
    assert.equal(formatPercent(0.8734), "87%");
    assert.equal(formatScore(1.4567), "1.5");
  });

  it("clamps scores to the scale", () => {
    assert.equal(nearestLevel(["a", "b", "c"], 1.4), "b");
    assert.equal(nearestLevel(["a", "b", "c"], 7), "c");
    assert.equal(nearestLevel(["a", "b", "c"], -1), "a");
    assert.equal(nearestLevel([], 1), undefined);
  });
});

describe("cellText", () => {
  it("renders each answer type on one line", () => {
    assert.ok(TEAM && URGENCY && IS_SPAM);
    assert.equal(cellText(IS_SPAM, { type: "predicate", probability: 0.031 }), "3%");
    assert.equal(cellText(TEAM, { type: "choice", choice: "payments", probabilities: { payments: 0.91 } }), "payments · 91%");
    assert.equal(cellText(TEAM, { type: "choice", choice: "payments", probabilities: {} }), "payments");
    assert.equal(cellText(URGENCY, { type: "score", score: 1.62, probabilities: [] }), "Blocking revenue now (1.6)");
    assert.equal(cellText(URGENCY, undefined), "—");
  });
});

describe("choiceBars", () => {
  it("orders options by probability and highlights the choice", () => {
    const bars = choiceBars(CHOICE, { type: "choice", choice: "frontend", probabilities: { payments: 0.2, frontend: 0.7, account: 0.1 } });
    assert.deepEqual(
      bars.map((bar) => [bar.key, bar.value, bar.highlighted]),
      [
        ["frontend", 0.7, true],
        ["payments", 0.2, false],
        ["account", 0.1, false],
      ],
    );
  });

  it("uses null values when the API sent no distribution", () => {
    const bars = choiceBars(CHOICE, { type: "choice", choice: "account", probabilities: {} });
    assert.ok(bars.every((bar) => bar.value === null));
    assert.deepEqual(
      bars.filter((bar) => bar.highlighted).map((bar) => bar.key),
      ["account"],
    );
  });
});

describe("scoreBars", () => {
  it("keeps scale order and highlights the nearest level", () => {
    const bars = scoreBars(SCORE, { type: "score", score: 0.8, probabilities: [0.3, 0.6, 0.1] });
    assert.deepEqual(
      bars.map((bar) => [bar.label, bar.value, bar.highlighted]),
      [
        ["low", 0.3, false],
        ["medium", 0.6, true],
        ["high", 0.1, false],
      ],
    );
  });

  it("ignores a distribution whose length does not match the levels", () => {
    const bars = scoreBars(SCORE, { type: "score", score: 2, probabilities: [0.5, 0.5] });
    assert.ok(bars.every((bar) => bar.value === null));
  });
});
