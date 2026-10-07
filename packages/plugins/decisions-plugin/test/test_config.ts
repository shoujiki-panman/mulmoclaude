import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODEL, missingKeyResponse, readConfig } from "../src/config";

describe("readConfig", () => {
  it("is null without a usable OPENAI_API_KEY", () => {
    assert.equal(readConfig({}), null);
    assert.equal(readConfig({ OPENAI_API_KEY: "   " }), null);
  });

  it("defaults the model and honours a non-blank override", () => {
    assert.deepEqual(readConfig({ OPENAI_API_KEY: " sk-test " }), { apiKey: "sk-test", model: DEFAULT_MODEL });
    assert.deepEqual(readConfig({ OPENAI_API_KEY: "sk-test", MULMOCLAUDE_DECISIONS_MODEL: "decisions-latest" }), {
      apiKey: "sk-test",
      model: "decisions-latest",
    });
    assert.deepEqual(readConfig({ OPENAI_API_KEY: "sk-test", MULMOCLAUDE_DECISIONS_MODEL: "" }), { apiKey: "sk-test", model: DEFAULT_MODEL });
  });
});

describe("missingKeyResponse", () => {
  it("is instructions only, so nothing is pushed to the canvas", () => {
    assert.deepEqual(Object.keys(missingKeyResponse()), ["instructions"]);
  });

  it("points at .env and forbids asking for the key in chat", () => {
    const { instructions } = missingKeyResponse();
    assert.match(instructions, /OPENAI_API_KEY/);
    assert.match(instructions, /\.env/);
    assert.match(instructions, /Never ask the user to paste the key/);
  });
});
