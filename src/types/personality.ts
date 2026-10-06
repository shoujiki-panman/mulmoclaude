// Shared shape for the assistant's personality (Settings → Personality).
//
// A name and avatar the user gives the assistant (shown on its replies),
// one base style preset, four characteristics that can each be nudged
// one step either way from the default, and a free-text block of
// standing instructions — the "custom instructions" of a consumer chat
// app, and the part of a CLAUDE.md that is about the user rather than
// a project. Stored at `config/personality.json`; the server folds it
// into the system prompt on every turn (`buildPersonalitySection`), so
// a change applies from the next message without a restart. The user
// can change it from Settings or just by asking in chat (the
// `manageAssistant` tool applies `mergePersonality`).
//
// Browser-safe (no Node imports): the Vue settings tab and the Express
// server share this one definition and one normaliser.

import { isRecord } from "../utils/types";

/** Base style presets. `default` adds nothing to the system prompt. */
export const TONE_PRESETS = ["default", "professional", "friendly", "candid", "quirky", "efficient", "nerdy", "cynical"] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

/** Characteristics layered on top of the preset, in display order. */
export const PERSONALITY_TRAITS = ["warmth", "enthusiasm", "formatting", "emoji"] as const;
export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

/** Three stops per characteristic. `default` adds nothing to the prompt. */
export const TRAIT_LEVELS = ["less", "default", "more"] as const;
export type TraitLevel = (typeof TRAIT_LEVELS)[number];

/** Room for a real CLAUDE.md-style note, but not enough to crowd the
 *  rest of the system prompt out. Longer input is cut, not rejected,
 *  so a hand-edited file never silently loses the whole block. */
export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 4000;
/** A name, not a sentence. */
export const ASSISTANT_NAME_MAX_CHARS = 40;
/** An emoji or a character or two. Every limit here counts code points,
 *  so an emoji is never cut in half. */
export const ASSISTANT_AVATAR_MAX_CHARS = 8;

export type PersonalityTraits = Record<PersonalityTrait, TraitLevel>;

export interface Personality {
  /** What the assistant calls itself (e.g. "たぬき"). Empty ⇒ no name of
   *  its own — replies are labelled with the generic "Assistant". */
  name: string;
  /** Emoji or short mark shown before the name on replies. Empty ⇒ none. */
  avatar: string;
  tone: TonePreset;
  traits: PersonalityTraits;
  customInstructions: string;
}

/** A fresh all-defaults personality (a new object every call, so a
 *  caller mutating its copy can't leak into the next one). */
export function defaultPersonality(): Personality {
  return {
    name: "",
    avatar: "",
    tone: "default",
    traits: { warmth: "default", enthusiasm: "default", formatting: "default", emoji: "default" },
    customInstructions: "",
  };
}

/** First `max` code points of `text`. */
function takeCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

function toTone(value: unknown): TonePreset {
  return TONE_PRESETS.find((preset) => preset === value) ?? "default";
}

function toTraitLevel(value: unknown): TraitLevel {
  return TRAIT_LEVELS.find((level) => level === value) ?? "default";
}

function toTraits(value: unknown): PersonalityTraits {
  const raw = isRecord(value) ? value : {};
  return {
    warmth: toTraitLevel(raw.warmth),
    enthusiasm: toTraitLevel(raw.enthusiasm),
    formatting: toTraitLevel(raw.formatting),
    emoji: toTraitLevel(raw.emoji),
  };
}

function toCustomInstructions(value: unknown): string {
  if (typeof value !== "string") return "";
  return takeCodePoints(value.trim(), CUSTOM_INSTRUCTIONS_MAX_CHARS).trim();
}

/** One line, whitespace collapsed — a name or an avatar never spans lines. */
function toOneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return takeCodePoints(value.replace(/\s+/g, " ").trim(), max).trim();
}

/** Coerce arbitrary JSON into a clean `Personality`. Unknown presets or
 *  levels fall back to `default` field by field, so one bad value in a
 *  hand-edited file never discards the rest. Pure — shared by the
 *  route validator, the prompt builder and the settings tab. */
export function normalizePersonality(input: unknown): Personality {
  const raw = isRecord(input) ? input : {};
  return {
    name: toOneLine(raw.name, ASSISTANT_NAME_MAX_CHARS),
    avatar: toOneLine(raw.avatar, ASSISTANT_AVATAR_MAX_CHARS),
    tone: toTone(raw.tone),
    traits: toTraits(raw.traits),
    customInstructions: toCustomInstructions(raw.customInstructions),
  };
}

/** True when nothing is set — no name, avatar, style or instructions. */
export function isDefaultPersonality(personality: Personality): boolean {
  if (personality.name.length > 0 || personality.avatar.length > 0) return false;
  if (personality.tone !== "default") return false;
  if (personality.customInstructions.length > 0) return false;
  return PERSONALITY_TRAITS.every((trait) => personality.traits[trait] === "default");
}

/** For a partial change as the chat tool sends it — any of `name`,
 *  `avatar`, `tone`, `traits` (per characteristic), `customInstructions`
 *  (replace) and `appendInstructions` (add a line): the patch's fields
 *  that hold a value outside their allowed set
 *  (an unknown tone or level, a non-string text) — reported back to the
 *  caller instead of being silently dropped. Empty when all is well. */
export function invalidPatchFields(patch: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const key of ["name", "avatar", "customInstructions", "appendInstructions"] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== "string") bad.push(key);
  }
  if (patch.tone !== undefined && !TONE_PRESETS.some((preset) => preset === patch.tone)) bad.push("tone");
  if (patch.traits !== undefined) bad.push(...invalidTraitFields(patch.traits));
  return bad;
}

function invalidTraitFields(traits: unknown): string[] {
  if (!isRecord(traits)) return ["traits"];
  return Object.entries(traits)
    .filter(([trait, level]) => !PERSONALITY_TRAITS.some((known) => known === trait) || !TRAIT_LEVELS.some((known) => known === level))
    .map(([trait]) => `traits.${trait}`);
}

function joinInstructions(current: string, addition: unknown): string {
  if (typeof addition !== "string" || addition.trim().length === 0) return current;
  return current.length > 0 ? `${current}\n${addition.trim()}` : addition.trim();
}

/** `current` with the fields `patch` names replaced — fields it leaves
 *  out are kept, `traits` merges per characteristic, and the result goes
 *  through the same normalisation as a full write. Validate with
 *  `invalidPatchFields` first; an invalid value here just keeps the
 *  current one. */
export function mergePersonality(current: Personality, patch: Record<string, unknown>): Personality {
  const keep = (key: "name" | "avatar" | "customInstructions"): string => {
    const value = patch[key];
    return typeof value === "string" ? value : current[key];
  };
  const patchTraits = isRecord(patch.traits) ? patch.traits : {};
  return normalizePersonality({
    name: keep("name"),
    avatar: keep("avatar"),
    tone: TONE_PRESETS.find((preset) => preset === patch.tone) ?? current.tone,
    traits: Object.fromEntries(PERSONALITY_TRAITS.map((trait) => [trait, TRAIT_LEVELS.find((level) => level === patchTraits[trait]) ?? current.traits[trait]])),
    customInstructions: joinInstructions(keep("customInstructions"), patch.appendInstructions),
  });
}
