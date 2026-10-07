// Request limits, shared by the tool's JSON schema (what the LLM sees), the
// Zod validation and the View. The per-call caps mirror the Decisions API's
// limits as documented at the time of writing (UNVERIFIED — see
// plans/feat-decisions-plugin.md); MAX_ITEMS is this plugin's own fan-out
// cap, since the API judges one input per call.
//
// Dependency-free on purpose: `definition.ts` imports it, and that module is
// part of the browser bundle too.

export const QUESTION_TYPES = ["predicate", "choice", "score"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const MAX_QUESTIONS = 6;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const MAX_OPTION_DESCRIPTION_CHARS = 300;
export const MIN_LEVELS = 2;
export const MAX_LEVELS = 10;
export const MAX_TEXT_CHARS = 60_000;
export const MAX_ITEMS = 50;
