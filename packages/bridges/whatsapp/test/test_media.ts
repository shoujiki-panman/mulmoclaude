import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_MEDIA_BYTES, downloadWhatsAppImage, imageMimeType, isTrustedMediaUrl } from "../src/media.ts";

const TOKEN = "test-token";
const MEDIA_URL = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123";
const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

interface Call {
  url: string;
  headers: Headers;
}

function fakeFetch(...responses: (Response | Error)[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function lookupResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mediaResponse(bytes: Buffer, contentType: string | null, status = 200): Response {
  const headers = new Headers(contentType ? { "Content-Type": contentType } : {});
  return new Response(new Uint8Array(bytes), { status, headers });
}

describe("downloadWhatsAppImage", () => {
  it("resolves the media id, then downloads the photo with the token", async () => {
    const { fetchImpl, calls } = fakeFetch(lookupResponse({ url: MEDIA_URL, mime_type: "image/jpeg" }), mediaResponse(PHOTO_BYTES, "image/jpeg"));
    const photo = await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl });
    assert.deepEqual(photo, { mimeType: "image/jpeg", data: PHOTO_BYTES.toString("base64") });
    assert.equal(calls[0]?.url, "https://graph.facebook.com/v21.0/123");
    assert.equal(calls[1]?.url, MEDIA_URL);
    assert.ok(calls.every((call) => call.headers.get("authorization") === `Bearer ${TOKEN}`));
  });

  it("falls back to the declared type when the download has no content type", async () => {
    const { fetchImpl } = fakeFetch(lookupResponse({ url: MEDIA_URL, mime_type: "image/png" }), mediaResponse(PHOTO_BYTES, null));
    const photo = await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl });
    assert.equal(photo?.mimeType, "image/png");
  });

  it("gives up without downloading when the lookup fails", async () => {
    const { fetchImpl, calls } = fakeFetch(lookupResponse({ error: "expired" }, 401));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl }), null);
    assert.equal(calls.length, 1);
  });

  it("never sends the token to a host that isn't Meta's", async () => {
    const { fetchImpl, calls } = fakeFetch(lookupResponse({ url: "https://evil.example.com/x.jpg" }));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl }), null);
    assert.equal(calls.length, 1);
  });

  it("refuses an HTML page served with a 200 even when the lookup said image", async () => {
    const { fetchImpl } = fakeFetch(lookupResponse({ url: MEDIA_URL, mime_type: "image/jpeg" }), mediaResponse(Buffer.from("<html>login</html>"), "text/html"));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl }), null);
  });

  it("refuses a body declared larger than the cap", async () => {
    const oversized = new Response(new Uint8Array(PHOTO_BYTES), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(MAX_MEDIA_BYTES + 1) } });
    const { fetchImpl } = fakeFetch(lookupResponse({ url: MEDIA_URL }), oversized);
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl }), null);
  });

  it("refuses an empty body and a failed download", async () => {
    const empty = fakeFetch(lookupResponse({ url: MEDIA_URL }), mediaResponse(Buffer.alloc(0), "image/jpeg"));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl: empty.fetchImpl }), null);
    const failed = fakeFetch(lookupResponse({ url: MEDIA_URL }), mediaResponse(PHOTO_BYTES, "image/jpeg", 404));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl: failed.fetchImpl }), null);
  });

  it("returns null instead of throwing on a network error", async () => {
    const { fetchImpl } = fakeFetch(new Error("ECONNRESET"));
    assert.equal(await downloadWhatsAppImage("123", { accessToken: TOKEN, fetchImpl }), null);
  });
});

describe("isTrustedMediaUrl", () => {
  it("accepts Meta's media hosts over https", () => {
    assert.equal(isTrustedMediaUrl(MEDIA_URL), true);
    assert.equal(isTrustedMediaUrl("https://graph.facebook.com/v21.0/123"), true);
    assert.equal(isTrustedMediaUrl("https://mmg.whatsapp.net/x"), true);
  });

  it("rejects plain http, look-alike hosts and garbage", () => {
    assert.equal(isTrustedMediaUrl("http://lookaside.fbsbx.com/x"), false);
    assert.equal(isTrustedMediaUrl("https://lookaside.fbsbx.com.evil.example/x"), false);
    assert.equal(isTrustedMediaUrl("https://evilfbsbx.com/x"), false);
    assert.equal(isTrustedMediaUrl("not a url"), false);
  });
});

describe("imageMimeType", () => {
  it("prefers what the download returned", () => {
    assert.equal(imageMimeType("image/png", "image/jpeg"), "image/png");
  });

  it("uses the declared type when the download had none", () => {
    assert.equal(imageMimeType("", "image/webp"), "image/webp");
  });

  it("rejects anything that is not an image", () => {
    assert.equal(imageMimeType("text/html", "image/jpeg"), null);
    assert.equal(imageMimeType("", undefined), null);
    assert.equal(imageMimeType("", "application/pdf"), null);
  });
});
