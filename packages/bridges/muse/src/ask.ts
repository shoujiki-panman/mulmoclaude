// `mulmobridge-muse ask` — what Muse runs (via the gadget's `system.run`)
// to put one question to MulmoClaude. stdout carries MulmoClaude's answer
// and nothing else; everything else goes to stderr.

import { createBridgeClient, formatAckReply, readBridgeToken, type MessageAck } from "@mulmobridge/client";
import type { Attachment } from "@mulmobridge/protocol";
import { USAGE, parseAskArgs } from "./args.js";
import { loadAttachments } from "./attachments.js";
import { DEFAULT_API_URL, EXIT_CODES, TRANSPORT_ID } from "./config.js";

/** socket.io retries forever; give up long before Muse's command times out. */
const CONNECT_TIMEOUT_MS = 15_000;

export interface AskOutcome {
  stdout: string;
  stderr: string;
  code: number;
}

function withTrailingNewline(text: string): string {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/** What `ask` prints, and its exit code, for MulmoClaude's ack. */
export function askOutcome(ack: MessageAck): AskOutcome {
  if (ack.ok) return { stdout: withTrailingNewline(ack.reply ?? ""), stderr: "", code: EXIT_CODES.ok };
  return { stdout: "", stderr: `${formatAckReply(ack)}\n`, code: EXIT_CODES.mulmoError };
}

/** The parts of a socket.io socket `waitForConnect` needs. */
export interface ConnectingSocket {
  readonly connected: boolean;
  on(event: "connect_error", listener: (err: Error) => void): unknown;
  once(event: "connect", listener: () => void): unknown;
}

export type ConnectResult = { connected: true } | { connected: false; lastError: string };

/** Resolves on connect, or after `timeoutMs` with the last connection error. */
export function waitForConnect(socket: ConnectingSocket, timeoutMs: number): Promise<ConnectResult> {
  if (socket.connected) return Promise.resolve({ connected: true });
  return new Promise((resolve) => {
    const errors: string[] = [];
    const timer = setTimeout(() => resolve({ connected: false, lastError: errors[errors.length - 1] ?? "timed out" }), timeoutMs);
    socket.on("connect_error", (err) => errors.push(err.message));
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve({ connected: true });
    });
  });
}

export async function readAll(stream: AsyncIterable<string | Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function usageError(message: string): number {
  process.stderr.write(`mulmobridge-muse ask: ${message}\n\n${USAGE}`);
  return EXIT_CODES.usage;
}

function unreachable(reason: string): number {
  const apiUrl = process.env.MULMOCLAUDE_API_URL ?? DEFAULT_API_URL;
  process.stderr.write(`MulmoClaude is not reachable at ${apiUrl} (${reason}). Is MulmoClaude running on this machine?\n`);
  return EXIT_CODES.unreachable;
}

async function askMulmo(chatId: string, question: string, attachments: Attachment[]): Promise<number> {
  if (readBridgeToken() === null) return unreachable("no token: set MULMOCLAUDE_AUTH_TOKEN or start MulmoClaude as this account");
  // The shared client logs "Connected (…)" with console.log; keep stdout for the answer.
  console.log = console.error;
  const client = createBridgeClient({ transportId: TRANSPORT_ID });
  try {
    const connection = await waitForConnect(client.socket, CONNECT_TIMEOUT_MS);
    if (!connection.connected) return unreachable(connection.lastError);
    const outcome = askOutcome(await client.send(chatId, question, attachments.length > 0 ? attachments : undefined));
    process.stdout.write(outcome.stdout);
    process.stderr.write(outcome.stderr);
    return outcome.code;
  } finally {
    client.close();
  }
}

/** Runs `ask` with the arguments after the subcommand; returns the exit code. */
export async function runAsk(argv: readonly string[], stdin: AsyncIterable<string | Buffer> = process.stdin): Promise<number> {
  const args = parseAskArgs(argv);
  if (!args.ok) return usageError(args.error);
  const question = (args.value.question ?? (await readAll(stdin))).trim();
  if (!question) return usageError("the question is empty");
  const attachments = await loadAttachments(args.value.files);
  if (!attachments.ok) return usageError(attachments.error);
  return askMulmo(args.value.chatId, question, attachments.value);
}
