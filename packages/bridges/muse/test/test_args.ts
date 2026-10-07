import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_FILES, parseAskArgs } from "../src/args.ts";
import { DEFAULT_CHAT_ID } from "../src/config.ts";

describe("parseAskArgs", () => {
  it("joins the words of an unquoted question", () => {
    assert.deepEqual(parseAskArgs(["is", "this", "joint", "OK?"]), {
      ok: true,
      value: { chatId: DEFAULT_CHAT_ID, files: [], question: "is this joint OK?" },
    });
  });

  it("reads the question from stdin for a lone -", () => {
    const parsed = parseAskArgs(["--file", "photos/a.jpg", "-"]);
    assert.deepEqual(parsed, { ok: true, value: { chatId: DEFAULT_CHAT_ID, files: ["photos/a.jpg"], question: null } });
  });

  it("takes a conversation id and several files", () => {
    const parsed = parseAskArgs(["--chat", " bench ", "--file", "a.png", "--file", "b.pdf", "what", "next?"]);
    assert.deepEqual(parsed, { ok: true, value: { chatId: "bench", files: ["a.png", "b.pdf"], question: "what next?" } });
  });

  it("keeps a question that starts with a dash after --", () => {
    const parsed = parseAskArgs(["--", "-5V", "rail?"]);
    assert.equal(parsed.ok && parsed.value.question, "-5V rail?");
  });

  it("rejects a missing question, a blank chat id, too many files and unknown options", () => {
    assert.equal(parseAskArgs([]).ok, false);
    assert.equal(parseAskArgs(["--chat", " ", "hi"]).ok, false);
    const files = Array.from({ length: MAX_FILES + 1 }, (_, index) => ["--file", `${index}.jpg`]).flat();
    assert.equal(parseAskArgs([...files, "hi"]).ok, false);
    assert.equal(parseAskArgs(["--verbose", "hi"]).ok, false);
  });
});
