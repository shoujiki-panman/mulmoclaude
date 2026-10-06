import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askFirstPluginKeys, buildPersonalitySection, buildRulesSection } from "../../server/agent/assistantProfilePrompt.js";
import { withoutBlockedMcpServers, withoutBlockedPlugins } from "../../server/agent/pluginPermissions.js";
import { defaultPersonality, type Personality } from "../../src/types/personality.js";
import { DEFAULT_RULES, SAFETY_RULES, emptyRules, type AssistantRules } from "../../src/types/assistantRules.js";
import type { Role } from "../../src/config/roles.js";

function personalityWith(overrides: Partial<Personality>): Personality {
  return { ...defaultPersonality(), ...overrides };
}

describe("buildPersonalitySection", () => {
  it("adds nothing while everything is at its default", () => {
    assert.equal(buildPersonalitySection(defaultPersonality()), null);
  });

  it("describes only the settings that differ from the default", () => {
    const traits = { ...defaultPersonality().traits, emoji: "less" as const, formatting: "more" as const };
    const section = buildPersonalitySection(personalityWith({ tone: "candid", traits }));
    assert.ok(section !== null);
    assert.match(section, /^## Personality/);
    assert.match(section, /Style and tone: Candid/);
    assert.match(section, /Emoji: less — do not use emoji/);
    assert.match(section, /Headings and lists: more/);
    assert.doesNotMatch(section, /Warmth:/);
    assert.doesNotMatch(section, /Enthusiasm:/);
    assert.doesNotMatch(section, /Custom instructions/);
  });

  it("gives the assistant its name, and its avatar when there is one", () => {
    const section = buildPersonalitySection(personalityWith({ name: "たぬき", avatar: "🦝" }));
    assert.ok(section !== null);
    assert.ok(section.includes('the user calls you "たぬき" (shown with 🦝)'));
    assert.match(section, /MulmoClaude stays the name of the app/);
    const nameOnly = buildPersonalitySection(personalityWith({ name: "たぬき" }));
    assert.ok(nameOnly?.includes('the user calls you "たぬき". '));
  });

  it("adds no section for an avatar alone — it is only shown in the UI", () => {
    assert.equal(buildPersonalitySection(personalityWith({ avatar: "🦝" })), null);
  });

  it("carries custom instructions verbatim inside a delimited block", () => {
    const section = buildPersonalitySection(personalityWith({ customInstructions: "Call me Shu.\nAnswer in Japanese." }));
    assert.ok(section !== null);
    assert.match(section, /### Custom instructions/);
    assert.ok(section.includes("<custom_instructions>\nCall me Shu.\nAnswer in Japanese.\n</custom_instructions>"));
    assert.doesNotMatch(section, /Style and tone:/);
  });
});

describe("buildRulesSection", () => {
  const noTools = new Set<string>();

  it("always carries every built-in default rule", () => {
    const section = buildRulesSection(emptyRules(), noTools);
    assert.match(section, /^## Rules — when to act and when to ask first/);
    assert.match(section, /presentForm/);
    for (const rule of DEFAULT_RULES) assert.ok(section.includes(rule.prompt), `missing default rule ${rule.id}`);
    assert.doesNotMatch(section, /### The user's rules/);
    assert.doesNotMatch(section, /### Plugin permissions/);
  });

  it("explains the four modes, with a schedule the user set up counting as their say-so", () => {
    const section = buildRulesSection(emptyRules(), noTools);
    for (const mode of ["Take action without asking:", "Take action when the user says so:", "Ask before taking action:", "Hand off to the user:"]) {
      assert.ok(section.includes(`- ${mode}`), `mode ${mode}`);
    }
    assert.match(section, /in a skill, schedule or automation they set up/);
    assert.match(section, /every time, even when the user asked for it/);
  });

  it("keeps the safety rules in an Always block that nothing overrides", () => {
    const section = buildRulesSection(emptyRules(), noTools);
    const always = section.slice(section.indexOf("### Always"));
    for (const rule of SAFETY_RULES) assert.ok(always.includes(`- ${rule.prompt}`), `missing safety rule ${rule.id}`);
    assert.match(section, /Nothing overrides the rules under Always/);
  });

  it("points chat-driven changes at the manageAssistant tool", () => {
    const section = buildRulesSection(emptyRules(), noTools);
    assert.ok(section.includes("`config/rules.json`"));
    assert.ok(section.includes("`config/personality.json`"));
    assert.ok(section.includes("`mcp__mulmoclaude__manageAssistant`"));
  });

  it("lists enabled user rules under their mode and leaves disabled ones out", () => {
    const rules: AssistantRules = {
      rules: [
        { id: "a", kind: "ask", text: "Booking a restaurant", enabled: true },
        { id: "b", kind: "handoff", text: "Posting to X", enabled: true },
        { id: "c", kind: "allow", text: "Tidying artifacts/", enabled: true },
        { id: "d", kind: "requested", text: "Pushing to my repos", enabled: true },
        { id: "e", kind: "ask", text: "Switched off rule", enabled: false },
      ],
      plugins: {},
    };
    const section = buildRulesSection(rules, noTools);
    const userBlock = section.slice(section.indexOf("### The user's rules"));
    assert.ok(userBlock.includes("Take action without asking:\n- Tidying artifacts/"));
    assert.ok(userBlock.includes("Take action when the user says so (otherwise ask first):\n- Pushing to my repos"));
    assert.ok(userBlock.includes("Ask before taking action, every time:\n- Booking a restaurant"));
    assert.ok(userBlock.includes("Hand off to the user:\n- Posting to X"));
    assert.ok(!section.includes("Switched off rule"));
    // Mode order: most autonomous first.
    const positions = ["Tidying", "Pushing", "Booking", "Posting"].map((text) => userBlock.indexOf(text));
    assert.deepEqual(
      [...positions].sort((left, right) => left - right),
      positions,
    );
  });

  it("names ask-first plugins by their callable tool id", () => {
    const rules: AssistantRules = { rules: [], plugins: { generateImage: "ask", mcp__github: "ask", presentChart: "never" } };
    const section = buildRulesSection(rules, new Set(["generateImage", "presentChart"]));
    assert.match(section, /### Plugin permissions/);
    assert.match(section, /only when the user asked for what they do; otherwise ask first/);
    assert.ok(section.includes("`mcp__mulmoclaude__generateImage`"));
    assert.ok(section.includes("any tool of the `github` MCP server (`mcp__github__*`)"));
    assert.ok(!section.includes("presentChart"));
  });
});

describe("askFirstPluginKeys", () => {
  it("keeps MCP servers and only the MulmoClaude plugins active in this role", () => {
    const keys = askFirstPluginKeys(
      { generateImage: "ask", manageRecipes: "ask", mcp__notion: "ask", presentForm: "never" },
      new Set(["generateImage", "presentForm"]),
    );
    assert.deepEqual(keys, ["generateImage", "mcp__notion"]);
  });
});

describe("plugin permission enforcement", () => {
  const role: Role = { id: "general", name: "General", icon: "star", prompt: "", availablePlugins: ["presentForm", "generateImage", "presentChart"] };

  it("drops never plugins from the role and leaves the rest", () => {
    const filtered = withoutBlockedPlugins(role, { generateImage: "never", presentChart: "ask" });
    assert.deepEqual(filtered.availablePlugins, ["presentForm", "presentChart"]);
    assert.deepEqual(role.availablePlugins, ["presentForm", "generateImage", "presentChart"], "input role must not be mutated");
  });

  it("returns the same role object when nothing is blocked", () => {
    assert.equal(withoutBlockedPlugins(role, { presentChart: "ask" }), role);
  });

  it("drops never MCP servers by their mcp__ key", () => {
    const servers = { github: { type: "http" }, notion: { type: "http" } };
    assert.deepEqual(withoutBlockedMcpServers(servers, { mcp__github: "never", mcp__notion: "ask", notion: "never" }), { notion: { type: "http" } });
  });
});
