// Run at end of the journal daily pass so durable user facts are picked up even if the agent didn't memo them in-conversation.
// The LLM sees what memory already holds and is told to return ONLY new facts (we still de-dupe defensively). Where they go
// follows the workspace's memory layout, because that is what the agent's prompt reads (`buildMemoryContext`):
//   - topic format (`conversations/memory/<type>/<topic>.md`): each fact is filed into a topic file. The prompt never reads
//     the legacy `memory.md` here, so facts appended to it before this fix were invisible — they are filed on the next pass.
//   - the older layouts: facts are appended to `memory.md`, which their prompt still reads.

import { readFileSync, existsSync } from "fs";
import { rename } from "fs/promises";
import path from "path";
import { WORKSPACE_FILES } from "../paths.js";
import { writeFileAtomic } from "../../utils/files/atomic.js";
import { log } from "../../system/logger/index.js";
import { ClaudeCliNotFoundError } from "./archivist-cli.js";
import { hasTopicFormat } from "../memory/topic-detect.js";
import { formatIndexLine, loadAllTopicFiles } from "../memory/topic-io.js";
import { appendBulletsToTopicFiles, groupBulletsByTopic, type TopicBullet } from "../memory/topic-append.js";
import { isSafeTopicSlug, slugifyTopicName, type TopicMemoryFile } from "../memory/topic-types.js";
import { isMemoryType, type MemoryType } from "../memory/types.js";

const EXTRACTION_INSTRUCTIONS = `You are a personal-fact extractor. Given a batch of chat excerpts between a user and an AI assistant, extract ONLY durable facts about the USER — things that would still be true next week.

Categories to look for:
- Food preferences (likes, dislikes, allergies, diet)
- Daily routines & habits (exercise, hobbies, recurring activities)
- Possessions (car, devices, tools)
- Family & pets (members, names, ages)
- Location (city, commute, travel patterns)
- Interests & hobbies (topics they follow, activities)
- Schedule patterns (weekly meetings, monthly tasks)
- Health (conditions, habits)
- Work (job, role, company, work style)
- Coding preferences (tools, conventions, style preferences)
- Communication style (language, verbosity, formality)

Rules:
- Extract ONLY what the user explicitly stated — never infer or guess.
- Each fact should be one concise bullet point.
- If the user corrected a previous fact, output the corrected version only.
- Do NOT extract facts about the AI, the app, or technical implementation details.
- Do NOT extract ephemeral information (today's weather, a specific bug being debugged).`;

const EXTRACTION_SYSTEM_PROMPT = `${EXTRACTION_INSTRUCTIONS}
- Output ONLY the bullet points, one per line, prefixed with "- ". No headers, no categories, no explanation.
- If there are no new user facts, output exactly: NONE`;

const TOPIC_EXTRACTION_SYSTEM_PROMPT = `${EXTRACTION_INSTRUCTIONS}
- Facts under "Facts recorded earlier" were extracted on a previous day but never filed. Output each one that is not already known, the same way as a new fact.
- Output ONLY bullet lines of the form "- [<type>/<topic>] <fact>", one per line. No headers, no explanation.
- <type> is one of:
  - preference: a durable habit, preference, or convention (food likes and dislikes, diet, tools they prefer)
  - interest: a topic, hobby, or domain they follow long-term
  - fact: a concrete personal fact that could become stale (where they live, family, possessions, health and allergies, current work)
  - reference: a pointer to a resource (a path, a URL, a recurring task)
- <topic> is a short lowercase ASCII slug (a-z, 0-9, hyphens). Reuse a topic from "Existing topics" whenever the fact fits it; invent a new slug only when none does.
- If there is nothing to output, output exactly: NONE`;

// A fact whose tag can't be used still lands somewhere the prompt reads, instead of being dropped.
const FALLBACK_TOPIC: { type: MemoryType; topic: string } = { type: "fact", topic: "general" };

export interface MemoryExtractionDeps {
  workspaceRoot: string;
  excerpts: string;
  summarize: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export async function extractAndAppendMemory(deps: MemoryExtractionDeps): Promise<number> {
  if (hasTopicFormat(deps.workspaceRoot)) return extractIntoTopicFiles(deps);
  return extractIntoLegacyFile(deps);
}

async function extractIntoLegacyFile(deps: MemoryExtractionDeps): Promise<number> {
  const memoryPath = path.join(deps.workspaceRoot, WORKSPACE_FILES.memory);
  const existingMemory = existsSync(memoryPath) ? readFileSync(memoryPath, "utf-8") : "";
  const raw = await summarizeOrNull(deps, EXTRACTION_SYSTEM_PROMPT, buildUserPrompt(existingMemory, deps.excerpts));
  if (raw === null) return 0;
  const factsToAppend = filterNewFacts(existingMemory, parseExtractedFacts(raw));
  if (factsToAppend.length === 0) return 0;
  await writeFileAtomic(memoryPath, appendFacts(existingMemory, factsToAppend));
  log.info("memory-extractor", "appended new facts", { count: factsToAppend.length });
  return factsToAppend.length;
}

async function extractIntoTopicFiles(deps: MemoryExtractionDeps): Promise<number> {
  const legacyPath = path.join(deps.workspaceRoot, WORKSPACE_FILES.memory);
  const stranded = readStrandedFacts(legacyPath);
  const knownFiles = await loadAllTopicFiles(deps.workspaceRoot);
  const raw = await summarizeOrNull(deps, TOPIC_EXTRACTION_SYSTEM_PROMPT, buildTopicUserPrompt(knownFiles, stranded, deps.excerpts));
  if (raw === null) return 0;
  // Re-read: the agent may have edited a topic file during the LLM call, and appending to a stale body would drop that edit.
  const files = await loadAllTopicFiles(deps.workspaceRoot);
  const facts = filterNewTaggedFacts(files, parseTaggedFacts(raw));
  if (facts.length > 0) {
    const written = await appendBulletsToTopicFiles(deps.workspaceRoot, files, groupBulletsByTopic(facts));
    log.info("memory-extractor", "filed new facts into topic memory", { count: facts.length, files: written });
  }
  if (stranded.length > 0) await retireLegacyFile(legacyPath);
  return facts.length;
}

// `null` when the LLM call failed (logged). A missing claude CLI still throws so the daily pass can surface it.
async function summarizeOrNull(deps: MemoryExtractionDeps, systemPrompt: string, userPrompt: string): Promise<string | null> {
  try {
    return await deps.summarize(systemPrompt, userPrompt);
  } catch (err) {
    if (err instanceof ClaudeCliNotFoundError) throw err;
    log.warn("memory-extractor", "LLM call failed", {
      error: String(err),
    });
    return null;
  }
}

// Facts an earlier build appended to `memory.md` after the workspace moved to topic format, which the prompt never read.
function readStrandedFacts(legacyPath: string): string[] {
  if (!existsSync(legacyPath)) return [];
  return parseExtractedFacts(readFileSync(legacyPath, "utf-8"));
}

// Keep the bytes, but move them aside so the next pass doesn't file the same facts again. Colons are not filename-safe on Windows.
async function retireLegacyFile(legacyPath: string): Promise<void> {
  const target = `${legacyPath}.filed-${new Date().toISOString().replaceAll(":", "-")}`;
  await rename(legacyPath, target);
  log.info("memory-extractor", "filed the stranded memory.md facts into topic memory", { movedTo: path.basename(target) });
}

export function buildUserPrompt(existingMemory: string, excerpts: string): string {
  const parts: string[] = [];
  if (existingMemory.trim()) {
    parts.push(`## Already known (do NOT repeat these):\n\n${existingMemory}`);
  }
  parts.push(`## New chat excerpts:\n\n${excerpts}`);
  parts.push("\nExtract any NEW user facts not already in the 'Already known' section above. If none, output: NONE");
  return parts.join("\n\n");
}

export function buildTopicUserPrompt(files: readonly TopicMemoryFile[], strandedFacts: readonly string[], excerpts: string): string {
  const parts: string[] = [];
  if (files.length > 0) {
    parts.push(`## Existing topics:\n\n${files.map(formatIndexLine).join("\n")}`);
    parts.push(`## Already known (do NOT repeat these):\n\n${files.map(formatKnownTopic).join("\n\n")}`);
  }
  if (strandedFacts.length > 0) parts.push(`## Facts recorded earlier:\n\n${strandedFacts.join("\n")}`);
  parts.push(`## New chat excerpts:\n\n${excerpts}`);
  parts.push(
    "\nTag every fact you output with its [type/topic]. Skip anything already in the 'Already known' section above. If there is nothing to output, output: NONE",
  );
  return parts.join("\n\n");
}

function formatKnownTopic(file: TopicMemoryFile): string {
  return `### ${file.type}/${file.topic}.md\n\n${file.body.trim()}`;
}

export function parseExtractedFacts(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === "NONE" || trimmed === "") return [];
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .filter((line) => line.length > 3);
}

/** Parse `- [<type>/<topic>] <fact>` lines. An untagged line, or one whose tag doesn't name a memory type, is filed under
 *  `fact/general`; a tag with no fact text after it is dropped. */
export function parseTaggedFacts(raw: string): TopicBullet[] {
  const facts: TopicBullet[] = [];
  for (const line of parseExtractedFacts(raw)) {
    const fact = toTaggedFact(line.slice("- ".length).trim());
    if (fact) facts.push(fact);
  }
  return facts;
}

function toTaggedFact(text: string): TopicBullet | null {
  const tag = readTag(text);
  if (!tag) return { ...FALLBACK_TOPIC, bullet: `- ${text}` };
  if (tag.rest.length === 0) return null;
  return { ...resolveTag(tag.inner), bullet: `- ${tag.rest}` };
}

// `[type/topic] rest` → its parts. No leading bracket, or a bracket without a `/`, is ordinary fact text, not a tag.
function readTag(text: string): { inner: string; rest: string } | null {
  if (!text.startsWith("[")) return null;
  const close = text.indexOf("]");
  if (close === -1) return null;
  const inner = text.slice(1, close);
  if (!inner.includes("/")) return null;
  return { inner, rest: text.slice(close + 1).trim() };
}

function resolveTag(inner: string): { type: MemoryType; topic: string } {
  const [rawType = "", rawTopic = ""] = inner.split("/").map((part) => part.trim());
  if (!isMemoryType(rawType)) return FALLBACK_TOPIC;
  return { type: rawType, topic: resolveTopicSlug(rawTopic) ?? FALLBACK_TOPIC.topic };
}

function resolveTopicSlug(raw: string): string | null {
  const withoutExt = raw.endsWith(".md") ? raw.slice(0, -".md".length) : raw;
  if (isSafeTopicSlug(withoutExt)) return withoutExt;
  const slug = slugifyTopicName(withoutExt);
  return slug !== null && isSafeTopicSlug(slug) ? slug : null;
}

function normalizeFact(fact: string): string {
  return fact.replace(/^- /, "").trim().toLowerCase();
}

export function filterNewFacts(existingMemory: string, facts: readonly string[]): string[] {
  const seen = new Set(parseExtractedFacts(existingMemory).map(normalizeFact));
  const out: string[] = [];
  for (const fact of facts) {
    const key = normalizeFact(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

/** Drop facts whose text already appears as a bullet in any topic file, and repeats within `facts`. */
export function filterNewTaggedFacts(files: readonly TopicMemoryFile[], facts: readonly TopicBullet[]): TopicBullet[] {
  const seen = new Set(files.flatMap((file) => parseExtractedFacts(file.body)).map(normalizeFact));
  const out: TopicBullet[] = [];
  for (const fact of facts) {
    const key = normalizeFact(fact.bullet);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
  }
  return out;
}

export function appendFacts(existing: string, facts: string[]): string {
  const trimmed = existing.trimEnd();
  const factsBlock = facts.join("\n");
  if (!trimmed) {
    return `# Memory\n\nDistilled facts about you and your work.\n\n${factsBlock}\n`;
  }
  return `${trimmed}\n${factsBlock}\n`;
}
