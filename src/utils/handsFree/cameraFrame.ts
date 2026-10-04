// Pure sizing / naming for hands-free camera snapshots. The capture itself
// (canvas draw of the live <video>) is in `useCameraSnapshot`.

/** Longest edge of a snapshot sent to the agent. Claude scales anything with
 *  a longer edge down before looking at it, so a bigger frame only costs
 *  upload time. */
export const SNAPSHOT_MAX_EDGE_PX = 1568;
export const SNAPSHOT_JPEG_QUALITY = 0.85;

/** `width`×`height` shrunk (never enlarged) so the longer edge is at most
 *  `maxEdge`; zero size while the video has no frame yet. */
export function scaleToFit(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** `camera-YYYYMMDD-HHMMSS.jpg` in local time — sortable and filename-safe. */
export function snapshotFileName(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `camera-${date}-${time}.jpg`;
}
