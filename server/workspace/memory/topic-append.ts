// Server-side appends to topic-format memory (#1070 layout). The agent
// edits topic files with its own Read / Write tools; this is for
// writers that never go through the agent. Today that is the journal's
// daily memory extraction, which used to append to the legacy
// `memory.md` — a file a topic-format workspace's prompt never reads.

import { errorMessage } from "../../utils/errors.js";
import { log } from "../../system/logger/index.js";
import { writeTopicFile } from "./topic-io.js";
import { queueTopicIndexRegen } from "./topic-index-hook.js";
import { extractH2Sections, firstH2LineIndex, type TopicMemoryFile } from "./topic-types.js";
import type { MemoryType } from "./types.js";

export interface TopicBullet {
  type: MemoryType;
  topic: string;
  /** Markdown bullet line, `- ` prefix included. */
  bullet: string;
}

export interface TopicBulletGroup {
  type: MemoryType;
  topic: string;
  bullets: string[];
}

function topicKey(type: MemoryType, topic: string): string {
  return `${type}/${topic}`;
}

/** Group bullets by `<type>/<topic>`, keeping first-seen order. */
export function groupBulletsByTopic(items: readonly TopicBullet[]): TopicBulletGroup[] {
  const groups = new Map<string, TopicBulletGroup>();
  for (const item of items) {
    const key = topicKey(item.type, item.topic);
    const group = groups.get(key) ?? { type: item.type, topic: item.topic, bullets: [] };
    group.bullets.push(item.bullet);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Add `bullets` under the H1, ahead of the first H2, so they never
 *  land inside an unrelated section. A body without H2 sections gets
 *  them at the end. */
export function appendBulletsToTopicBody(body: string, bullets: readonly string[]): string {
  const lines = body.split("\n");
  const firstH2 = firstH2LineIndex(lines);
  if (firstH2 === -1) return appendToSegment(body, bullets);
  const head = lines.slice(0, firstH2).join("\n");
  const tail = lines.slice(firstH2).join("\n");
  return `${appendToSegment(head, bullets)}\n${tail}`;
}

// Continue a bullet list the segment ends with; after a heading or a
// paragraph, leave a blank line first.
function appendToSegment(segment: string, bullets: readonly string[]): string {
  const trimmed = segment.trimEnd();
  const block = bullets.join("\n");
  if (trimmed.length === 0) return `${block}\n`;
  const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
  const separator = lastLine.trimStart().startsWith("- ") ? "\n" : "\n\n";
  return `${trimmed}${separator}${block}\n`;
}

/** `food-preferences` → `Food preferences`. */
export function humanizeTopicSlug(topic: string): string {
  const words = topic.split("-").join(" ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Body for a topic file that does not exist yet. */
export function newTopicBody(topic: string, bullets: readonly string[]): string {
  return `# ${humanizeTopicSlug(topic)}\n\n${bullets.join("\n")}\n`;
}

/** Write each group into its topic file — appended to the matching
 *  file in `existing`, or a new file — then queue a `MEMORY.md`
 *  rebuild. Returns the workspace-relative paths written. */
export async function appendBulletsToTopicFiles(
  workspaceRoot: string,
  existing: readonly TopicMemoryFile[],
  groups: readonly TopicBulletGroup[],
): Promise<string[]> {
  const byKey = new Map(existing.map((file) => [topicKey(file.type, file.topic), file]));
  const written: string[] = [];
  for (const group of groups) {
    const current = byKey.get(topicKey(group.type, group.topic));
    const body = current ? appendBulletsToTopicBody(current.body, group.bullets) : newTopicBody(group.topic, group.bullets);
    written.push(await writeTopicFile(workspaceRoot, { type: group.type, topic: group.topic, body, sections: extractH2Sections(body) }));
  }
  await rebuildIndex(workspaceRoot);
  return written;
}

// `MEMORY.md` is an index, not the source of truth — the prompt reads
// the topic files — so a failed rebuild is logged, not thrown.
async function rebuildIndex(workspaceRoot: string): Promise<void> {
  try {
    await queueTopicIndexRegen(workspaceRoot);
  } catch (err) {
    log.warn("memory", "topic-append: MEMORY.md rebuild failed", { error: errorMessage(err) });
  }
}
