import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyImageRef, MAX_IMAGE_MEGABYTES, resolveImageUrl } from "../src/images";
import { memoryFileOps } from "./fixtures";

describe("classifyImageRef", () => {
  it("passes https URLs through", () => {
    assert.deepEqual(classifyImageRef("https://example.com/cat.jpg"), { kind: "url", url: "https://example.com/cat.jpg" });
  });

  it("maps artifacts/ paths to an artifacts-relative path and a MIME type", () => {
    assert.deepEqual(classifyImageRef("artifacts/images/2026/10/a.PNG"), { kind: "artifact", rel: "images/2026/10/a.PNG", mime: "image/png" });
    assert.deepEqual(classifyImageRef("artifacts\\images\\b.jpeg"), { kind: "artifact", rel: "images/b.jpeg", mime: "image/jpeg" });
  });

  it("refuses paths outside artifacts/ and says how to fix it", () => {
    assert.throws(() => classifyImageRef("data/attachments/2026/10/photo.png"), /under artifacts\/.*copy the file under artifacts\/ first/s);
    assert.throws(() => classifyImageRef("http://example.com/a.png"), /https:\/\/ URL/);
    assert.throws(() => classifyImageRef("/home/me/mulmoclaude/artifacts/a.png"), /workspace-relative path/);
  });

  it("refuses unsupported types, including names that match Object.prototype keys", () => {
    assert.throws(() => classifyImageRef("artifacts/images/a.heic"), /not a png, jpeg, webp or gif/);
    assert.throws(() => classifyImageRef("artifacts/images/a.constructor"), /not a png, jpeg, webp or gif/);
    assert.throws(() => classifyImageRef("artifacts/images/noextension"), /not a png, jpeg, webp or gif/);
  });
});

describe("resolveImageUrl", () => {
  it("returns https URLs without touching the files", async () => {
    assert.equal(await resolveImageUrl("https://example.com/a.webp", memoryFileOps({})), "https://example.com/a.webp");
  });

  it("reads an artifacts/ image into a base64 data URL", async () => {
    const files = memoryFileOps({ "images/a.png": new Uint8Array([1, 2, 3]) });
    assert.equal(await resolveImageUrl("artifacts/images/a.png", files), "data:image/png;base64,AQID");
  });

  it("rejects an image over the size cap before reading it", async () => {
    const tooBig = new Uint8Array(MAX_IMAGE_MEGABYTES * 1024 * 1024 + 1);
    await assert.rejects(resolveImageUrl("artifacts/big.gif", memoryFileOps({ "big.gif": tooBig })), /larger than 20 MB/);
  });

  it("surfaces a missing file as an error", async () => {
    await assert.rejects(resolveImageUrl("artifacts/missing.png", memoryFileOps({})), /ENOENT/);
  });
});
