import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { manageAssistantHandler, makeManageAssistantTool, type ManageAssistantDeps } from "../../server/agent/mcp-tools/manageAssistant.js";
import { mcpTools } from "../../server/agent/mcp-tools/index.js";
import { listRoleGatedToolNames, getActiveToolDescriptors } from "../../server/agent/activeTools.js";
import { defaultPersonality, normalizePersonality, type Personality } from "../../src/types/personality.js";
import { emptyRules, normalizeRules, type AssistantRules } from "../../src/types/assistantRules.js";

// In-memory stand-ins for the two config files, normalising on write the
// way the real `*-io` modules do.
function makeDeps(): { deps: ManageAssistantDeps; state: { personality: Personality; rules: AssistantRules; published: string[] } } {
  const state = { personality: defaultPersonality(), rules: emptyRules(), published: [] as string[] };
  const deps: ManageAssistantDeps = {
    readPersonality: async () => state.personality,
    writePersonality: async (value) => {
      state.personality = normalizePersonality(value);
      return state.personality;
    },
    readRules: async () => state.rules,
    writeRules: async (value) => {
      state.rules = normalizeRules(value);
      return state.rules;
    },
    publishChange: (relPath) => {
      state.published.push(relPath);
    },
  };
  return { deps, state };
}

describe("manageAssistant — personality", () => {
  let harness: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    harness = makeDeps();
  });

  it("applies a partial update, persists it and announces the file change", async () => {
    const reply = await manageAssistantHandler(harness.deps, {
      action: "updatePersonality",
      personality: { name: "たぬき", avatar: "🦝", appendInstructions: "Speak as a cheerful tanuki." },
    });
    const parsed = JSON.parse(reply) as { ok: boolean; personality: Personality };
    assert.equal(parsed.ok, true);
    assert.equal(harness.state.personality.name, "たぬき");
    assert.equal(harness.state.personality.avatar, "🦝");
    assert.equal(harness.state.personality.customInstructions, "Speak as a cheerful tanuki.");
    assert.equal(harness.state.personality.tone, "default", "fields the patch left out stay put");
    assert.deepEqual(harness.state.published, ["config/personality.json"]);
  });

  it("appends to existing instructions rather than replacing them", async () => {
    harness.state.personality = { ...defaultPersonality(), customInstructions: "Call me Shu." };
    await manageAssistantHandler(harness.deps, { action: "updatePersonality", personality: { appendInstructions: "End sentences with ぽん." } });
    assert.equal(harness.state.personality.customInstructions, "Call me Shu.\nEnd sentences with ぽん.");
  });

  it("refuses invalid values and writes nothing", async () => {
    const reply = await manageAssistantHandler(harness.deps, { action: "updatePersonality", personality: { tone: "pirate", traits: { emoji: "tons" } } });
    assert.match(reply, /^manageAssistant: invalid value for tone, traits\.emoji/);
    assert.deepEqual(harness.state.personality, defaultPersonality());
    assert.deepEqual(harness.state.published, []);
  });

  it("requires a personality object", async () => {
    assert.match(await manageAssistantHandler(harness.deps, { action: "updatePersonality" }), /`personality`.*is required/);
  });

  it("get returns the personality and the rules", async () => {
    harness.state.personality = { ...defaultPersonality(), name: "たぬき" };
    const parsed = JSON.parse(await manageAssistantHandler(harness.deps, { action: "get" })) as { personality: Personality; rules: unknown[] };
    assert.equal(parsed.personality.name, "たぬき");
    assert.deepEqual(parsed.rules, []);
  });
});

describe("manageAssistant — rules", () => {
  let harness: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    harness = makeDeps();
  });

  it("adds an enabled rule with a fresh id and keeps the plugin permissions", async () => {
    harness.state.rules = { rules: [], plugins: { generateImage: "never" } };
    const reply = JSON.parse(await manageAssistantHandler(harness.deps, { action: "addRule", rule: { kind: "ask", text: "  Sending email  " } })) as {
      rule: { id: string };
    };
    assert.equal(harness.state.rules.rules.length, 1);
    assert.deepEqual(harness.state.rules.rules[0], { id: reply.rule.id, kind: "ask", text: "Sending email", enabled: true });
    assert.deepEqual(harness.state.rules.plugins, { generateImage: "never" });
    assert.deepEqual(harness.state.published, ["config/rules.json"]);
  });

  it("rejects a bad kind or empty text", async () => {
    assert.match(await manageAssistantHandler(harness.deps, { action: "addRule", rule: { kind: "maybe", text: "x" } }), /rule\.kind must be one of/);
    assert.match(await manageAssistantHandler(harness.deps, { action: "addRule", rule: { kind: "never", text: "  " } }), /non-empty/);
    assert.equal(harness.state.rules.rules.length, 0);
  });

  it("removes a rule by id and reports an unknown id", async () => {
    harness.state.rules = { rules: [{ id: "r1", kind: "never", text: "Posting", enabled: true }], plugins: {} };
    assert.match(await manageAssistantHandler(harness.deps, { action: "removeRule", ruleId: "nope" }), /no rule with id "nope"/);
    const reply = JSON.parse(await manageAssistantHandler(harness.deps, { action: "removeRule", ruleId: "r1" })) as { remaining: number };
    assert.equal(reply.remaining, 0);
    assert.deepEqual(harness.state.rules.rules, []);
  });

  it("rejects an unknown action", async () => {
    assert.match(await manageAssistantHandler(harness.deps, { action: "explode" }), /`action` must be one of get \| updatePersonality/);
  });
});

describe("manageAssistant — registration", () => {
  it("is offered to every role, and so is not a plugin a permission can withhold", () => {
    const tool = mcpTools.find((candidate) => candidate.definition.name === "manageAssistant");
    assert.ok(tool, "registered in mcpTools");
    assert.equal(tool.alwaysActive, true);
    const bareRole = { id: "bare", name: "Bare", icon: "star", prompt: "", availablePlugins: [] };
    assert.ok(getActiveToolDescriptors(bareRole).some((descriptor) => descriptor.name === "manageAssistant"));
    assert.ok(!listRoleGatedToolNames().includes("manageAssistant"));
  });

  it("keeps its schema's enums in step with the shared constants", () => {
    const tool = makeManageAssistantTool(makeDeps().deps);
    const schema = JSON.stringify(tool.definition.inputSchema);
    for (const value of ["updatePersonality", "addRule", "removeRule", "candid", "less", "never"]) {
      assert.ok(schema.includes(`"${value}"`), `schema mentions ${value}`);
    }
  });
});
