// Result shapes: produced by the server handler, consumed by the View /
// Preview (as the tool result's `data`). Type-only, so importing it pulls
// nothing into either bundle.

import type { QuestionSpec } from "./schemas";

export interface PredicateAnswer {
  type: "predicate";
  /** Probability (0–1) that the predicate holds. */
  probability: number;
}

export interface ChoiceAnswer {
  type: "choice";
  /** Id of the chosen option. */
  choice: string;
  /** Probability per option id; empty when the API sent none. */
  probabilities: Record<string, number>;
  confidence?: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted level index (0 = the first, lowest level). */
  score: number;
  /** Probability per level, lowest first; empty when the API sent none. */
  probabilities: number[];
  confidence?: number;
}

export type Answer = PredicateAnswer | ChoiceAnswer | ScoreAnswer;

export interface ItemResult {
  id: string;
  /** Leading slice of the item's text, for the row label. */
  text?: string;
  image?: string;
  /** Keyed by question id. Absent when the call failed. */
  answers?: Record<string, Answer>;
  error?: string;
}

export interface DecisionsData {
  title?: string;
  model: string;
  questions: QuestionSpec[];
  items: ItemResult[];
  elapsedMs: number;
}
