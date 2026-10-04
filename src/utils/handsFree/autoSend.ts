// When may a voice-dictated draft be sent on the user's behalf (hands-free
// "auto-send")? Pure so the gate is unit-testable; the timer that waits for
// the gate to STAY open lives in `useVoiceAutoSend`.

/** How long the draft must sit ready — user silent, nothing left to
 *  transcribe — before it goes out. Long enough to start a follow-up
 *  sentence, short enough that the wait doesn't read as the app stalling. */
export const AUTO_SEND_DELAY_MS = 1500;

export interface AutoSendState {
  /** Auto-send is switched on in Settings. */
  enabled: boolean;
  /** The mic is armed for this session. */
  voiceArmed: boolean;
  /** The draft gained dictated text that the user has not edited by hand
   *  since — typing takes over, so a half-corrected line is never sent. */
  dictatedDraft: boolean;
  hasText: boolean;
  /** An utterance is still being recorded. */
  speaking: boolean;
  /** A recorded segment is still being transcribed. */
  transcribing: boolean;
  /** The agent is answering; a send now would only be queued. */
  agentRunning: boolean;
}

export function isAutoSendReady(state: AutoSendState): boolean {
  const userIsDone = !state.speaking && !state.transcribing;
  return state.enabled && state.voiceArmed && state.dictatedDraft && state.hasText && userIsDone && !state.agentRunning;
}
