// What the LLM gets back: a header line plus one compact JSON object per
// item — the chosen option with its probability, the predicate probability,
// the score with its nearest level. Full distributions stay in the View; a
// 50-item × 6-question batch would otherwise cost thousands of tokens for
// numbers the model rarely needs.

import { nearestLevel, roundTo2 } from "./format";
import type { QuestionSpec } from "./schemas";
import type { Answer, ChoiceAnswer, DecisionsData, ItemResult, ScoreAnswer } from "./types";

function confidenceOf(answer: ChoiceAnswer | ScoreAnswer): { confidence?: number } {
  return answer.confidence === undefined ? {} : { confidence: roundTo2(answer.confidence) };
}

function compactChoice(answer: ChoiceAnswer): Record<string, unknown> {
  const probability = answer.probabilities[answer.choice];
  return { choice: answer.choice, ...(probability === undefined ? {} : { p: roundTo2(probability) }), ...confidenceOf(answer) };
}

function compactScore(question: QuestionSpec, answer: ScoreAnswer): Record<string, unknown> {
  const level = question.type === "score" ? nearestLevel(question.levels, answer.score) : undefined;
  return { score: roundTo2(answer.score), ...(level === undefined ? {} : { level }), ...confidenceOf(answer) };
}

function compactAnswer(question: QuestionSpec, answer: Answer | undefined): unknown {
  if (answer === undefined) return null;
  if (answer.type === "predicate") return { p: roundTo2(answer.probability) };
  return answer.type === "choice" ? compactChoice(answer) : compactScore(question, answer);
}

function compactItem(item: ItemResult, questions: readonly QuestionSpec[]): Record<string, unknown> {
  if (item.error !== undefined) return { id: item.id, error: item.error };
  const answers = item.answers ?? {};
  return { id: item.id, ...Object.fromEntries(questions.map((question) => [question.id, compactAnswer(question, answers[question.id])])) };
}

export function summariseForLlm(data: DecisionsData): string {
  const failed = data.items.filter((item) => item.error !== undefined).length;
  const failedNote = failed > 0 ? `, ${failed} failed` : "";
  const header =
    `Decisions API (${data.model}): ${data.items.length} item(s) × ${data.questions.length} question(s) in ${data.elapsedMs} ms${failedNote}. ` +
    "The full table with probabilities is shown to the user in the canvas. Score values count levels from 0 (the first, lowest level).";
  return [header, ...data.items.map((item) => JSON.stringify(compactItem(item, data.questions)))].join("\n");
}
