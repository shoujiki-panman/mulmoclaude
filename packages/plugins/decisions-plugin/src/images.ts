// Item `image` reference → the image URL the Decisions API receives.
//
//   https://…           passed through unchanged
//   artifacts/<path>     read via runtime.files.artifacts, sent as a base64
//                        data URL
//
// Anything else is refused with the fix in the message: a runtime plugin can
// read only its own scopes plus the shared `artifacts/` dir, so a chat
// attachment under data/attachments/ has to be copied under artifacts/ first.

import type { FileOps } from "gui-chat-protocol";

const ARTIFACTS_PREFIX = "artifacts/";
const BYTES_PER_MEGABYTE = 1024 * 1024;
export const MAX_IMAGE_MEGABYTES = 20;

// A Map rather than an object literal: an extension like `constructor` must
// not resolve to something inherited from Object.prototype.
const MIME_BY_EXTENSION = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

export type ImageRef = { kind: "url"; url: string } | { kind: "artifact"; rel: string; mime: string };

function unsupportedRefMessage(ref: string): string {
  return (
    `image "${ref}" must be an https:// URL or a workspace-relative path under artifacts/. ` +
    "This tool cannot read other workspace folders: copy the file under artifacts/ first " +
    "(e.g. a chat attachment: `cp data/attachments/<...>.png artifacts/images/`) and pass that path."
  );
}

/** Pure: decide how an `image` reference will be sent, or throw why not. */
export function classifyImageRef(ref: string): ImageRef {
  const normalized = ref.replace(/\\/g, "/");
  if (normalized.startsWith("https://")) return { kind: "url", url: normalized };
  if (!normalized.startsWith(ARTIFACTS_PREFIX)) throw new Error(unsupportedRefMessage(ref));
  const extension = normalized.slice(normalized.lastIndexOf(".") + 1).toLowerCase();
  const mime = MIME_BY_EXTENSION.get(extension);
  if (mime === undefined) throw new Error(`image "${ref}" is not a png, jpeg, webp or gif file`);
  return { kind: "artifact", rel: normalized.slice(ARTIFACTS_PREFIX.length), mime };
}

/** Resolve a reference to a URL, reading `artifacts/` files through the
 *  host's traversal-guarded FileOps (an `artifacts/../x` path is rejected
 *  there, not here). */
export async function resolveImageUrl(ref: string, artifacts: FileOps): Promise<string> {
  const image = classifyImageRef(ref);
  if (image.kind === "url") return image.url;
  const { size } = await artifacts.stat(image.rel);
  if (size > MAX_IMAGE_MEGABYTES * BYTES_PER_MEGABYTE) {
    throw new Error(`image "${ref}" is larger than ${MAX_IMAGE_MEGABYTES} MB`);
  }
  const bytes = await artifacts.readBytes(image.rel);
  const base64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  return `data:${image.mime};base64,${base64}`;
}
