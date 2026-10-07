// Shared test fixtures: a question set covering all three types, an
// in-memory FileOps, and a fake `runtime.fetch`.

import type { FileOps, PluginFetchOptions, PluginRuntime } from "gui-chat-protocol";
import type { QuestionSpec } from "../src/schemas";

export const QUESTIONS: QuestionSpec[] = [
  {
    id: "team",
    type: "choice",
    question: "Which team should own this ticket?",
    options: [
      { id: "payments", description: "Checkout, billing, payments" },
      { id: "frontend", description: "Rendering, layout, browser" },
    ],
  },
  { id: "urgency", type: "score", question: "How urgent is this?", levels: ["Can wait", "This week", "Blocking revenue now"] },
  { id: "is_spam", type: "predicate", question: "Is this spam?" },
];

/** A well-formed response body for QUESTIONS. */
export const OK_RESPONSE = {
  answers: {
    team: { choice: "payments", probabilities: { payments: 0.91, frontend: 0.09 }, confidence: 0.88 },
    urgency: { score: 1.6, probabilities: [0.1, 0.2, 0.7], confidence: 0.8 },
    is_spam: { probability: 0.03 },
  },
};

export function memoryFileOps(files: Record<string, Uint8Array>): FileOps {
  const lookup = (rel: string): Uint8Array => {
    const bytes = files[rel];
    if (bytes === undefined) throw new Error(`ENOENT: ${rel}`);
    return bytes;
  };
  return {
    read: async (rel) => new TextDecoder().decode(lookup(rel)),
    readBytes: async (rel) => lookup(rel),
    write: async () => {},
    readDir: async () => [],
    stat: async (rel) => ({ mtimeMs: 0, size: lookup(rel).byteLength }),
    exists: async (rel) => files[rel] !== undefined,
    unlink: async () => {},
  };
}

export interface RecordedCall {
  url: string;
  opts: PluginFetchOptions | undefined;
}

/** Fake fetch answering every call with `respond(call)`, recording calls. */
export function fakeFetch(respond: (call: RecordedCall) => Response | Promise<Response>): { fetch: PluginRuntime["fetch"]; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: PluginRuntime["fetch"] = async (url, opts) => {
    const call = { url, opts };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** The JSON body a recorded call sent. */
export function sentBody(call: RecordedCall | undefined): unknown {
  const body = call?.opts?.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}
