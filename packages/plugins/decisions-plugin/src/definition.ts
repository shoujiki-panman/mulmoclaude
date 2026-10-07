// Tool schema. Its own module so both the server entry (`index.ts`) and the
// browser entry (`vue.ts`) can import it without dragging in Zod or any
// server-only code.

import {
  MAX_ITEMS,
  MAX_LEVELS,
  MAX_OPTION_DESCRIPTION_CHARS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MAX_TEXT_CHARS,
  MIN_LEVELS,
  MIN_OPTIONS,
  QUESTION_TYPES,
} from "./limits";

const PROMPT =
  "Use `decide` when the user wants many items classified, triaged, scored or filtered — or asks for probabilities or for OpenAI's Decisions API. " +
  `One call judges up to ${MAX_ITEMS} items against up to ${MAX_QUESTIONS} questions, in parallel, and shows the answers to the user as a table with probabilities. ` +
  "Question types: `predicate` (is it true? → probability), `choice` (pick one of the options → chosen option + probability per option), " +
  "`score` (where on the levels, lowest first → weighted level index from 0). " +
  "Phrase each question so it can be answered from the item alone, and give every option / level a concrete description. " +
  "Items carry `text` and/or `image` (an https URL, or a workspace path under artifacts/ — copy a chat attachment under artifacts/ first). " +
  "Don't use it for open-ended questions, or for one item you can judge yourself unless the user asks for it.";

export const TOOL_DEFINITION = {
  type: "function" as const,
  name: "decide" as const,
  description:
    "Answer fixed questions — yes/no probability, pick one of 2–8 options, or a 2–10 level score — about a batch of texts and/or images in one fast call to OpenAI's Decisions API, and show the answers as a table with their probabilities.",
  prompt: PROMPT,
  parameters: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Short label for the result table, e.g. 'Ticket triage'." },
      questions: {
        type: "array",
        minItems: 1,
        maxItems: MAX_QUESTIONS,
        description: "Asked of every item.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "snake_case id, unique within the call." },
            type: { type: "string", enum: [...QUESTION_TYPES] },
            question: { type: "string", description: "The question, answerable from the item alone." },
            options: {
              type: "array",
              minItems: MIN_OPTIONS,
              maxItems: MAX_OPTIONS,
              description: "`choice` only.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "snake_case id, unique within the question." },
                  description: { type: "string", description: `What this option means (≤ ${MAX_OPTION_DESCRIPTION_CHARS} chars).` },
                },
                required: ["id", "description"],
              },
            },
            levels: {
              type: "array",
              minItems: MIN_LEVELS,
              maxItems: MAX_LEVELS,
              description: "`score` only — level descriptions, lowest first.",
              items: { type: "string" },
            },
          },
          required: ["id", "type", "question"],
        },
      },
      items: {
        type: "array",
        minItems: 1,
        maxItems: MAX_ITEMS,
        description: "The things to judge. Each needs `text`, `image`, or both.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Row label, unique (defaults to item_1, item_2, …)." },
            text: { type: "string", description: `Text to judge (≤ ${MAX_TEXT_CHARS} chars).` },
            image: { type: "string", description: "An https:// URL, or a workspace path under artifacts/ (png, jpeg, webp, gif)." },
          },
        },
      },
    },
    required: ["questions", "items"],
  },
};
