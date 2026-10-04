import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HANDS_FREE_PREFS, HANDS_FREE_STORAGE_KEYS, parseStoredHandsFreeFlag, serializeHandsFreeFlag } from "../../../src/utils/handsFree/prefs.js";

describe("hands-free prefs", () => {
  it("defaults to off when nothing is stored", () => {
    assert.equal(parseStoredHandsFreeFlag(null), false);
    assert.equal(parseStoredHandsFreeFlag(""), false);
  });

  it("round-trips both values", () => {
    assert.equal(parseStoredHandsFreeFlag(serializeHandsFreeFlag(true)), true);
    assert.equal(parseStoredHandsFreeFlag(serializeHandsFreeFlag(false)), false);
  });

  it("accepts a hand-written 'true' and rejects anything else", () => {
    assert.equal(parseStoredHandsFreeFlag("true"), true);
    assert.equal(parseStoredHandsFreeFlag("yes"), false);
  });

  it("gives every pref its own storage key", () => {
    const keys = HANDS_FREE_PREFS.map((pref) => HANDS_FREE_STORAGE_KEYS[pref]);
    assert.equal(new Set(keys).size, HANDS_FREE_PREFS.length);
  });
});
