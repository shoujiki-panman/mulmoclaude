// Local time constants. The plugin can't import the host's
// `server/utils/time.ts` (the runtime is sandboxed), so it mirrors the one
// it needs — keeping the "no raw 1000 / 60000" convention plugin-side too.

export const ONE_SECOND_MS = 1000;
