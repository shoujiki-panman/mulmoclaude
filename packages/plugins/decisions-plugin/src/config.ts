// Deployment config, read from the server's environment on every call so
// "edit .env, restart" is the whole setup. The key never leaves the server
// process: it is not part of the tool result, the View data or any log line.

export const DEFAULT_MODEL = "decisions-1";

export interface DecisionsConfig {
  apiKey: string;
  model: string;
}

export function readConfig(env: Readonly<Record<string, string | undefined>> = process.env): DecisionsConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  // `||`, not `??`: a blank override means "use the default" too.
  return { apiKey, model: env.MULMOCLAUDE_DECISIONS_MODEL?.trim() || DEFAULT_MODEL };
}

/** Returned instead of a result when the key is missing. Only
 *  `instructions` — no `data`, so nothing is pushed to the canvas. */
export function missingKeyResponse(): { instructions: string } {
  return {
    instructions:
      "The `decide` tool needs an OpenAI API key, and OPENAI_API_KEY is not set on the MulmoClaude server. " +
      "Tell the user to add `OPENAI_API_KEY=<their key>` to the `.env` file in the MulmoClaude directory " +
      "(or export it in the shell that starts the server), restart the server, and then retry. " +
      "Never ask the user to paste the key into this chat, and do not try to set it yourself.",
  };
}
