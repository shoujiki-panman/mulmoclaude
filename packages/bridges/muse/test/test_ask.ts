import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { askOutcome, readAll, waitForConnect, type ConnectingSocket } from "../src/ask.ts";
import { EXIT_CODES } from "../src/config.ts";

class FakeSocket extends EventEmitter implements ConnectingSocket {
  connected = false;
}

describe("askOutcome", () => {
  it("prints the answer, ending with a newline", () => {
    assert.deepEqual(askOutcome({ ok: true, reply: "Looks good." }), { stdout: "Looks good.\n", stderr: "", code: EXIT_CODES.ok });
    assert.equal(askOutcome({ ok: true, reply: "done\n" }).stdout, "done\n");
    assert.equal(askOutcome({ ok: true }).stdout, "");
  });

  it("reports MulmoClaude's error on stderr with its own exit code", () => {
    assert.deepEqual(askOutcome({ ok: false, error: "busy", status: 409 }), {
      stdout: "",
      stderr: "Error (409): busy\n",
      code: EXIT_CODES.mulmoError,
    });
  });
});

describe("waitForConnect", () => {
  it("returns straight away when already connected", async () => {
    const socket = new FakeSocket();
    socket.connected = true;
    assert.deepEqual(await waitForConnect(socket, 1), { connected: true });
  });

  it("waits for the connection", async () => {
    const socket = new FakeSocket();
    const pending = waitForConnect(socket, 1000);
    socket.emit("connect");
    assert.deepEqual(await pending, { connected: true });
  });

  it("gives up with the last connection error", async () => {
    const socket = new FakeSocket();
    const pending = waitForConnect(socket, 20);
    socket.emit("connect_error", new Error("ECONNREFUSED"));
    socket.emit("connect_error", new Error("invalid token"));
    assert.deepEqual(await pending, { connected: false, lastError: "invalid token" });
  });

  it("says it timed out when there was no error to report", async () => {
    assert.deepEqual(await waitForConnect(new FakeSocket(), 5), { connected: false, lastError: "timed out" });
  });
});

describe("readAll", () => {
  it("joins every chunk of a stream", async () => {
    assert.equal(await readAll(Readable.from([Buffer.from("is this "), "joint OK?\n"])), "is this joint OK?\n");
  });
});
