// Downloads an inbound WhatsApp photo. The webhook only carries a media id;
// the Graph API turns that id into a download URL that expires after five
// minutes and, like the id lookup itself, needs the access token. Callers
// therefore resolve the id at send time, never ahead of it.

import type { Attachment } from "@mulmobridge/protocol";
import { isRecord } from "@mulmoclaude/common";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const FETCH_TIMEOUT_MS = 30_000;
/** WhatsApp caps photos at 5 MB; a body past this is not a photo we asked for. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
// The access token rides on the download request, so only Meta's media hosts
// may receive it — a lookup answering with any other URL is refused.
const MEDIA_HOST_SUFFIXES = [".fbsbx.com", ".facebook.com", ".whatsapp.net"];
const USER_AGENT = "mulmobridge-whatsapp";

export interface MediaDownloadOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

interface MediaInfo {
  url: string;
  mimeType?: string;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function isTrustedMediaUrl(raw: string): boolean {
  const url = parseUrl(raw);
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname;
  return MEDIA_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

/** The type to forward, or null when the body isn't a photo. What the
 *  download actually returned wins: a login / error page comes back as HTML
 *  with a 200, and must never be forwarded as an image. */
export function imageMimeType(responseType: string, declaredType: string | undefined): string | null {
  if (responseType && !responseType.startsWith("image/")) return null;
  const mimeType = responseType || declaredType || "";
  return mimeType.startsWith("image/") ? mimeType : null;
}

function requestInit(accessToken: string): RequestInit {
  return {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
}

async function lookupMedia(mediaId: string, opts: MediaDownloadOptions): Promise<MediaInfo | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${GRAPH_API_BASE}/${encodeURIComponent(mediaId)}`, requestInit(opts.accessToken));
  if (!res.ok) {
    console.error(`[whatsapp] media lookup failed: ${res.status}`);
    return null;
  }
  const json: unknown = await res.json();
  if (!isRecord(json) || typeof json.url !== "string") {
    console.error("[whatsapp] media lookup returned no url");
    return null;
  }
  return { url: json.url, ...(typeof json.mime_type === "string" && json.mime_type ? { mimeType: json.mime_type } : {}) };
}

function declaredTooLarge(res: Response): boolean {
  const declared = Number(res.headers.get("content-length"));
  return Number.isFinite(declared) && declared > MAX_MEDIA_BYTES;
}

async function fetchMediaBody(info: MediaInfo, opts: MediaDownloadOptions): Promise<{ bytes: Buffer; contentType: string } | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(info.url, requestInit(opts.accessToken));
  if (!res.ok || declaredTooLarge(res)) {
    console.error(`[whatsapp] media download failed: ${res.status}`);
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) {
    console.error(`[whatsapp] media download rejected: ${bytes.length} bytes`);
    return null;
  }
  return { bytes, contentType: res.headers.get("content-type")?.split(";")[0]?.trim() ?? "" };
}

/** The photo behind `mediaId` as a base64 attachment, or null when it can't
 *  be fetched (expired id, bad token, untrusted URL, not an image, too big). */
export async function downloadWhatsAppImage(mediaId: string, opts: MediaDownloadOptions): Promise<Attachment | null> {
  try {
    const info = await lookupMedia(mediaId, opts);
    if (!info) return null;
    if (!isTrustedMediaUrl(info.url)) {
      console.error("[whatsapp] media url is not on a Meta media host; not sending the token there");
      return null;
    }
    const body = await fetchMediaBody(info, opts);
    if (!body) return null;
    const mimeType = imageMimeType(body.contentType, info.mimeType);
    if (!mimeType) {
      console.error(`[whatsapp] media is not an image: ${body.contentType || "unknown type"}`);
      return null;
    }
    return { mimeType, data: body.bytes.toString("base64") };
  } catch (err) {
    console.error(`[whatsapp] media download error: ${err}`);
    return null;
  }
}
