import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MAX_TOTAL_BASE64_BYTES, attachmentMimeType, loadAttachment, loadAttachments, totalBase64Bytes } from "../src/attachments.ts";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("attachmentMimeType", () => {
  it("knows images and PDFs, whatever the case of the extension", () => {
    assert.equal(attachmentMimeType("photos/joint.JPG"), "image/jpeg");
    assert.equal(attachmentMimeType("board.png"), "image/png");
    assert.equal(attachmentMimeType("datasheet.pdf"), "application/pdf");
  });

  it("refuses what Claude can't read natively", () => {
    assert.equal(attachmentMimeType("notes.txt"), null);
    assert.equal(attachmentMimeType("clip.mp4"), null);
    assert.equal(attachmentMimeType("no-extension"), null);
  });
});

describe("loadAttachment / loadAttachments", () => {
  let dir = "";
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mulmobridge-muse-"));
    await writeFile(path.join(dir, "joint.jpg"), JPEG_BYTES);
    await writeFile(path.join(dir, "empty.png"), Buffer.alloc(0));
    await writeFile(path.join(dir, "notes.txt"), "hello");
    await mkdir(path.join(dir, "folder.jpg"));
  });
  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a photo as base64 with its type and name", async () => {
    const result = await loadAttachment(path.join(dir, "joint.jpg"));
    assert.deepEqual(result, { ok: true, value: { mimeType: "image/jpeg", data: JPEG_BYTES.toString("base64"), filename: "joint.jpg" } });
  });

  it("explains what is wrong with a file it refuses", async () => {
    for (const name of ["notes.txt", "empty.png", "folder.jpg", "missing.jpg"]) {
      const result = await loadAttachment(path.join(dir, name));
      assert.equal(result.ok, false, name);
      assert.ok(!result.ok && result.error.includes(name), name);
    }
  });

  it("loads every file, or fails on the first bad one", async () => {
    const good = await loadAttachments([path.join(dir, "joint.jpg"), path.join(dir, "joint.jpg")]);
    assert.equal(good.ok && good.value.length, 2);
    const bad = await loadAttachments([path.join(dir, "joint.jpg"), path.join(dir, "notes.txt")]);
    assert.equal(bad.ok, false);
  });

  it("measures the base64 a set of attachments adds up to", () => {
    assert.equal(totalBase64Bytes([{ data: "abcd" }, { data: "ef" }, { path: "/x" }]), 6);
    assert.ok(MAX_TOTAL_BASE64_BYTES > 0);
  });
});
