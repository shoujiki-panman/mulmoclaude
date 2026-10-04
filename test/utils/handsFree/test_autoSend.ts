import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAutoSendReady, type AutoSendState } from "../../../src/utils/handsFree/autoSend.js";

const READY: AutoSendState = {
  enabled: true,
  voiceArmed: true,
  dictatedDraft: true,
  hasText: true,
  speaking: false,
  transcribing: false,
  agentRunning: false,
};

describe("isAutoSendReady", () => {
  it("is ready when the user has dictated something and gone quiet", () => {
    assert.equal(isAutoSendReady(READY), true);
  });

  const blockers: [keyof AutoSendState, boolean, string][] = [
    ["enabled", false, "auto-send is off in Settings"],
    ["voiceArmed", false, "the mic is not armed"],
    ["dictatedDraft", false, "the user edited the draft by hand"],
    ["hasText", false, "the draft is empty"],
    ["speaking", true, "the user is mid-sentence"],
    ["transcribing", true, "the last segment is still being transcribed"],
    ["agentRunning", true, "the agent is still answering"],
  ];

  for (const [field, value, reason] of blockers) {
    it(`is not ready when ${reason}`, () => {
      assert.equal(isAutoSendReady({ ...READY, [field]: value }), false);
    });
  }
});
