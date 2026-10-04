// Pure helpers for the hands-free preferences (Settings → Voice → Hands-free).
//
// Per-device by design: whether replies are read aloud or a camera is pointed
// at the workbench depends on the machine in front of the user, not on the
// workspace, so these live in localStorage rather than in settings.json.
// All default OFF — the chat input behaves exactly as before until opted in.

export const HANDS_FREE_PREFS = ["autoSend", "readAloud", "camera"] as const;

export type HandsFreePref = (typeof HANDS_FREE_PREFS)[number];

export const HANDS_FREE_STORAGE_KEYS: Readonly<Record<HandsFreePref, string>> = {
  autoSend: "handsFree.autoSend",
  readAloud: "handsFree.readAloud",
  camera: "handsFree.camera",
};

export function parseStoredHandsFreeFlag(stored: string | null): boolean {
  return stored === "1" || stored === "true";
}

export function serializeHandsFreeFlag(value: boolean): string {
  return value ? "1" : "0";
}
