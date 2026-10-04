import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolResultComplete } from "gui-chat-protocol/vue";
import { lastAssistantReplyText } from "../../../src/utils/session/lastAssistantReply.js";

let counter = 0;

function text(role: "user" | "assistant" | "system" | undefined, body: string): ToolResultComplete {
  counter += 1;
  return { uuid: `t${counter}`, toolName: "text-response", message: body, data: role === undefined ? { text: body } : { text: body, role } };
}

function tool(name: string): ToolResultComplete {
  counter += 1;
  return { uuid: `r${counter}`, toolName: name, message: "", data: {} };
}

describe("lastAssistantReplyText", () => {
  it("returns the newest assistant text of the run", () => {
    const results = [text("user", "Q"), text("assistant", "first"), tool("presentChart"), text("assistant", "final")];
    assert.equal(lastAssistantReplyText(results, 1), "final");
  });

  it("skips a trailing tool result to find the prose before it", () => {
    const results = [text("user", "Q"), text("assistant", "Here is the chart."), tool("presentChart")];
    assert.equal(lastAssistantReplyText(results, 1), "Here is the chart.");
  });

  it("never reaches back past the run start into an earlier turn", () => {
    const results = [text("assistant", "old answer"), text("user", "Q"), tool("presentChart")];
    assert.equal(lastAssistantReplyText(results, 2), null);
  });

  it("treats a text card without a role as the assistant's", () => {
    assert.equal(lastAssistantReplyText([text(undefined, "legacy")], 0), "legacy");
  });

  it("ignores user and system cards and whitespace-only text", () => {
    const results = [text("system", "note"), text("assistant", "   "), text("user", "echo")];
    assert.equal(lastAssistantReplyText(results, 0), null);
  });

  it("clamps a negative start index", () => {
    assert.equal(lastAssistantReplyText([text("assistant", "only")], -3), "only");
  });
});
