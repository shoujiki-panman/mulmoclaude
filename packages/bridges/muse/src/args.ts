// Command-line parsing for `mulmobridge-muse ask`.

import { parseArgs } from "node:util";
import { DEFAULT_CHAT_ID, errorMessage, failure, type Result } from "./config.js";

/** Most files one question carries. */
export const MAX_FILES = 4;
/** The positional that means "read the question from stdin". */
export const STDIN_MARKER = "-";

export const USAGE = `Usage:
  mulmobridge-muse ask [--chat ID] [--file PATH]... QUESTION
  mulmobridge-muse ask [--chat ID] [--file PATH]... -     (question on stdin)
  mulmobridge-muse relay

ask    Send one question to MulmoClaude and print its answer on stdout.
         --chat ID    conversation to continue (default: ${DEFAULT_CHAT_ID})
         --file PATH  attach an image or PDF (up to ${MAX_FILES}, 10 MB each)
       Exit codes: 0 answer printed, 1 MulmoClaude reported an error,
       2 bad arguments, 3 MulmoClaude is not reachable.
relay  Keep running and forward MulmoClaude's notifications to Muse
       with \`musegadget send-user-msg\`.
`;

export interface AskArgs {
  chatId: string;
  files: string[];
  /** The question, or null when it comes from stdin. */
  question: string | null;
}

const ASK_OPTIONS = {
  chat: { type: "string" },
  file: { type: "string", multiple: true },
} as const;

export function parseAskArgs(argv: readonly string[]): Result<AskArgs> {
  try {
    const { values, positionals } = parseArgs({ args: [...argv], options: ASK_OPTIONS, allowPositionals: true });
    return toAskArgs(values.chat, values.file ?? [], positionals);
  } catch (err) {
    return failure(errorMessage(err));
  }
}

function toAskArgs(chat: string | undefined, files: string[], positionals: string[]): Result<AskArgs> {
  const chatId = chat === undefined ? DEFAULT_CHAT_ID : chat.trim();
  if (!chatId) return failure("--chat needs a conversation id");
  if (files.length > MAX_FILES) return failure(`at most ${MAX_FILES} --file options`);
  if (positionals.length === 0) return failure(`missing the question (or ${STDIN_MARKER} to read it from stdin)`);
  const fromStdin = positionals.length === 1 && positionals[0] === STDIN_MARKER;
  return { ok: true, value: { chatId, files, question: fromStdin ? null : positionals.join(" ") } };
}
