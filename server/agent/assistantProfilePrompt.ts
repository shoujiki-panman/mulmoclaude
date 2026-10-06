// System-prompt sections for the assistant profile the user sets in
// Settings → Personality and Settings → Rules. Pure builders: the
// caller loads `config/personality.json` / `config/rules.json` (see
// `buildFullSystemPrompt`) and passes the normalised values in, so
// prompt assembly stays synchronous and testable.
//
// The personality section disappears entirely while everything is at
// its default, so a user who never opens the tab gets the same prompt
// as before. The rules section is always present: the built-in default
// rules are what lets the assistant tell "just do it" from "ask first".

import type { Personality, PersonalityTrait, TonePreset, TraitLevel } from "../../src/types/personality.js";
import { PERSONALITY_TRAITS } from "../../src/types/personality.js";
import type { AssistantRule, AssistantRules, DefaultRule, RuleKind } from "../../src/types/assistantRules.js";
import { DEFAULT_RULES, MCP_SERVER_PERMISSION_PREFIX } from "../../src/types/assistantRules.js";
import { MCP_SERVER_ID } from "./activeTools.js";
import { WORKSPACE_FILES } from "../workspace/paths.js";

const TONE_PROMPTS: Record<Exclude<TonePreset, "default">, string> = {
  professional: "Professional — polished and precise: businesslike wording, no slang, no jokes.",
  friendly: "Friendly — warm and conversational, like a helpful friend; casual phrasing is fine.",
  candid: "Candid — direct and honest: give your real assessment, point out problems and disagree when warranted, without sugar-coating.",
  quirky: "Quirky — playful and imaginative: light humour and unexpected turns of phrase are welcome when they don't get in the way.",
  efficient: "Efficient — as short as possible: lead with the answer and skip pleasantries, preamble and recaps.",
  nerdy: "Nerdy — curious and delighted by detail: explain how things work and share interesting background, with precise terms.",
  cynical: "Cynical — dry, sardonic wit and a little world-weary, but still genuinely helpful and accurate.",
};

const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  warmth: "Warmth",
  enthusiasm: "Enthusiasm",
  formatting: "Headings and lists",
  emoji: "Emoji",
};

const TRAIT_PROMPTS: Record<PersonalityTrait, Record<Exclude<TraitLevel, "default">, string>> = {
  warmth: {
    more: "more — be warm and caring: acknowledge the user's feelings and effort, and be encouraging.",
    less: "less — keep an even, neutral tone: no emotional language or reassurance.",
  },
  enthusiasm: {
    more: "more — be upbeat and energetic, and show real excitement where it fits.",
    less: "less — stay calm and understated: no exclamation marks, hype or superlatives.",
  },
  formatting: {
    more: "more — structure replies with headings and bulleted or numbered lists whenever that makes them easier to scan.",
    less: "less — write in flowing paragraphs; use headings or lists only when the content truly needs them, such as steps to follow.",
  },
  emoji: {
    more: "more — use emoji freely where they add warmth or clarity.",
    less: "less — do not use emoji.",
  },
};

const PERSONALITY_INTRO =
  "The user chose how you should come across (Settings → Personality). Apply it to your chat replies in every role; " +
  "where it differs from the general style guidance above, follow it. It shapes tone and formatting only — never the " +
  "accuracy or completeness of what you say — and it does not apply to documents, code or other output the user asks you to produce.";

// The user named the assistant (say, "たぬき") — it should answer to that
// name, while the product it runs in keeps being MulmoClaude.
function nameLine(personality: Personality): string | null {
  if (personality.name.length === 0) return null;
  const avatar = personality.avatar.length > 0 ? ` (shown with ${personality.avatar})` : "";
  return `- Name: the user calls you ${JSON.stringify(personality.name)}${avatar}. Introduce and refer to yourself by this name; MulmoClaude stays the name of the app.`;
}

function personalityLines(personality: Personality): string[] {
  const lines: string[] = [];
  const name = nameLine(personality);
  if (name !== null) lines.push(name);
  if (personality.tone !== "default") lines.push(`- Style and tone: ${TONE_PROMPTS[personality.tone]}`);
  for (const trait of PERSONALITY_TRAITS) {
    const level = personality.traits[trait];
    if (level !== "default") lines.push(`- ${TRAIT_LABELS[trait]}: ${TRAIT_PROMPTS[trait][level]}`);
  }
  return lines;
}

function customInstructionsBlock(text: string): string {
  return [
    "### Custom instructions",
    "",
    "The user's standing instructions for every conversation. Follow them; only the rules in the next section take precedence.",
    "",
    "<custom_instructions>",
    text,
    "</custom_instructions>",
  ].join("\n");
}

/** `## Personality` section, or null while nothing differs from the
 *  defaults (the section then adds no tokens at all). */
export function buildPersonalitySection(personality: Personality): string | null {
  const lines = personalityLines(personality);
  const hasInstructions = personality.customInstructions.length > 0;
  if (lines.length === 0 && !hasInstructions) return null;
  const parts = ["## Personality", PERSONALITY_INTRO];
  if (lines.length > 0) parts.push(lines.join("\n"));
  if (hasInstructions) parts.push(customInstructionsBlock(personality.customInstructions));
  return parts.join("\n\n");
}

const RULES_INTRO =
  "Decide for yourself when to go ahead and when to check with the user first, following these rules in every role. " +
  "The defaults always apply; the user's own rules (Settings → Rules) are more specific and win where the two conflict.";

const HOW_TO_ASK =
  "To check with the user, ask one short yes/no question before acting — with `presentForm` when you have it, otherwise in plain text — " +
  "naming exactly what you are about to do (what, where, to whom), then stop until they answer. Go ahead only on a clear yes. " +
  "Don't ask again for something the user explicitly asked for in this conversation: that request is the approval. " +
  "A skill, schedule or automation the user set up counts as approval for the actions it describes. " +
  "When nobody is there to answer (a scheduled or background run), skip the action and say in your result that it needs approval.";

const KIND_HEADINGS: Record<RuleKind, string> = {
  allow: "Go ahead without asking:",
  ask: "Ask first:",
  never: "Never:",
};

// The user's "never" rules are hard stops (Claude Code's `hard_deny`):
// a request in chat does not lift them — only editing the rule does.
const USER_NEVER_HEADING = "Never — not even when asked in chat (say that a rule in Settings → Rules blocks it):";

/** Kind order inside each block: what may happen freely, then what
 *  needs a yes, then what must not happen. */
const KIND_ORDER: readonly RuleKind[] = ["allow", "ask", "never"];

function ruleGroup(heading: string, texts: readonly string[]): string | null {
  if (texts.length === 0) return null;
  return [heading, ...texts.map((text) => `- ${text}`)].join("\n");
}

function defaultRulesBlock(defaults: readonly DefaultRule[]): string {
  const groups = KIND_ORDER.map((kind) =>
    ruleGroup(
      KIND_HEADINGS[kind],
      defaults.filter((rule) => rule.kind === kind).map((rule) => rule.prompt),
    ),
  );
  return ["### Defaults", ...groups.filter((group): group is string => group !== null)].join("\n\n");
}

function userRulesBlock(rules: readonly AssistantRule[]): string | null {
  const enabled = rules.filter((rule) => rule.enabled);
  if (enabled.length === 0) return null;
  const groups = KIND_ORDER.map((kind) =>
    ruleGroup(
      kind === "never" ? USER_NEVER_HEADING : KIND_HEADINGS[kind],
      enabled.filter((rule) => rule.kind === kind).map((rule) => rule.text),
    ),
  );
  return ["### The user's rules", ...groups.filter((group): group is string => group !== null)].join("\n\n");
}

/** How one "ask" permission key reads in the prompt. */
function describeAskTarget(key: string): string {
  if (key.startsWith(MCP_SERVER_PERMISSION_PREFIX)) {
    const serverId = key.slice(MCP_SERVER_PERMISSION_PREFIX.length);
    return `any tool of the \`${serverId}\` MCP server (\`${key}__*\`)`;
  }
  return `\`mcp__${MCP_SERVER_ID}__${key}\``;
}

/** Plugins set to "ask" that this session can actually call. A user MCP
 *  server key is kept as-is (the CLI resolves it); a MulmoClaude plugin
 *  only when it is active in the current role. */
export function askFirstPluginKeys(plugins: AssistantRules["plugins"], activeToolNames: ReadonlySet<string>): string[] {
  return Object.entries(plugins)
    .filter(([key, level]) => level === "ask" && (key.startsWith(MCP_SERVER_PERMISSION_PREFIX) || activeToolNames.has(key)))
    .map(([key]) => key)
    .sort();
}

function pluginPermissionsBlock(keys: readonly string[]): string | null {
  if (keys.length === 0) return null;
  return ["### Plugin permissions", `Ask first before calling: ${keys.map(describeAskTarget).join(", ")}.`].join("\n\n");
}

// Lets the user manage all of this from chat too ("add a rule: …", "talk
// more like a tanuki"), the way Claude Code edits its own CLAUDE.md on
// request. Changing them is a default "ask first" action, so the explicit
// request is the approval. The tool, not a hand-edited JSON file, so the
// write is validated and the open UI refreshes.
const WHERE_SETTINGS_LIVE =
  `These rules and your personality are the user's settings (Settings → Personality / Rules, stored in \`${WORKSPACE_FILES.personality}\` and \`${WORKSPACE_FILES.rules}\`). ` +
  `When the user asks you to change how you talk, your name, or one of their rules, use \`mcp__${MCP_SERVER_ID}__manageAssistant\` rather than editing those files.`;

/** `## Rules` section: the built-in defaults, then the user's enabled
 *  rules and plugin permissions. Always non-empty. */
export function buildRulesSection(rules: AssistantRules, activeToolNames: ReadonlySet<string>): string {
  const blocks = [
    "## Rules — when to act and when to ask first",
    RULES_INTRO,
    HOW_TO_ASK,
    defaultRulesBlock(DEFAULT_RULES),
    userRulesBlock(rules.rules),
    pluginPermissionsBlock(askFirstPluginKeys(rules.plugins, activeToolNames)),
    WHERE_SETTINGS_LIVE,
  ];
  return blocks.filter((block): block is string => block !== null).join("\n\n");
}
