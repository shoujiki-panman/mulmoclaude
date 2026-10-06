// Route-level checks for /api/config/personality and /api/config/rules:
// GET returns defaults when nothing is stored, PUT persists the
// normalised value (and GET reads it back), and a malformed envelope is
// a 400 that leaves the stored value alone — never a silent reset.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { NextFunction, Request, Response } from "express";

type RouteModule = typeof import("../../server/api/routes/config-assistant.js");
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

interface StackFrame {
  route?: { path: string; stack: { method: string; handle: Handler }[] };
}

let tmpRoot: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let routeMod: RouteModule;

function handlerFor(routePath: string, method: "get" | "put"): Handler {
  const router = routeMod.default as unknown as { stack: StackFrame[] };
  for (const frame of router.stack) {
    if (frame.route?.path !== routePath) continue;
    const layer = frame.route.stack.find((stackLayer) => stackLayer.method === method);
    if (layer) return layer.handle;
  }
  throw new Error(`route ${method.toUpperCase()} ${routePath} not registered`);
}

async function call(routePath: string, method: "get" | "put", body?: unknown): Promise<{ status: number; body: unknown }> {
  const state = { status: 200, body: undefined as unknown };
  const res = {
    headersSent: false,
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  const req = { body, path: routePath } as unknown as Request;
  await handlerFor(routePath, method)(req, res as unknown as Response, () => {});
  return state;
}

before(async () => {
  tmpRoot = await mkdtemp(path.join(tmpdir(), "mulmo-config-assistant-route-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  mkdirSync(path.join(tmpRoot, "mulmoclaude"), { recursive: true });
  routeMod = await import("../../server/api/routes/config-assistant.js");
});

after(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  await rm(tmpRoot, { recursive: true, force: true });
});

const PERSONALITY = "/api/config/personality";
const RULES = "/api/config/rules";

describe("personality route", () => {
  it("GET returns the defaults when nothing is stored", async () => {
    const result = await call(PERSONALITY, "get");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      tone: "default",
      traits: { warmth: "default", enthusiasm: "default", formatting: "default", emoji: "default" },
      customInstructions: "",
    });
  });

  it("PUT stores the normalised value and GET reads it back", async () => {
    const body = { tone: "efficient", traits: { warmth: "less", enthusiasm: "nope" }, customInstructions: "Short answers." };
    const saved = await call(PERSONALITY, "put", body);
    assert.equal(saved.status, 200);
    const expected = {
      tone: "efficient",
      traits: { warmth: "less", enthusiasm: "default", formatting: "default", emoji: "default" },
      customInstructions: "Short answers.",
    };
    assert.deepEqual(saved.body, expected);
    assert.deepEqual((await call(PERSONALITY, "get")).body, expected);
  });

  it("PUT rejects a malformed envelope without touching what is stored", async () => {
    for (const body of [null, [], { tone: "friendly" }, { tone: 1, traits: {}, customInstructions: "" }]) {
      const result = await call(PERSONALITY, "put", body);
      assert.equal(result.status, 400, JSON.stringify(body));
    }
    const stored = (await call(PERSONALITY, "get")).body as { tone: string };
    assert.equal(stored.tone, "efficient");
  });
});

describe("rules route", () => {
  it("GET returns no rules when nothing is stored", async () => {
    assert.deepEqual((await call(RULES, "get")).body, { rules: [], plugins: {} });
  });

  it("PUT stores the normalised value and GET reads it back", async () => {
    const body = {
      rules: [{ id: "r1", kind: "never", text: "Post on social media", enabled: true }],
      plugins: { generateImage: "ask", presentForm: "allow" },
    };
    const saved = await call(RULES, "put", body);
    assert.equal(saved.status, 200);
    const expected = { rules: [{ id: "r1", kind: "never", text: "Post on social media", enabled: true }], plugins: { generateImage: "ask" } };
    assert.deepEqual(saved.body, expected);
    assert.deepEqual((await call(RULES, "get")).body, expected);
  });

  it("PUT accepts a body without plugins", async () => {
    const result = await call(RULES, "put", { rules: [] });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { rules: [], plugins: {} });
  });

  it("PUT rejects a malformed envelope", async () => {
    for (const body of [null, "rules", { rules: {} }, { rules: [], plugins: [] }]) {
      const result = await call(RULES, "put", body);
      assert.equal(result.status, 400, JSON.stringify(body));
    }
  });
});
