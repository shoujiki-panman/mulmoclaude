// `persistInlineBytesAsPaths` turns a bridge's inline attachment bytes
// into a stored path. An iPhone HEIC must come out of it pointing at
// the JPEG companion, the same as a Vue upload — Claude fails the turn
// with a 400 on `image/heic` (#1996 follow-up). A stub converter keeps
// sharp / libheif out of the test.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

let workspaceRoot: string;
let originalHome: string | undefined;
let persistInlineBytesAsPaths: typeof import("../../../server/api/routes/agent.ts").persistInlineBytesAsPaths;
let restoreConverter: () => void = () => undefined;

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

before(async () => {
  workspaceRoot = await mkdtemp(path.join(tmpdir(), "mulmoclaude-inline-attachments-"));
  originalHome = process.env.HOME;
  process.env.HOME = workspaceRoot;
  process.env.MULMOCLAUDE_WORKSPACE_PATH = workspaceRoot;
  ({ persistInlineBytesAsPaths } = await import("../../../server/api/routes/agent.ts"));
  const companion = await import("../../../server/utils/files/attachment-jpeg-companion.ts");
  const previous = companion.setImageJpegConverterForTests(async () => Buffer.from("STUB-JPEG", "utf-8"));
  restoreConverter = () => companion.setImageJpegConverterForTests(previous);
});

after(async () => {
  restoreConverter();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  delete process.env.MULMOCLAUDE_WORKSPACE_PATH;
  if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
});

describe("persistInlineBytesAsPaths — Claude-unsupported images", () => {
  it("points a bridge's HEIC photo at its JPEG companion and keeps the filename", async () => {
    const out = await persistInlineBytesAsPaths([{ data: toBase64("heic"), mimeType: "image/heic", filename: "IMG_0001.HEIC" }]);
    assert.equal(out?.length, 1);
    const [attachment] = out ?? [];
    assert.ok(attachment);
    assert.equal(attachment.mimeType, "image/jpeg");
    assert.ok(attachment.path?.endsWith(".jpg"), `expected a .jpg path, got ${attachment.path}`);
    assert.equal(attachment.filename, "IMG_0001.HEIC");
  });

  it("stores a PNG as-is", async () => {
    const out = await persistInlineBytesAsPaths([{ data: toBase64("png"), mimeType: "image/png" }]);
    const [attachment] = out ?? [];
    assert.ok(attachment);
    assert.equal(attachment.mimeType, "image/png");
    assert.ok(attachment.path?.endsWith(".png"), `expected a .png path, got ${attachment.path}`);
  });
});
