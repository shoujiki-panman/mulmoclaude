// Holds photos that arrive without a caption for a short while, so the
// question that follows — "Hey Meta, send a photo to MulmoClaude", then
// "…is this joint OK?" — reaches MulmoClaude together with the photo as ONE
// turn. A text from the same sender takes the waiting photos; when none
// arrives in time, the photos go out on their own.

/** Default wait for a follow-up text, in seconds. Long enough for a second
 *  voice command on smart glasses, short enough for a photo sent alone. */
export const DEFAULT_PHOTO_WAIT_SECONDS = 30;
/** Most photos one turn carries; the oldest beyond this are dropped. */
export const MAX_PHOTOS_PER_TURN = 4;
const MS_PER_SECOND = 1000;

// chat-service rejects an empty `text`, so photos sent alone need a body.
// Same instructive prompt as the LINE and Telegram bridges: it makes the
// agent treat the photo as the subject instead of asking what to do.
export const PHOTO_ONLY_PROMPT = "Describe / analyze this file.";
export const PHOTO_MISSING_NOTE = "(note: an attached photo could not be downloaded)";
export const PHOTO_FAILED_REPLY = "Sorry, I couldn't fetch that photo. Please send it again.";

/** The text of a turn: what the sender typed, or the photo-only prompt, plus
 *  a note when some of its photos could not be fetched — so the agent never
 *  answers about a photo it did not receive as if it had. */
export function composePhotoTurnText(question: string | null, missingPhotos: number): string {
  const text = question ?? PHOTO_ONLY_PROMPT;
  return missingPhotos > 0 ? `${text}\n\n${PHOTO_MISSING_NOTE}` : text;
}

/** `WHATSAPP_PHOTO_WAIT_SECONDS` → milliseconds. Unset or unparsable means
 *  the default; `0` (or less) means "send every photo right away". */
export function parsePhotoWaitMs(raw: string | undefined): number {
  const trimmed = raw?.trim() ?? "";
  const seconds = trimmed === "" ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(seconds)) return DEFAULT_PHOTO_WAIT_SECONDS * MS_PER_SECOND;
  return Math.max(0, Math.round(seconds * MS_PER_SECOND));
}

export interface PhotoBuffer<T> {
  /** Hold a photo for `sender`, restarting their wait. */
  hold: (sender: string, photo: T) => void;
  /** The sender's waiting photos, oldest first, removed from the buffer. */
  take: (sender: string) => T[];
}

interface Pending<T> {
  photos: T[];
  timer: ReturnType<typeof setTimeout>;
}

export function createPhotoBuffer<T>(opts: { waitMs: number; onTimeout: (sender: string, photos: T[]) => void }): PhotoBuffer<T> {
  const pending = new Map<string, Pending<T>>();

  function take(sender: string): T[] {
    const entry = pending.get(sender);
    if (!entry) return [];
    clearTimeout(entry.timer);
    pending.delete(sender);
    return entry.photos;
  }

  function hold(sender: string, photo: T): void {
    const photos = [...take(sender), photo].slice(-MAX_PHOTOS_PER_TURN);
    const timer = setTimeout(() => {
      pending.delete(sender);
      opts.onTimeout(sender, photos);
    }, opts.waitMs);
    pending.set(sender, { photos, timer });
  }

  return { hold, take };
}
