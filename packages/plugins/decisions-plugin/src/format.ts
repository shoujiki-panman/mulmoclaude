// Pure number → display helpers, shared by the LLM summary (server bundle)
// and the View (browser bundle). Dependency-free.

const PERCENT = 100;

/** 0.8734 → 0.87: two decimals is plenty for a calibrated probability. */
export function roundTo2(value: number): number {
  return Math.round(value * PERCENT) / PERCENT;
}

/** 0.8734 → "87%". Also usable as a CSS width. */
export function formatPercent(value: number): string {
  return `${Math.round(value * PERCENT)}%`;
}

/** 1.4567 → "1.5": a weighted level index needs one decimal. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** Index of the level nearest to a weighted score (0 = the first, lowest
 *  level), clamped to the scale. */
export function nearestLevelIndex(score: number, levelCount: number): number {
  return Math.min(Math.max(Math.round(score), 0), levelCount - 1);
}

/** The level text nearest to a weighted score. */
export function nearestLevel(levels: readonly string[], score: number): string | undefined {
  if (levels.length === 0) return undefined;
  return levels[nearestLevelIndex(score, levels.length)];
}
