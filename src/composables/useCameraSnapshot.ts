// Live camera for hands-free mode: a stream the user aims at the workbench,
// and `captureFrame()` to turn its current frame into a JPEG attachment.

import { onScopeDispose, shallowRef } from "vue";
import type { PastedFile } from "../types/pastedFile";
import { SNAPSHOT_JPEG_QUALITY, SNAPSHOT_MAX_EDGE_PX, scaleToFit, snapshotFileName } from "../utils/handsFree/cameraFrame";

// Prefer the rear camera on phones/tablets; desktops just get their default.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" } }, audio: false };

export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export function useCameraSnapshot() {
  const stream = shallowRef<MediaStream | null>(null);
  // Intent, separate from `stream`: a stop() while permission is still being
  // asked must win over the grant that arrives afterwards.
  let wanted = false;
  let starting: Promise<boolean> | null = null;

  async function acquire(): Promise<boolean> {
    try {
      const acquired = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (!wanted) {
        stopTracks(acquired);
        return false;
      }
      stream.value = acquired;
      return true;
    } catch {
      wanted = false;
      return false;
    }
  }

  /** Resolves false when the camera is unavailable or permission is denied. */
  function start(): Promise<boolean> {
    wanted = true;
    if (stream.value) return Promise.resolve(true);
    // `.finally` (not a `finally` inside `acquire`) so the slot is cleared
    // only after it was assigned, even if `acquire` settles synchronously.
    starting ??= acquire().finally(() => {
      starting = null;
    });
    return starting;
  }

  function stop(): void {
    wanted = false;
    if (stream.value) stopTracks(stream.value);
    stream.value = null;
  }

  onScopeDispose(stop);

  return { stream, start, stop };
}

/** The video's current frame as a JPEG attachment, or null before the first
 *  frame has arrived. */
export function captureFrame(video: HTMLVideoElement, now: Date = new Date()): PastedFile | null {
  const size = scaleToFit(video.videoWidth, video.videoHeight, SNAPSHOT_MAX_EDGE_PX);
  if (size.width === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, size.width, size.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", SNAPSHOT_JPEG_QUALITY), name: snapshotFileName(now), mime: "image/jpeg" };
}
