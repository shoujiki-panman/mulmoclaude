// Pure answer → display shaping for the View: the one-line table cell and
// the per-option / per-level bars of the detail panel. No Vue, so it is
// unit-testable and the View stays mostly template.

import { formatPercent, formatScore, nearestLevel, nearestLevelIndex } from "./format";
import type { ChoiceQuestion, QuestionSpec, ScoreQuestion } from "./schemas";
import type { Answer, ChoiceAnswer, ScoreAnswer } from "./types";

export interface Bar {
  key: string;
  label: string;
  /** 0–1, or null when the API sent no distribution. */
  value: number | null;
  highlighted: boolean;
}

/** Table cell: "87%", "payments · 91%", "This week (1.4)". */
export function cellText(question: QuestionSpec, answer: Answer | undefined): string {
  if (answer === undefined) return "—";
  if (answer.type === "predicate") return formatPercent(answer.probability);
  if (answer.type === "choice") {
    const probability = answer.probabilities[answer.choice];
    return probability === undefined ? answer.choice : `${answer.choice} · ${formatPercent(probability)}`;
  }
  const level = question.type === "score" ? nearestLevel(question.levels, answer.score) : undefined;
  const score = formatScore(answer.score);
  return level === undefined ? score : `${level} (${score})`;
}

/** One bar per option, most likely first; the chosen option highlighted. */
export function choiceBars(question: ChoiceQuestion, answer: ChoiceAnswer): Bar[] {
  const known = Object.keys(answer.probabilities).length > 0;
  const bars = question.options.map((option) => ({
    key: option.id,
    label: `${option.id} — ${option.description}`,
    value: known ? (answer.probabilities[option.id] ?? 0) : null,
    highlighted: option.id === answer.choice,
  }));
  return bars.sort((left, right) => (right.value ?? 0) - (left.value ?? 0));
}

/** One bar per level in scale order (lowest first); the level nearest the
 *  weighted score highlighted. */
export function scoreBars(question: ScoreQuestion, answer: ScoreAnswer): Bar[] {
  const known = answer.probabilities.length === question.levels.length;
  const nearest = nearestLevelIndex(answer.score, question.levels.length);
  return question.levels.map((level, index) => ({
    key: String(index),
    label: level,
    value: known ? (answer.probabilities[index] ?? 0) : null,
    highlighted: index === nearest,
  }));
}
