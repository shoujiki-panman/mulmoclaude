// Server-side appends to topic-format memory — what the journal's daily
// memory extraction writes through now, instead of the legacy
// `memory.md` a topic-format workspace never reads.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  appendBulletsToTopicBody,
  appendBulletsToTopicFiles,
  groupBulletsByTopic,
  humanizeTopicSlug,
  newTopicBody,
} from "../../../server/workspace/memory/topic-append.js";
import { loadAllTopicFiles, topicMemoryIndexPath, writeTopicFile } from "../../../server/workspace/memory/topic-io.js";

describe("memory/topic-append — appendBulletsToTopicBody", () => {
  it("puts bullets under the H1, ahead of the first H2", () => {
    const body = ["# Food", "", "## Likes", "- sushi"].join("\n");
    const expected = ["# Food", "", "- dislikes cilantro", "", "## Likes", "- sushi"].join("\n");
    assert.equal(appendBulletsToTopicBody(body, ["- dislikes cilantro"]), expected);
  });

  it("continues a list that already sits under the H1", () => {
    const body = ["# Food", "", "- likes curry", "", "## Likes", "- sushi"].join("\n");
    const expected = ["# Food", "", "- likes curry", "- dislikes cilantro", "", "## Likes", "- sushi"].join("\n");
    assert.equal(appendBulletsToTopicBody(body, ["- dislikes cilantro"]), expected);
  });

  it("appends to the end of a body without H2 sections", () => {
    assert.equal(appendBulletsToTopicBody("# Food\n\n- likes curry\n", ["- dislikes cilantro"]), "# Food\n\n- likes curry\n- dislikes cilantro\n");
  });

  it("leaves a blank line after a bare H1", () => {
    assert.equal(appendBulletsToTopicBody("# Food\n", ["- likes curry", "- likes ramen"]), "# Food\n\n- likes curry\n- likes ramen\n");
  });
});

describe("memory/topic-append — new topic files", () => {
  it("titles a new file from its slug", () => {
    assert.equal(humanizeTopicSlug("food-preferences"), "Food preferences");
    assert.equal(newTopicBody("family", ["- has a dog"]), "# Family\n\n- has a dog\n");
  });
});

describe("memory/topic-append — groupBulletsByTopic", () => {
  it("groups by type and topic in first-seen order", () => {
    const groups = groupBulletsByTopic([
      { type: "preference", topic: "food", bullet: "- a" },
      { type: "fact", topic: "family", bullet: "- b" },
      { type: "preference", topic: "food", bullet: "- c" },
      { type: "fact", topic: "food", bullet: "- d" },
    ]);
    assert.deepEqual(groups, [
      { type: "preference", topic: "food", bullets: ["- a", "- c"] },
      { type: "fact", topic: "family", bullets: ["- b"] },
      { type: "fact", topic: "food", bullets: ["- d"] },
    ]);
  });
});

describe("memory/topic-append — appendBulletsToTopicFiles", () => {
  let workspaceRoot: string;

  before(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "mulmoclaude-topic-append-"));
  });

  after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("appends to an existing topic, creates a missing one, and rebuilds MEMORY.md", async () => {
    await writeTopicFile(workspaceRoot, { type: "preference", topic: "food", body: "# Food\n\n## Likes\n- sushi\n", sections: [] });
    const existing = await loadAllTopicFiles(workspaceRoot);

    const written = await appendBulletsToTopicFiles(workspaceRoot, existing, [
      { type: "preference", topic: "food", bullets: ["- dislikes cilantro"] },
      { type: "fact", topic: "family", bullets: ["- has a dog named Pochi"] },
    ]);
    assert.deepEqual(written, ["conversations/memory/preference/food.md", "conversations/memory/fact/family.md"]);

    const files = await loadAllTopicFiles(workspaceRoot);
    const food = files.find((file) => file.type === "preference" && file.topic === "food");
    assert.ok(food);
    assert.ok(food.body.indexOf("- dislikes cilantro") < food.body.indexOf("## Likes"), "new bullet sits above the first H2");
    assert.match(food.body, /- sushi/);
    const family = files.find((file) => file.type === "fact" && file.topic === "family");
    assert.ok(family);
    assert.match(family.body, /^# Family\n\n- has a dog named Pochi/m);

    const index = await readFile(topicMemoryIndexPath(workspaceRoot), "utf-8");
    assert.match(index, /- preference\/food\.md — Likes/);
    assert.match(index, /- fact\/family\.md/);
  });
});
