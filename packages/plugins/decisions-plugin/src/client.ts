// One Decisions API call: POST the wire request, turn HTTP failures into
// messages that name the fix, return the parsed JSON body. Network I/O goes
// through `runtime.fetch` with an allowlist, so the plugin can reach nothing
// but OpenAI; network errors and timeouts surface as the thrown error, which
// the batch loop records against the item.

import { isRecord } from "@mulmoclaude/common";
import type { PluginRuntime } from "gui-chat-protocol";
import { ONE_SECOND_MS } from "./time";
import { DECISIONS_ENDPOINT, DECISIONS_HOST, type WireRequest } from "./wire";

export const DECISION_TIMEOUT_MS = 30 * ONE_SECOND_MS;
const MAX_ERROR_DETAIL_CHARS = 300;

const HTTP_HINTS = new Map<number, string>([
  [400, "the request was rejected — check the question / option wording and limits"],
  [401, "OPENAI_API_KEY was rejected; check the key in .env"],
  [403, "this key's project has no access to the Decisions API (public beta)"],
  [404, "endpoint or model not found — the Decisions API may not be enabled for this account, or MULMOCLAUDE_DECISIONS_MODEL names an unknown model"],
  [429, "rate limit or quota exceeded; retry later or with fewer items"],
]);

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** OpenAI's `{ error: { message } }` when present, else the raw body. */
export function errorDetailFromBody(body: string): string {
  const parsed = safeJsonParse(body);
  const message = isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === "string" ? parsed.error.message : body;
  return message.trim().slice(0, MAX_ERROR_DETAIL_CHARS);
}

export function describeHttpFailure(status: number, body: string): string {
  const parts = [`Decisions API returned HTTP ${status}`, errorDetailFromBody(body), HTTP_HINTS.get(status)];
  return parts.filter((part) => part !== undefined && part.length > 0).join(" — ");
}

export async function postDecision(fetchFn: PluginRuntime["fetch"], apiKey: string, body: WireRequest): Promise<unknown> {
  const response = await fetchFn(DECISIONS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: DECISION_TIMEOUT_MS,
    allowedHosts: [DECISIONS_HOST],
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(describeHttpFailure(response.status, text));
  }
  const json: unknown = await response.json();
  return json;
}
