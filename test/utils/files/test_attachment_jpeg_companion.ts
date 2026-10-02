// The JPEG companion every attachment ingress path shares (#1996
// follow-up). #1996 converted HEIC / TIFF / BMP / AVIF only in the
// browser upload route; the remote host's Firebase ingest and a
// bridge's inline bytes saved the original as-is, so Claude got
// `image/heic` and the turn failed with a 400. These tests pin the
// helper and the remote-host composition; the agent route's
// inline-bytes hop is pinned in
// test/api/routes/test_agentInlineAttachments.ts.
//
// A stub converter is injected so nothing touches sharp / libheif.

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

type CompanionModule = typeof import("../../../server/utils/files/attachment-jpeg-companion.ts");

let workspaceRoot: string;
let companion: CompanionModule;
let restoreConverter: (() => void) | null = null;
let converterCalls: { bytes: string; sourceMime: string }[] = [];

const STUB_JPEG = Buffer.from("STUB-JPEG", "utf-8");

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

before(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), "mulmoclaude-jpeg-companion-"));
  process.env.MULMOCLAUDE_WORKSPACE_PATH = workspaceRoot;
  companion = await import("../../../server/utils/files/attachment-jpeg-companion.ts");
});

after(async () => {
  delete process.env.MULMOCLAUDE_WORKSPACE_PATH;
  if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
});

beforeEach(() => {
  converterCalls = [];
  const previous = companion.setImageJpegConverterForTests(async (input, sourceMime) => {
    converterCalls.push({ bytes: input.toString("utf-8"), sourceMime });
    return STUB_JPEG;
  });
  restoreConverter = () => companion.setImageJpegConverterForTests(previous);
});

afterEach(() => {
  restoreConverter?.();
  restoreConverter = null;
});

describe("saveAttachmentForClaude", () => {
  it("hands back a .jpg companion for an iPhone HEIC and keeps the original", async () => {
    const saved = await companion.saveAttachmentForClaude(toBase64("heic-bytes"), "image/heic");
    assert.equal(saved.mimeType, "image/jpeg");
    assert.ok(saved.relativePath.endsWith(".jpg"), `expected a .jpg path, got ${saved.relativePath}`);
    assert.deepEqual(await readFile(path.join(workspaceRoot, saved.relativePath)), STUB_JPEG);
    const originalPath = `${saved.relativePath.slice(0, -".jpg".length)}.heic`;
    assert.ok((await stat(path.join(workspaceRoot, originalPath))).isFile(), "the original .heic stays on disk");
    assert.deepEqual(converterCalls, [{ bytes: "heic-bytes", sourceMime: "image/heic" }]);
  });

  it("leaves MIMEs Claude reads natively alone", async () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]) {
      const saved = await companion.saveAttachmentForClaude(toBase64("bytes"), mimeType);
      assert.equal(saved.mimeType, mimeType, `${mimeType} keeps its MIME`);
    }
    assert.equal(converterCalls.length, 0, "the converter never runs for a native MIME");
  });

  it("returns the original when the converter fails, so the bytes are not lost", async () => {
    companion.setImageJpegConverterForTests(async () => {
      throw new Error("libheif unavailable");
    });
    const saved = await companion.saveAttachmentForClaude(toBase64("broken"), "image/heic");
    assert.equal(saved.mimeType, "image/heic");
    assert.ok(saved.relativePath.endsWith(".heic"), `expected the .heic original, got ${saved.relativePath}`);
  });
});

describe("remote-host ingest wired to saveAttachmentForClaude", () => {
  it("gives the spawned chat a JPEG for a photo the phone uploaded as HEIC", async () => {
    const { createIngestAttachments } = await import("../../../server/remoteHost/handlers/ingestAttachments.ts");
    const ingest = createIngestAttachments({
      uid: () => "user-1",
      fetchObject: async () => ({ base64: toBase64("phone-heic"), contentType: "image/heic" }),
      saveAttachment: companion.saveAttachmentForClaude,
      deleteObject: async () => undefined,
    });
    const [attachment] = await ingest(["abc-123"]);
    assert.ok(attachment, "one attachment comes back");
    assert.equal(attachment.mimeType, "image/jpeg");
    assert.ok(attachment.path?.endsWith(".jpg"), `expected a .jpg path, got ${attachment.path}`);
  });
});
