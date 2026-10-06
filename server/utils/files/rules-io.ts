// Domain IO for `config/rules.json` — the user's rules and plugin
// permissions from Settings → Rules. Follows the `*-io.ts` pattern: all
// writes go through `writeFileAtomic`, and a missing / unreadable /
// malformed file reads as "no custom rules, every plugin allowed", so
// only the built-in defaults apply and a bad hand-edit never blocks a turn.

import path from "node:path";
import { WORKSPACE_FILES, workspacePath } from "../../workspace/paths.js";
import { writeFileAtomic } from "./atomic.js";
import { readTextSafe } from "./safe.js";
import { log } from "../../system/logger/index.js";
import { emptyRules, normalizeRules, type AssistantRules } from "../../../src/types/assistantRules.js";

function rulesFilePath(workspaceRoot?: string): string {
  return path.join(workspaceRoot ?? workspacePath, WORKSPACE_FILES.rules);
}

/** Read the rules, normalised. Never throws on absent state. */
export async function readRules(workspaceRoot?: string): Promise<AssistantRules> {
  const text = await readTextSafe(rulesFilePath(workspaceRoot));
  if (text === null) return emptyRules();
  try {
    return normalizeRules(JSON.parse(text));
  } catch {
    log.warn("rules", "rules.json is not valid JSON — using the defaults only");
    return emptyRules();
  }
}

/** Replace the rules. Normalises before writing so the file on disk is
 *  always clean; returns what was written so the route can echo the
 *  canonical value. */
export async function writeRules(rules: unknown, workspaceRoot?: string): Promise<AssistantRules> {
  const clean = normalizeRules(rules);
  await writeFileAtomic(rulesFilePath(workspaceRoot), `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}
