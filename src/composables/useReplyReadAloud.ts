// Reads assistant replies aloud with the browser's speech synthesis
// (hands-free mode). Module-level state: App.vue starts speech when a turn
// finishes, and ChatInput pauses the mic while `speaking` (so the mic never
// transcribes the reply back as the user's turn) and offers a Stop chip.

import { readonly, ref } from "vue";
import { MAX_SPEECH_CHUNK_CHARS, MAX_SPOKEN_CHARS, markdownToSpeechText, speechLangForLocale, splitSpeechChunks } from "../utils/handsFree/speech";

const IDLE_POLL_MS = 250;
// Some engines report neither `speaking` nor `pending` for a moment after
// `speak()` (a network voice still loading); don't call that "done".
const START_GRACE_MS = 1500;

const speaking = ref(false);
let pollHandle: ReturnType<typeof setInterval> | null = null;
// Held so the engine can't garbage-collect a queued utterance — Chrome then
// drops it without ever going idle cleanly.
let queued: SpeechSynthesisUtterance[] = [];

function engine(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
  return window.speechSynthesis;
}

function finish(): void {
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  queued = [];
  speaking.value = false;
}

// Only cancel when something is actually queued: Chrome can silently drop
// the first utterance spoken right after a `cancel()`.
function stopCurrent(synth: SpeechSynthesis): void {
  if (synth.speaking || synth.pending) synth.cancel();
  finish();
}

// `end` events are unreliable across engines (lost on cancel, on some
// voices), so the engine's own busy flags decide when reading is over.
function finishWhenIdle(synth: SpeechSynthesis): void {
  const startedAt = Date.now();
  pollHandle = setInterval(() => {
    const idle = !synth.speaking && !synth.pending;
    if (idle && Date.now() - startedAt >= START_GRACE_MS) finish();
  }, IDLE_POLL_MS);
}

export function isReadAloudSupported(): boolean {
  return engine() !== null;
}

export function cancelReadAloud(): void {
  const synth = engine();
  if (synth) stopCurrent(synth);
  else finish();
}

/** Speak a markdown reply (code, URLs and images left out). Returns whether
 *  anything was queued — false when unsupported or there is nothing to say. */
export function readAloud(markdown: string, locale: string): boolean {
  const synth = engine();
  if (!synth) return false;
  const chunks = splitSpeechChunks(markdownToSpeechText(markdown), MAX_SPEECH_CHUNK_CHARS, MAX_SPOKEN_CHARS);
  if (chunks.length === 0) return false;
  stopCurrent(synth);
  const lang = speechLangForLocale(locale);
  queued = chunks.map((chunk) => Object.assign(new SpeechSynthesisUtterance(chunk), { lang }));
  queued.forEach((utterance) => synth.speak(utterance));
  speaking.value = true;
  finishWhenIdle(synth);
  return true;
}

export function useReplyReadAloud() {
  return { speaking: readonly(speaking), cancel: cancelReadAloud };
}
