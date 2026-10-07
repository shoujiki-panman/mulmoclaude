// Shared constants for the Muse bridge.

/** Identifies this bridge to MulmoClaude's chat-service. */
export const TRANSPORT_ID = "muse";

/** The MulmoClaude conversation `ask` talks to unless `--chat` says
 *  otherwise. One fixed id means follow-up questions keep their context. */
export const DEFAULT_CHAT_ID = "muse";

export const DEFAULT_API_URL = "http://localhost:3001";

/** Exit codes of `mulmobridge-muse ask` — documented in SKILL.md so Muse
 *  can tell "MulmoClaude said no" from "MulmoClaude isn't running". */
export const EXIT_CODES = {
  ok: 0,
  mulmoError: 1,
  usage: 2,
  unreachable: 3,
} as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
