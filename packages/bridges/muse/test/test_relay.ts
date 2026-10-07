import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PUSH_PREFIX,
  createSerialQueue,
  formatPushForMuse,
  museTargetFromEnv,
  runCommand,
  sendToMuse,
  sendUserMsgArgs,
  type RunCommand,
} from "../src/relay.ts";

function recordingRun(result: { code: number | null; stderr: string }) {
  const calls: { command: string; args: string[]; input: string }[] = [];
  const run: RunCommand = async (command, args, input) => {
    calls.push({ command, args, input });
    return result;
  };
  return { run, calls };
}

describe("museTargetFromEnv", () => {
  it("defaults to the musegadget command and the main chat", () => {
    assert.deepEqual(museTargetFromEnv({}), { command: "musegadget" });
    assert.deepEqual(museTargetFromEnv({ MUSEGADGET: " ", MUSE_SESSION_ID: "" }), { command: "musegadget" });
  });

  it("takes a command path and a side chat", () => {
    const env = { MUSEGADGET: "/opt/musegadget/bin/musegadget", MUSE_SESSION_ID: "6f1c2d4e" };
    assert.deepEqual(museTargetFromEnv(env), { command: "/opt/musegadget/bin/musegadget", sessionId: "6f1c2d4e" });
  });
});

describe("sendToMuse", () => {
  it("pipes the prefixed message to send-user-msg on stdin", async () => {
    const { run, calls } = recordingRun({ code: 0, stderr: "" });
    assert.equal(await sendToMuse("Iron is hot", { command: "musegadget", sessionId: "s1" }, run), true);
    assert.deepEqual(calls, [{ command: "musegadget", args: ["send-user-msg", "--session-id", "s1", "-"], input: `${PUSH_PREFIX}Iron is hot` }]);
  });

  it("reports a failed delivery", async () => {
    const { run } = recordingRun({ code: 1, stderr: "Could not reach the musegadget service" });
    assert.equal(await sendToMuse("hi", { command: "musegadget" }, run), false);
  });

  it("builds the arguments for the main chat and a side chat", () => {
    assert.deepEqual(sendUserMsgArgs(undefined), ["send-user-msg", "-"]);
    assert.deepEqual(sendUserMsgArgs("abc"), ["send-user-msg", "--session-id", "abc", "-"]);
    assert.equal(formatPushForMuse("x"), `${PUSH_PREFIX}x`);
  });
});

describe("runCommand", () => {
  it("feeds stdin and returns the exit code and stderr", async () => {
    const script = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stderr.write('got '+s);process.exit(3)})";
    assert.deepEqual(await runCommand(process.execPath, ["-e", script], "hello"), { code: 3, stderr: "got hello" });
  });

  it("returns no exit code when the command does not exist", async () => {
    const result = await runCommand("mulmobridge-muse-no-such-command", [], "hello");
    assert.equal(result.code, null);
    assert.match(result.stderr, /ENOENT/);
  });
});

describe("createSerialQueue", () => {
  it("runs tasks one at a time, in order, past a failure", async () => {
    const enqueue = createSerialQueue();
    const order: string[] = [];
    const slow = () => new Promise<void>((resolve) => setTimeout(() => resolve(void order.push("slow")), 20));
    void enqueue(slow);
    void enqueue(async () => {
      order.push("failing");
      throw new Error("boom");
    });
    await enqueue(async () => {
      order.push("fast");
    });
    assert.deepEqual(order, ["slow", "failing", "fast"]);
  });
});
