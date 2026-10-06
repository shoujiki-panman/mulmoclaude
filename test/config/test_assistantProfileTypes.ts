import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_INSTRUCTIONS_MAX_CHARS, defaultPersonality, isDefaultPersonality, normalizePersonality } from "../../src/types/personality.js";
import {
  DEFAULT_RULES,
  MAX_CUSTOM_RULES,
  RULE_KINDS,
  RULE_TEXT_MAX_CHARS,
  normalizePluginPermissions,
  normalizeRuleList,
  normalizeRules,
  pluginPermissionFor,
} from "../../src/types/assistantRules.js";
import enMessages from "../../src/lang/en.js";

describe("normalizePersonality", () => {
  it("returns all defaults for non-object input", () => {
    for (const input of [null, undefined, 42, "x", []]) {
      assert.deepEqual(normalizePersonality(input), defaultPersonality());
    }
  });

  it("keeps valid values", () => {
    const input = {
      tone: "candid",
      traits: { warmth: "more", enthusiasm: "less", formatting: "default", emoji: "less" },
      customInstructions: "Call me Shu.",
    };
    assert.deepEqual(normalizePersonality(input), input);
  });

  it("falls back field by field, so one bad value keeps the rest", () => {
    const result = normalizePersonality({ tone: "pirate", traits: { warmth: "loads", emoji: "more" }, customInstructions: 7 });
    assert.deepEqual(result, {
      tone: "default",
      traits: { warmth: "default", enthusiasm: "default", formatting: "default", emoji: "more" },
      customInstructions: "",
    });
  });

  it("trims and caps custom instructions instead of rejecting them", () => {
    const long = `  ${"a".repeat(CUSTOM_INSTRUCTIONS_MAX_CHARS + 50)}  `;
    assert.equal(normalizePersonality({ customInstructions: long }).customInstructions.length, CUSTOM_INSTRUCTIONS_MAX_CHARS);
  });

  it("hands out a fresh default object each time", () => {
    const first = defaultPersonality();
    first.traits.emoji = "more";
    assert.equal(defaultPersonality().traits.emoji, "default");
  });
});

describe("isDefaultPersonality", () => {
  it("is true only when nothing would reach the prompt", () => {
    assert.equal(isDefaultPersonality(defaultPersonality()), true);
    assert.equal(isDefaultPersonality({ ...defaultPersonality(), tone: "nerdy" }), false);
    assert.equal(isDefaultPersonality({ ...defaultPersonality(), customInstructions: "hi" }), false);
    const traits = { ...defaultPersonality().traits, formatting: "less" as const };
    assert.equal(isDefaultPersonality({ ...defaultPersonality(), traits }), false);
  });
});

describe("normalizeRuleList", () => {
  it("drops entries without a known kind or any text", () => {
    const rules = normalizeRuleList([
      { id: "ok", kind: "ask", text: "Ask before emailing", enabled: true },
      { id: "bad-kind", kind: "maybe", text: "x" },
      { id: "no-text", kind: "never", text: "   " },
      "not an object",
    ]);
    assert.deepEqual(rules, [{ id: "ok", kind: "ask", text: "Ask before emailing", enabled: true }]);
  });

  it("defaults enabled to true and only an explicit false switches it off", () => {
    const rules = normalizeRuleList([
      { id: "a", kind: "allow", text: "one" },
      { id: "b", kind: "allow", text: "two", enabled: false },
      { id: "c", kind: "allow", text: "three", enabled: "no" },
    ]);
    assert.deepEqual(
      rules.map((rule) => rule.enabled),
      [true, false, true],
    );
  });

  it("gives missing, malformed and duplicate ids a unique fallback", () => {
    const rules = normalizeRuleList([
      { kind: "ask", text: "no id" },
      { id: "same", kind: "ask", text: "first" },
      { id: "same", kind: "ask", text: "second" },
      { id: "has spaces", kind: "ask", text: "bad id" },
    ]);
    const ids = rules.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids[1], "same");
    assert.ok(ids.every((ruleId) => /^[A-Za-z0-9_-]+$/.test(ruleId)));
  });

  it("caps text length and the number of rules", () => {
    const many = Array.from({ length: MAX_CUSTOM_RULES + 5 }, (_unused, index) => ({
      id: `r${index}`,
      kind: "ask",
      text: "x".repeat(RULE_TEXT_MAX_CHARS + 10),
    }));
    const rules = normalizeRuleList(many);
    assert.equal(rules.length, MAX_CUSTOM_RULES);
    assert.equal(rules[0]?.text.length, RULE_TEXT_MAX_CHARS);
    assert.equal(rules[0]?.id, "r0");
  });
});

describe("normalizePluginPermissions / pluginPermissionFor", () => {
  it("keeps ask / never, drops allow (the default) and junk", () => {
    const plugins = normalizePluginPermissions({
      generateImage: "never",
      mcp__github: "ask",
      presentForm: "allow",
      weird: "sometimes",
      "bad key!": "never",
    });
    assert.deepEqual(plugins, { generateImage: "never", mcp__github: "ask" });
  });

  it("reads absent keys — including Object.prototype names — as allow", () => {
    const plugins = normalizePluginPermissions({ generateImage: "never" });
    assert.equal(pluginPermissionFor(plugins, "generateImage"), "never");
    assert.equal(pluginPermissionFor(plugins, "presentForm"), "allow");
    assert.equal(pluginPermissionFor(plugins, "constructor"), "allow");
    assert.equal(pluginPermissionFor(plugins, "toString"), "allow");
  });

  it("normalizeRules tolerates any input", () => {
    assert.deepEqual(normalizeRules(null), { rules: [], plugins: {} });
    assert.deepEqual(normalizeRules({ rules: "nope", plugins: [] }), { rules: [], plugins: {} });
  });
});

describe("DEFAULT_RULES", () => {
  it("covers every kind, with unique ids", () => {
    const ids = DEFAULT_RULES.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const kind of RULE_KINDS) {
      assert.ok(
        DEFAULT_RULES.some((rule) => rule.kind === kind),
        `no default rule of kind ${kind}`,
      );
    }
  });

  it("has a settings-tab translation for every default rule", () => {
    const { defaults }: { defaults: Record<string, string> } = enMessages.settingsRulesTab;
    for (const rule of DEFAULT_RULES) {
      assert.equal(typeof defaults[rule.id], "string", `missing settingsRulesTab.defaults.${rule.id}`);
    }
    assert.deepEqual(Object.keys(defaults).sort(), DEFAULT_RULES.map((rule) => rule.id).sort());
  });
});
