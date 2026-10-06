import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolResultComplete } from "gui-chat-protocol/vue";
import { speakerTitle } from "../../src/utils/tools/speakerTitle.js";

function textResult(role: "user" | "assistant"): ToolResultComplete {
  return { uuid: "u1", toolName: "text-response", message: "hi", title: role === "user" ? "You" : "Assistant", data: { text: "hi", role } };
}

const tanuki = { name: "たぬき", avatar: "🦝" };

describe("speakerTitle", () => {
  it("heads an assistant reply with the name, avatar first", () => {
    assert.equal(speakerTitle(textResult("assistant"), tanuki), "🦝 たぬき");
    assert.equal(speakerTitle(textResult("assistant"), { name: "たぬき", avatar: "" }), "たぬき");
  });

  it("keeps the original title for the user's own messages and when no name is set", () => {
    assert.equal(speakerTitle(textResult("user"), tanuki), "You");
    assert.equal(speakerTitle(textResult("assistant"), { name: "", avatar: "🦝" }), "Assistant");
  });

  it("leaves other tool results alone", () => {
    const chart: ToolResultComplete = { uuid: "c1", toolName: "presentChart", message: "", title: "Sales", data: {} };
    assert.equal(speakerTitle(chart, tanuki), "Sales");
  });
});
