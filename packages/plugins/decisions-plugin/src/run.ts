// The batch loop: every item is judged against the same questions, one API
// call per item, at most MAX_CONCURRENT_REQUESTS in flight. A failing item
// records its error and the rest carry on — one unreadable image must not
// cost the other 49 answers.

import { errorMessage } from "@mulmoclaude/common";
import type { FileOps, PluginRuntime } from "gui-chat-protocol";
import { postDecision } from "./client";
import type { DecisionsConfig } from "./config";
import { resolveImageUrl } from "./images";
import { resolveItemId, type DecideArgs, type ItemSpec, type QuestionSpec } from "./schemas";
import type { DecisionsData, ItemResult } from "./types";
import { buildWireRequest, parseWireResponse } from "./wire";

export const MAX_CONCURRENT_REQUESTS = 4;

/** How much of each item's text travels with the result. Enough for a row
 *  label; keeps a 50 × 60k-char batch out of the session log. */
export const PREVIEW_TEXT_CHARS = 280;

export interface RunDeps {
  fetch: PluginRuntime["fetch"];
  artifacts: FileOps;
  config: DecisionsConfig;
  now?: () => number;
}

/** `items.map(fn)` with at most `limit` calls in flight; results keep the
 *  input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.map((item, index) => ({ item, index }));
  const worker = async (): Promise<void> => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
      results[job.index] = await task(job.item, job.index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, () => worker()));
  return results;
}

function itemRow(item: ItemSpec, index: number): ItemResult {
  return {
    id: resolveItemId(item, index),
    ...(item.text === undefined ? {} : { text: item.text.slice(0, PREVIEW_TEXT_CHARS) }),
    ...(item.image === undefined ? {} : { image: item.image }),
  };
}

async function decideItem(deps: RunDeps, questions: readonly QuestionSpec[], item: ItemSpec, index: number): Promise<ItemResult> {
  const row = itemRow(item, index);
  try {
    const imageUrl = item.image === undefined ? undefined : await resolveImageUrl(item.image, deps.artifacts);
    const body = buildWireRequest({ model: deps.config.model, questions, text: item.text, imageUrl });
    const raw = await postDecision(deps.fetch, deps.config.apiKey, body);
    return { ...row, answers: parseWireResponse(raw, questions) };
  } catch (err) {
    return { ...row, error: errorMessage(err) };
  }
}

export async function runDecisions(deps: RunDeps, args: DecideArgs): Promise<DecisionsData> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const items = await mapWithConcurrency(args.items, MAX_CONCURRENT_REQUESTS, (item, index) => decideItem(deps, args.questions, item, index));
  return {
    ...(args.title === undefined ? {} : { title: args.title }),
    model: deps.config.model,
    questions: args.questions,
    items,
    elapsedMs: now() - startedAt,
  };
}
