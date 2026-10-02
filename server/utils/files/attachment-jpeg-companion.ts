// Save an attachment in a form Claude can read (#1996 follow-up).
//
// Claude's Messages API refuses HEIC / HEIF / TIFF / BMP / AVIF as an
// image `media_type`, so those originals get a `<id>.jpg` companion
// and the caller hands the LLM the JPEG. The original stays on disk,
// and the EXIF sidecar hook in `saveAttachment` has already read it.
//
// Every way bytes enter the attachment store goes through here: the
// browser upload route, a bridge's inline attachment bytes, and the
// remote host's Firebase Storage ingest. #1996 only wired the first,
// so an iPhone photo sent from the phone app or a bridge still reached
// Claude as `image/heic` and the whole turn failed with a 400.

import { log } from "../../system/logger/index.js";
import { errorMessage } from "../errors.js";
import { saveAttachment, saveCompanion, type SavedAttachment } from "./attachment-store.js";
import { CLAUDE_UNSUPPORTED_IMAGE_MIMES, sharpConvertToJpeg, type ConvertToJpeg } from "./image-jpeg-convert.js";

// Module-level so one test swap covers every ingress path instead of
// plumbing a converter param through the upload route, the agent
// route and the remote-host ingest. Production never reassigns it.
let jpegConverter: ConvertToJpeg = sharpConvertToJpeg;

/** Test-only: swap in a stub converter and return the previous one so
 *  the caller can restore it. Production code never calls this. */
export function setImageJpegConverterForTests(converter: ConvertToJpeg): ConvertToJpeg {
  const previous = jpegConverter;
  jpegConverter = converter;
  return previous;
}

/** Give `original` a `.jpg` companion when Claude cannot read its MIME
 *  and return the file the LLM should be handed. A failed conversion
 *  logs and returns the original so the upload is never lost; the turn
 *  then hits the same 400 it would have without the companion. */
export async function addJpegCompanionIfNeeded(original: SavedAttachment, base64: string): Promise<SavedAttachment> {
  if (!CLAUDE_UNSUPPORTED_IMAGE_MIMES.has(original.mimeType)) return original;
  try {
    const jpeg = await jpegConverter(Buffer.from(base64, "base64"), original.mimeType);
    const relativePath = await saveCompanion(original.relativePath, jpeg, ".jpg");
    return { relativePath, mimeType: "image/jpeg" };
  } catch (err) {
    log.warn("attachments", "image-to-jpeg conversion failed, keeping original", {
      path: original.relativePath,
      sourceMime: original.mimeType,
      error: errorMessage(err),
    });
    return original;
  }
}

/** `saveAttachment`, then `addJpegCompanionIfNeeded`. The returned
 *  path and MIME are the ones to put in an `Attachment` for the LLM. */
export async function saveAttachmentForClaude(base64: string, mimeType: string): Promise<SavedAttachment> {
  const original = await saveAttachment(base64, mimeType);
  return addJpegCompanionIfNeeded(original, base64);
}
