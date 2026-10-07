// `mulmobridge-muse relay` — keeps a connection to MulmoClaude open and
// forwards its notifications (scheduled reminders, finished background
// work) to Muse through the gadget's own `musegadget send-user-msg`, the
// same way the SDK's Pebble ring example does. It holds no Muse
// credentials: it has to run as an account in the musegadget socket's group.

import { spawn } from "node:child_process";
import { createBridgeClient } from "@mulmobridge/client";
import { TRANSPORT_ID } from "./config.js";

/** Marks relayed messages so Muse knows they come from MulmoClaude. */
export const PUSH_PREFIX = "[MulmoClaude] ";
/** `send-user-msg` itself gives up after 90 s. */
const SEND_TIMEOUT_MS = 100_000;

export interface MuseTarget {
  /** The musegadget command, or a path to it. */
  command: string;
  /** Post into this Muse side chat instead of the main chat. */
  sessionId?: string;
}

export interface RunResult {
  code: number | null;
  stderr: string;
}

export type RunCommand = (command: string, args: string[], input: string) => Promise<RunResult>;

export function museTargetFromEnv(env: NodeJS.ProcessEnv): MuseTarget {
  const command = env.MUSEGADGET?.trim() || "musegadget";
  const sessionId = env.MUSE_SESSION_ID?.trim();
  return sessionId ? { command, sessionId } : { command };
}

/** The message rides on stdin (`-`), so it never shows up in `ps`. */
export function sendUserMsgArgs(sessionId: string | undefined): string[] {
  return sessionId ? ["send-user-msg", "--session-id", sessionId, "-"] : ["send-user-msg", "-"];
}

export function formatPushForMuse(message: string): string {
  return `${PUSH_PREFIX}${message}`;
}

/** Spawns without a shell, writes `input` to stdin, collects stderr. */
export const runCommand: RunCommand = (command, args, input) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"], timeout: SEND_TIMEOUT_MS });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // A command that failed to start closes stdin under us: EPIPE, not a crash.
    child.stdin.on("error", () => undefined);
    child.on("error", (err) => resolve({ code: null, stderr: err.message }));
    child.on("close", (code) => resolve({ code, stderr: Buffer.concat(stderr).toString("utf8").trim() }));
    child.stdin.end(input);
  });

export async function sendToMuse(message: string, target: MuseTarget, run: RunCommand = runCommand): Promise<boolean> {
  const result = await run(target.command, sendUserMsgArgs(target.sessionId), formatPushForMuse(message));
  if (result.code === 0) return true;
  console.error(`[muse] send-user-msg failed (exit ${result.code ?? "none"}): ${result.stderr || "no output"}`);
  return false;
}

/** Runs tasks one at a time, in order, so notifications reach Muse in the
 *  order MulmoClaude sent them. A failed task doesn't stop the queue. */
export function createSerialQueue(): (task: () => Promise<unknown>) => Promise<void> {
  const state = { tail: Promise.resolve() };
  return (task) => {
    state.tail = state.tail.then(task).then(
      () => undefined,
      () => undefined,
    );
    return state.tail;
  };
}

export function runRelay(env: NodeJS.ProcessEnv = process.env): void {
  const target = museTargetFromEnv(env);
  const enqueue = createSerialQueue();
  const client = createBridgeClient({ transportId: TRANSPORT_ID });
  client.onPush((event) => {
    console.log(`[muse] notification chat=${event.chatId} len=${event.message.length}`);
    void enqueue(() => sendToMuse(event.message, target));
  });
  const where = target.sessionId ? `side chat ${target.sessionId}` : "the main chat";
  console.log(`MulmoClaude → Muse relay: forwarding notifications to ${where} via ${target.command}`);
}
