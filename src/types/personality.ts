// Shared shape for the assistant's personality (Settings → Personality).
//
// One base style preset, four characteristics that can each be nudged
// one step either way from the default, and a free-text block of
// standing instructions — the "custom instructions" of a consumer chat
// app, and the part of a CLAUDE.md that is about the user rather than
// a project. Stored at `config/personality.json`; the server folds it
// into the system prompt on every turn (`buildPersonalitySection`), so
// a change applies from the next message without a restart.
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

export type PersonalityTraits = Record<PersonalityTrait, TraitLevel>;

export interface Personality {
  tone: TonePreset;
  traits: PersonalityTraits;
  customInstructions: string;
}

/** A fresh all-defaults personality (a new object every call, so a
 *  caller mutating its copy can't leak into the next one). */
export function defaultPersonality(): Personality {
  return {
    tone: "default",
    traits: { warmth: "default", enthusiasm: "default", formatting: "default", emoji: "default" },
    customInstructions: "",
  };
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
  return value.trim().slice(0, CUSTOM_INSTRUCTIONS_MAX_CHARS);
}

/** Coerce arbitrary JSON into a clean `Personality`. Unknown presets or
 *  levels fall back to `default` field by field, so one bad value in a
 *  hand-edited file never discards the rest. Pure — shared by the
 *  route validator, the prompt builder and the settings tab. */
export function normalizePersonality(input: unknown): Personality {
  const raw = isRecord(input) ? input : {};
  return {
    tone: toTone(raw.tone),
    traits: toTraits(raw.traits),
    customInstructions: toCustomInstructions(raw.customInstructions),
  };
}

/** True when the personality would add nothing to the system prompt. */
export function isDefaultPersonality(personality: Personality): boolean {
  if (personality.tone !== "default") return false;
  if (personality.customInstructions.length > 0) return false;
  return PERSONALITY_TRAITS.every((trait) => personality.traits[trait] === "default");
}
