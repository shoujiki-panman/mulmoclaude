// Turns `--file` paths into attachments. Muse can drop a photo onto the
// gadget with `file.write`, then hand its path to `ask`.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isNativeAttachmentMime, mimeFromExtension } from "@mulmobridge/client";
import type { Attachment } from "@mulmobridge/protocol";
import { errorMessage, failure, type Result } from "./config.js";

const BYTES_PER_MB = 1024 * 1024;
export const MAX_FILE_BYTES = 10 * BYTES_PER_MB;
/** chat-service keeps at most 20 MB of base64 per turn and silently drops
 *  whatever is past it, so refuse such a set up front instead. */
export const MAX_TOTAL_BASE64_BYTES = 20 * BYTES_PER_MB;

/** The type to send, or null for a file Claude can't read natively. */
export function attachmentMimeType(filePath: string): string | null {
  const mimeType = mimeFromExtension(path.extname(filePath).slice(1), "");
  return isNativeAttachmentMime(mimeType) ? mimeType : null;
}

async function sizeProblem(filePath: string): Promise<string | null> {
  const info = await stat(filePath);
  if (!info.isFile()) return "not a regular file";
  if (info.size === 0) return "the file is empty";
  return info.size > MAX_FILE_BYTES ? `larger than ${MAX_FILE_BYTES / BYTES_PER_MB} MB` : null;
}

export async function loadAttachment(filePath: string): Promise<Result<Attachment>> {
  const mimeType = attachmentMimeType(filePath);
  if (!mimeType) return failure(`${filePath}: only images and PDFs can be sent`);
  try {
    const problem = await sizeProblem(filePath);
    if (problem) return failure(`${filePath}: ${problem}`);
    const data = (await readFile(filePath)).toString("base64");
    return { ok: true, value: { mimeType, data, filename: path.basename(filePath) } };
  } catch (err) {
    return failure(`${filePath}: ${errorMessage(err)}`);
  }
}

export function totalBase64Bytes(attachments: readonly Attachment[]): number {
  return attachments.reduce((sum, attachment) => sum + (attachment.data?.length ?? 0), 0);
}

export async function loadAttachments(filePaths: readonly string[]): Promise<Result<Attachment[]>> {
  const results = await Promise.all(filePaths.map(loadAttachment));
  const attachments: Attachment[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    attachments.push(result.value);
  }
  if (totalBase64Bytes(attachments) > MAX_TOTAL_BASE64_BYTES) return failure("the files are too large to send together");
  return { ok: true, value: attachments };
}
