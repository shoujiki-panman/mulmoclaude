import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DecideArgsSchema, describeIssues, findDuplicateIds, resolveItemId, type QuestionSpec } from "../src/schemas";
import { MAX_ITEMS, MAX_QUESTIONS } from "../src/limits";
import { QUESTIONS } from "./fixtures";

const validArgs = { questions: QUESTIONS, items: [{ id: "t1", text: "Checkout shows a blank page" }] };

function issuesOf(args: unknown): string {
  const parsed = DecideArgsSchema.safeParse(args);
  assert.equal(parsed.success, false, "expected the args to be rejected");
  return parsed.success ? "" : describeIssues(parsed.error.issues);
}

describe("DecideArgsSchema", () => {
  it("accepts all three question types and text / image items", () => {
    const parsed = DecideArgsSchema.parse({
      ...validArgs,
      items: [{ text: "a" }, { image: "https://example.com/a.png" }, { text: "b", image: "artifacts/x.png" }],
    });
    assert.equal(parsed.questions.length, 3);
    assert.equal(parsed.items.length, 3);
  });

  it("rejects an item with neither text nor image", () => {
    assert.match(issuesOf({ ...validArgs, items: [{ id: "empty" }] }), /needs `text`, `image`, or both/);
  });

  it("rejects ids that are not snake_case", () => {
    assert.match(issuesOf({ ...validArgs, questions: [{ id: "Team-Owner", type: "predicate", question: "?" }] }), /questions\.0\.id: ids must be snake_case/);
  });

  // The size messages come from zod's English locale, which src/schemas.ts
  // registers explicitly because bundling drops zod's own registration.
  it("enforces the option and level counts with a message that names the bound", () => {
    const oneOption = { id: "team", type: "choice", question: "?", options: [{ id: "only", description: "x" }] };
    assert.match(issuesOf({ ...validArgs, questions: [oneOption] }), /questions\.0\.options: Too small: expected array to have >=2 items/);
    const oneLevel = { id: "urgency", type: "score", question: "?", levels: ["low"] };
    assert.match(issuesOf({ ...validArgs, questions: [oneLevel] }), /questions\.0\.levels: Too small/);
  });

  it("enforces the question and item caps", () => {
    const tooManyQuestions = Array.from({ length: MAX_QUESTIONS + 1 }, (_, index) => ({ id: `q${index}`, type: "predicate", question: "?" }));
    assert.match(issuesOf({ ...validArgs, questions: tooManyQuestions }), /questions: Too big: expected array to have <=6 items/);
    const tooManyItems = Array.from({ length: MAX_ITEMS + 1 }, () => ({ text: "x" }));
    assert.match(issuesOf({ ...validArgs, items: tooManyItems }), /items: Too big/);
  });

  it("rejects an unknown question type", () => {
    assert.match(issuesOf({ ...validArgs, questions: [{ id: "q", type: "ranking", question: "?" }] }), /questions\.0/);
  });

  it("reports duplicate ids", () => {
    const duplicateQuestion = { id: "team", type: "predicate", question: "again?" };
    assert.match(issuesOf({ ...validArgs, questions: [...QUESTIONS, duplicateQuestion] }), /duplicate question id "team"/);
  });
});

describe("findDuplicateIds", () => {
  it("finds repeated option ids within a choice question", () => {
    const question: QuestionSpec = {
      id: "team",
      type: "choice",
      question: "?",
      options: [
        { id: "a", description: "x" },
        { id: "a", description: "y" },
      ],
    };
    assert.deepEqual(findDuplicateIds({ questions: [question], items: [] }), ['duplicate option id "a" in question "team"']);
  });

  it("compares item ids after defaulting, so an explicit item_2 collides with the second unnamed item", () => {
    assert.deepEqual(findDuplicateIds({ questions: [], items: [{ id: "item_2" }, {}] }), ['duplicate item id "item_2"']);
  });
});

describe("resolveItemId", () => {
  it("keeps the caller's id, else numbers from 1", () => {
    assert.equal(resolveItemId({ id: "t9" }, 0), "t9");
    assert.equal(resolveItemId({}, 2), "item_3");
  });
});
