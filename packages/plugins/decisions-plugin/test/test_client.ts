import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DECISION_TIMEOUT_MS, describeHttpFailure, errorDetailFromBody, postDecision } from "../src/client";
import { buildWireRequest, DECISIONS_ENDPOINT } from "../src/wire";
import { fakeFetch, jsonResponse, OK_RESPONSE, QUESTIONS, sentBody } from "./fixtures";

const REQUEST = buildWireRequest({ model: "decisions-1", questions: QUESTIONS, text: "hello" });

describe("errorDetailFromBody / describeHttpFailure", () => {
  it("prefers OpenAI's error.message over the raw body", () => {
    assert.equal(errorDetailFromBody(JSON.stringify({ error: { message: "Incorrect API key provided" } })), "Incorrect API key provided");
    assert.equal(errorDetailFromBody("upstream timeout"), "upstream timeout");
  });

  it("adds a fix hint for the statuses a user can act on", () => {
    assert.match(describeHttpFailure(401, "{}"), /HTTP 401 — \{\} — OPENAI_API_KEY was rejected/);
    assert.match(describeHttpFailure(404, ""), /^Decisions API returned HTTP 404 — endpoint or model not found/);
    assert.equal(describeHttpFailure(502, "bad gateway"), "Decisions API returned HTTP 502 — bad gateway");
  });
});

describe("postDecision", () => {
  it("POSTs the request with the bearer key, a timeout and the OpenAI-only allowlist", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(OK_RESPONSE));
    assert.deepEqual(await postDecision(fetch, "sk-test", REQUEST), OK_RESPONSE);
    const [call] = calls;
    assert.equal(call?.url, DECISIONS_ENDPOINT);
    assert.equal(call?.opts?.method, "POST");
    assert.equal(call?.opts?.headers?.Authorization, "Bearer sk-test");
    assert.equal(call?.opts?.timeoutMs, DECISION_TIMEOUT_MS);
    assert.deepEqual(call?.opts?.allowedHosts, ["api.openai.com"]);
    assert.deepEqual(sentBody(call), REQUEST);
  });

  it("throws the described failure on a non-2xx response", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ error: { message: "model `decisions-9` does not exist" } }, 404));
    await assert.rejects(postDecision(fetch, "sk-test", REQUEST), /HTTP 404 — model `decisions-9` does not exist — endpoint or model not found/);
  });

  it("lets a network failure propagate", async () => {
    const { fetch } = fakeFetch(() => {
      throw new Error("fetch failed: ECONNRESET");
    });
    await assert.rejects(postDecision(fetch, "sk-test", REQUEST), /ECONNRESET/);
  });
});
