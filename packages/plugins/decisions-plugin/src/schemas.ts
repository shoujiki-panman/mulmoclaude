// Zod validation for the `decide` tool's arguments. The LLM's tool_use block
// reaches the handler unchecked, so everything is validated here before any
// request leaves the server.

import { z } from "zod";
import { MAX_ITEMS, MAX_LEVELS, MAX_OPTION_DESCRIPTION_CHARS, MAX_OPTIONS, MAX_QUESTIONS, MAX_TEXT_CHARS, MIN_LEVELS, MIN_OPTIONS } from "./limits";

// zod registers its English messages as an import side effect, and zod's
// `sideEffects: false` lets the bundler drop it — leaving every issue in
// `dist/index.js` as a bare "Invalid input" the LLM can't act on. Registering
// the locale explicitly keeps "Too small: expected array to have >=2 items".
z.config(z.locales.en());

/** The Decisions API's rule for question and option ids. */
export const SNAKE_ID_RE = /^[a-z][a-z0-9_]*$/;
const MAX_ID_CHARS = 64;
const MAX_LABEL_CHARS = 200;

const SnakeId = z.string().max(MAX_ID_CHARS).regex(SNAKE_ID_RE, "ids must be snake_case: lowercase letters, digits and _, starting with a letter");

const OptionSchema = z.object({
  id: SnakeId,
  description: z.string().min(1).max(MAX_OPTION_DESCRIPTION_CHARS),
});

const questionBase = { id: SnakeId, question: z.string().min(1) };

const QuestionSchema = z.discriminatedUnion("type", [
  z.object({ ...questionBase, type: z.literal("predicate") }),
  z.object({ ...questionBase, type: z.literal("choice"), options: z.array(OptionSchema).min(MIN_OPTIONS).max(MAX_OPTIONS) }),
  z.object({ ...questionBase, type: z.literal("score"), levels: z.array(z.string().min(1)).min(MIN_LEVELS).max(MAX_LEVELS) }),
]);

const ItemSchema = z
  .object({
    id: z.string().min(1).max(MAX_LABEL_CHARS).optional(),
    text: z.string().min(1).max(MAX_TEXT_CHARS).optional(),
    image: z.string().min(1).optional(),
  })
  .refine((item) => item.text !== undefined || item.image !== undefined, { message: "each item needs `text`, `image`, or both" });

export const DecideArgsSchema = z
  .object({
    title: z.string().max(MAX_LABEL_CHARS).optional(),
    questions: z.array(QuestionSchema).min(1).max(MAX_QUESTIONS),
    items: z.array(ItemSchema).min(1).max(MAX_ITEMS),
  })
  .superRefine((args, ctx) => {
    for (const message of findDuplicateIds(args)) ctx.addIssue({ code: "custom", message });
  });

export type QuestionSpec = z.infer<typeof QuestionSchema>;
export type ChoiceQuestion = Extract<QuestionSpec, { type: "choice" }>;
export type ScoreQuestion = Extract<QuestionSpec, { type: "score" }>;
export type ItemSpec = z.infer<typeof ItemSchema>;
export type DecideArgs = z.infer<typeof DecideArgsSchema>;

/** Row id shown in the table and echoed to the LLM: the caller's own id, or
 *  its 1-based position. */
export function resolveItemId(item: Pick<ItemSpec, "id">, index: number): string {
  return item.id ?? `item_${index + 1}`;
}

function duplicatesIn(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((candidate) => {
    if (seen.has(candidate)) return true;
    seen.add(candidate);
    return false;
  });
}

/** One message per id that repeats where it has to be unique: question ids
 *  and option ids (the API keys its maps by them) and resolved item ids (the
 *  LLM matches results back to its input by them). */
export function findDuplicateIds(args: { questions: readonly QuestionSpec[]; items: readonly Pick<ItemSpec, "id">[] }): string[] {
  const messages = duplicatesIn(args.questions.map((question) => question.id)).map((dup) => `duplicate question id "${dup}"`);
  for (const question of args.questions) {
    if (question.type !== "choice") continue;
    const optionIds = question.options.map((option) => option.id);
    messages.push(...duplicatesIn(optionIds).map((dup) => `duplicate option id "${dup}" in question "${question.id}"`));
  }
  const itemIds = args.items.map((item, index) => resolveItemId(item, index));
  messages.push(...duplicatesIn(itemIds).map((dup) => `duplicate item id "${dup}"`));
  return messages;
}

/** Zod issues → one line the LLM can act on (`questions.0.options: …`). */
export function describeIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => (issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message)).join("; ");
}
