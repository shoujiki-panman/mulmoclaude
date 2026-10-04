// The reply a finished run ends on — what hands-free mode reads aloud.

import type { ToolResultComplete } from "gui-chat-protocol/vue";
import { isRecord } from "../types";

/** Markdown of the newest assistant text card at or after `fromIndex` (pass
 *  `ActiveSession.runStartIndex`, the run's first output), or null when the
 *  run produced no assistant prose — a tool-only turn has nothing to read. */
export function lastAssistantReplyText(results: readonly ToolResultComplete[], fromIndex: number): string | null {
  const newestFirst = results.slice(Math.max(0, fromIndex)).reverse();
  for (const result of newestFirst) {
    const text = assistantTextOf(result);
    if (text !== null) return text;
  }
  return null;
}

function assistantTextOf(result: ToolResultComplete): string | null {
  if (result.toolName !== "text-response" || !isRecord(result.data)) return null;
  const { role, text } = result.data;
  const isAssistant = role === undefined || role === "assistant";
  return isAssistant && typeof text === "string" && text.trim().length > 0 ? text : null;
}
