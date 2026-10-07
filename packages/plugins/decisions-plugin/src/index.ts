// Decisions plugin — server side. One tool, `decide`: a batch of texts /
// images × up to six questions → OpenAI's Decisions API → calibrated
// answers, rendered as a table in the canvas. Plan:
// plans/feat-decisions-plugin.md.
//
// Failures never throw out of the handler: a missing key, invalid
// arguments or a batch where every call failed come back as `instructions`
// only (no `data`, so no empty card lands in the canvas); a partly failed
// batch renders, with the failed rows carrying their error.

import { definePlugin, type PluginRuntime } from "gui-chat-protocol";
import { missingKeyResponse, readConfig } from "./config";
import { TOOL_DEFINITION } from "./definition";
import { runDecisions } from "./run";
import { DecideArgsSchema, describeIssues } from "./schemas";
import { summariseForLlm } from "./summary";
import type { DecisionsData } from "./types";

export { TOOL_DEFINITION };

/** The handler's return value for a finished run. Exported for tests. */
export function toToolResult(data: DecisionsData): { message: string; data: DecisionsData; title?: string } | { instructions: string } {
  const failed = data.items.filter((item) => item.error !== undefined);
  if (failed.length === data.items.length) {
    return { instructions: `Every Decisions API call failed, so there is nothing to show. First error: ${failed[0]?.error ?? "unknown"}` };
  }
  return { message: summariseForLlm(data), data, ...(data.title === undefined ? {} : { title: data.title }) };
}

async function handleDecide(runtime: PluginRuntime, rawArgs: unknown): Promise<ReturnType<typeof toToolResult>> {
  const config = readConfig();
  if (config === null) return missingKeyResponse();
  const parsed = DecideArgsSchema.safeParse(rawArgs);
  if (!parsed.success) return { instructions: `Invalid decide arguments: ${describeIssues(parsed.error.issues)}` };
  const data = await runDecisions({ fetch: runtime.fetch, artifacts: runtime.files.artifacts, config }, parsed.data);
  const failed = data.items.filter((item) => item.error !== undefined).length;
  runtime.log.info("decide finished", { model: data.model, items: data.items.length, failed, elapsedMs: data.elapsedMs });
  return toToolResult(data);
}

export default definePlugin((runtime) => ({
  TOOL_DEFINITION,

  async decide(rawArgs: unknown) {
    return handleDecide(runtime, rawArgs);
  },
}));
