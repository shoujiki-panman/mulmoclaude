// The Decisions API wire format: the request body we send and the response
// we accept.
//
// UNVERIFIED: written while https://developers.openai.com/api/docs/guides/decisions
// was unreachable from the authoring session, so these shapes come from
// secondary sources. Everything that depends on the exact contract lives in
// this one module — reconciling it with the official guide should not touch
// any other file. Unrecognised responses fail loudly (with the top-level keys
// in the message) rather than being guessed at.

import { isRecord, isUnknownArray } from "@mulmoclaude/common";
import type { ChoiceQuestion, QuestionSpec, ScoreQuestion } from "./schemas";
import type { Answer, ChoiceAnswer, ScoreAnswer } from "./types";

export const DECISIONS_ENDPOINT = "https://api.openai.com/v1/decisions";
export const DECISIONS_HOST = "api.openai.com";

type WireQuestion =
  | { type: "predicate"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

type WireContentPart = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

export interface WireRequest {
  model: string;
  /** Plain text, or content parts when an image is attached. */
  state: string | WireContentPart[];
  questions: Record<string, WireQuestion>;
}

export function toWireQuestion(question: QuestionSpec): WireQuestion {
  switch (question.type) {
    case "predicate":
      return { type: "predicate", instructions: question.question };
    case "choice":
      return {
        type: "choice",
        instructions: question.question,
        criteria: Object.fromEntries(question.options.map((option) => [option.id, option.description])),
      };
    case "score":
      return { type: "score", instructions: question.question, criteria: [...question.levels] };
    default: {
      const exhaustive: never = question;
      throw new Error(`unknown question type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function contentParts(text: string | undefined, imageUrl: string): WireContentPart[] {
  const parts: WireContentPart[] = text === undefined ? [] : [{ type: "input_text", text }];
  parts.push({ type: "input_image", image_url: imageUrl });
  return parts;
}

export interface WireRequestParams {
  model: string;
  questions: readonly QuestionSpec[];
  text?: string | undefined;
  imageUrl?: string | undefined;
}

export function buildWireRequest(params: WireRequestParams): WireRequest {
  return {
    model: params.model,
    // Text alone goes as a plain string; an image needs content parts.
    state: params.imageUrl === undefined ? (params.text ?? "") : contentParts(params.text, params.imageUrl),
    questions: Object.fromEntries(params.questions.map((question) => [question.id, toWireQuestion(question)])),
  };
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function optionalConfidence(value: unknown): { confidence?: number } {
  return isProbability(value) ? { confidence: value } : {};
}

function readProbabilityMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isProbability(entry[1])));
}

/** All-or-nothing: one bad entry would misalign every level after it. */
function readProbabilityList(value: unknown): number[] {
  return isUnknownArray(value) && value.every(isProbability) ? value : [];
}

function parseChoice(question: ChoiceQuestion, raw: Record<string, unknown>): ChoiceAnswer {
  const { choice } = raw;
  if (typeof choice !== "string" || !question.options.some((option) => option.id === choice)) {
    throw new Error(`question "${question.id}": unexpected choice ${JSON.stringify(choice)}`);
  }
  return { type: "choice", choice, probabilities: readProbabilityMap(raw.probabilities), ...optionalConfidence(raw.confidence) };
}

function parseScore(question: ScoreQuestion, raw: Record<string, unknown>): ScoreAnswer {
  const { score } = raw;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new Error(`question "${question.id}": expected a numeric score, got ${JSON.stringify(score)}`);
  }
  return { type: "score", score, probabilities: readProbabilityList(raw.probabilities), ...optionalConfidence(raw.confidence) };
}

function parsePredicate(question: QuestionSpec, raw: Record<string, unknown>): Answer {
  const { probability } = raw;
  if (!isProbability(probability)) {
    throw new Error(`question "${question.id}": expected a probability between 0 and 1, got ${JSON.stringify(probability)}`);
  }
  return { type: "predicate", probability };
}

function parseAnswer(question: QuestionSpec, raw: unknown): Answer {
  if (!isRecord(raw)) throw new Error(`the response has no answer for question "${question.id}"`);
  switch (question.type) {
    case "predicate":
      return parsePredicate(question, raw);
    case "choice":
      return parseChoice(question, raw);
    case "score":
      return parseScore(question, raw);
    default: {
      const exhaustive: never = question;
      throw new Error(`unknown question type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describeTopLevel(raw: unknown): string {
  if (!isRecord(raw)) return `a ${raw === null ? "null" : typeof raw}`;
  const keys = Object.keys(raw);
  return keys.length > 0 ? `keys: ${keys.join(", ")}` : "an empty object";
}

/** One response body → an answer per question, keyed by question id. */
export function parseWireResponse(raw: unknown, questions: readonly QuestionSpec[]): Record<string, Answer> {
  const answers = isRecord(raw) ? raw.answers : undefined;
  if (!isRecord(answers)) throw new Error(`unrecognised Decisions API response (${describeTopLevel(raw)})`);
  return Object.fromEntries(questions.map((question) => [question.id, parseAnswer(question, answers[question.id])]));
}
