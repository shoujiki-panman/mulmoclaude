// Sends a dictated draft once the user has stopped talking for a moment
// (hands-free mode). The decision is the pure `isAutoSendReady`; this owns
// only the "stay ready for AUTO_SEND_DELAY_MS" timer.

import { onScopeDispose, watch } from "vue";
import { AUTO_SEND_DELAY_MS } from "../utils/handsFree/autoSend";

export function useVoiceAutoSend(isReady: () => boolean, send: () => void): void {
  let handle: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (handle === null) return;
    clearTimeout(handle);
    handle = null;
  }

  // Each edge restarts the countdown: resuming speech (or a new segment
  // still transcribing) closes the gate and cancels the pending send.
  watch(isReady, (ready) => {
    cancel();
    if (!ready) return;
    handle = setTimeout(() => {
      handle = null;
      // Re-check: a flag that flipped and flipped back between two
      // watcher flushes never reached the callback above.
      if (isReady()) send();
    }, AUTO_SEND_DELAY_MS);
  });

  onScopeDispose(cancel);
}
