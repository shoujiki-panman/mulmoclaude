// Domain IO for `config/personality.json` — the assistant personality
// set in Settings → Personality. Follows the `*-io.ts` pattern: all
// writes go through `writeFileAtomic`, and a missing / unreadable /
// malformed file reads as the all-defaults personality (which adds
// nothing to the system prompt), so a bad hand-edit never blocks a turn.

import path from "node:path";
import { WORKSPACE_FILES, workspacePath } from "../../workspace/paths.js";
import { writeFileAtomic } from "./atomic.js";
import { readTextSafe } from "./safe.js";
import { log } from "../../system/logger/index.js";
import { defaultPersonality, normalizePersonality, type Personality } from "../../../src/types/personality.js";

function personalityFilePath(workspaceRoot?: string): string {
  return path.join(workspaceRoot ?? workspacePath, WORKSPACE_FILES.personality);
}

/** Read the personality, normalised. Never throws on absent state. */
export async function readPersonality(workspaceRoot?: string): Promise<Personality> {
  const text = await readTextSafe(personalityFilePath(workspaceRoot));
  if (text === null) return defaultPersonality();
  try {
    return normalizePersonality(JSON.parse(text));
  } catch {
    log.warn("personality", "personality.json is not valid JSON — using defaults");
    return defaultPersonality();
  }
}

/** Replace the personality. Normalises before writing so the file on
 *  disk is always clean; returns what was written so the route can echo
 *  the canonical value. */
export async function writePersonality(personality: unknown, workspaceRoot?: string): Promise<Personality> {
  const clean = normalizePersonality(personality);
  await writeFileAtomic(personalityFilePath(workspaceRoot), `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}
