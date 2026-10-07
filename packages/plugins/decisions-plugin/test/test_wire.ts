import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWireRequest, parseWireResponse, toWireQuestion } from "../src/wire";
import { OK_RESPONSE, QUESTIONS } from "./fixtures";

describe("toWireQuestion / buildWireRequest", () => {
  it("maps each question type to instructions + criteria", () => {
    const [team, urgency, isSpam] = QUESTIONS;
    assert.ok(team && urgency && isSpam);
    assert.deepEqual(toWireQuestion(team), {
      type: "choice",
      instructions: "Which team should own this ticket?",
      criteria: { payments: "Checkout, billing, payments", frontend: "Rendering, layout, browser" },
    });
    assert.deepEqual(toWireQuestion(urgency), {
      type: "score",
      instructions: "How urgent is this?",
      criteria: ["Can wait", "This week", "Blocking revenue now"],
    });
    assert.deepEqual(toWireQuestion(isSpam), { type: "predicate", instructions: "Is this spam?" });
  });

  it("keys questions by id and sends text-only state as a string", () => {
    const request = buildWireRequest({ model: "decisions-1", questions: QUESTIONS, text: "hello" });
    assert.equal(request.model, "decisions-1");
    assert.equal(request.state, "hello");
    assert.deepEqual(Object.keys(request.questions), ["team", "urgency", "is_spam"]);
  });

  it("sends content parts when an image is attached, text first", () => {
    const withText = buildWireRequest({ model: "m", questions: QUESTIONS, text: "caption", imageUrl: "https://example.com/a.png" });
    assert.deepEqual(withText.state, [
      { type: "input_text", text: "caption" },
      { type: "input_image", image_url: "https://example.com/a.png" },
    ]);
    const imageOnly = buildWireRequest({ model: "m", questions: QUESTIONS, imageUrl: "data:image/png;base64,AA==" });
    assert.deepEqual(imageOnly.state, [{ type: "input_image", image_url: "data:image/png;base64,AA==" }]);
  });
});

describe("parseWireResponse", () => {
  it("parses one answer per question", () => {
    const answers = parseWireResponse(OK_RESPONSE, QUESTIONS);
    assert.deepEqual(answers.team, { type: "choice", choice: "payments", probabilities: { payments: 0.91, frontend: 0.09 }, confidence: 0.88 });
    assert.deepEqual(answers.urgency, { type: "score", score: 1.6, probabilities: [0.1, 0.2, 0.7], confidence: 0.8 });
    assert.deepEqual(answers.is_spam, { type: "predicate", probability: 0.03 });
  });

  it("names the top-level keys when the shape is not recognised", () => {
    assert.throws(() => parseWireResponse({ decisions: {}, id: "x" }, QUESTIONS), /unrecognised Decisions API response \(keys: decisions, id\)/);
    assert.throws(() => parseWireResponse(null, QUESTIONS), /\(a null\)/);
  });

  it("fails when a question has no answer", () => {
    const answers = { team: OK_RESPONSE.answers.team, urgency: OK_RESPONSE.answers.urgency };
    assert.throws(() => parseWireResponse({ answers }, QUESTIONS), /no answer for question "is_spam"/);
  });

  it("rejects a choice outside the declared options", () => {
    const answers = { ...OK_RESPONSE.answers, team: { choice: "legal" } };
    assert.throws(() => parseWireResponse({ answers }, QUESTIONS), /question "team": unexpected choice "legal"/);
  });

  it("rejects a predicate probability outside 0–1", () => {
    const answers = { ...OK_RESPONSE.answers, is_spam: { probability: 1.4 } };
    assert.throws(() => parseWireResponse({ answers }, QUESTIONS), /question "is_spam": expected a probability/);
  });

  it("drops an unusable distribution instead of misaligning it", () => {
    const answers = {
      ...OK_RESPONSE.answers,
      team: { choice: "frontend", probabilities: { payments: "high", frontend: 0.7 } },
      urgency: { score: 2, probabilities: [0.1, "x", 0.9] },
    };
    const parsed = parseWireResponse({ answers }, QUESTIONS);
    assert.deepEqual(parsed.team, { type: "choice", choice: "frontend", probabilities: { frontend: 0.7 } });
    assert.deepEqual(parsed.urgency, { type: "score", score: 2, probabilities: [] });
  });
});
