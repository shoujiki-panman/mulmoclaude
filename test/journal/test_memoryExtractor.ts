import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildUserPrompt,
  buildTopicUserPrompt,
  extractAndAppendMemory,
  parseExtractedFacts,
  parseTaggedFacts,
  appendFacts,
  filterNewFacts,
  filterNewTaggedFacts,
} from "../../server/workspace/journal/memoryExtractor.js";
import { loadAllTopicFiles, writeTopicFile } from "../../server/workspace/memory/topic-io.js";
import type { TopicMemoryFile } from "../../server/workspace/memory/topic-types.js";
import type { TopicBullet } from "../../server/workspace/memory/topic-append.js";

describe("parseExtractedFacts", () => {
  it("parses bullet-point lines", () => {
    const raw = "- Likes curry\n- Drives a Tesla\n- Lives in Kochi";
    assert.deepEqual(parseExtractedFacts(raw), ["- Likes curry", "- Drives a Tesla", "- Lives in Kochi"]);
  });

  it("returns empty array for NONE", () => {
    assert.deepEqual(parseExtractedFacts("NONE"), []);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parseExtractedFacts(""), []);
  });

  it("filters out non-bullet lines", () => {
    const raw = "Here are the facts:\n- Likes sushi\nSome explanation\n- Has a dog";
    assert.deepEqual(parseExtractedFacts(raw), ["- Likes sushi", "- Has a dog"]);
  });

  it("filters out very short bullets (just dash + space)", () => {
    const raw = "- \n- OK\n- Likes coffee";
    // "- OK" (4 chars) passes the >3 threshold; "- " (2 chars) does not.
    assert.deepEqual(parseExtractedFacts(raw), ["- OK", "- Likes coffee"]);
  });

  it("trims whitespace", () => {
    const raw = "  - Plays piano  \n  - Runs on Sundays  ";
    assert.deepEqual(parseExtractedFacts(raw), ["- Plays piano", "- Runs on Sundays"]);
  });
});

describe("buildUserPrompt", () => {
  it("includes existing memory and excerpts", () => {
    const prompt = buildUserPrompt("- Likes curry", "User: I play piano");
    assert.ok(prompt.includes("Already known"));
    assert.ok(prompt.includes("- Likes curry"));
    assert.ok(prompt.includes("I play piano"));
  });

  it("omits 'Already known' header section when memory is empty", () => {
    const prompt = buildUserPrompt("", "User: hello");
    // The "Already known" header (with the colon + content) should
    // not appear, but the instruction line may mention the phrase.
    assert.ok(!prompt.includes("## Already known"));
    assert.ok(prompt.includes("User: hello"));
  });
});

describe("appendFacts", () => {
  it("appends to existing content", () => {
    const result = appendFacts("# Memory\n\n- Old fact", ["- New fact"]);
    assert.ok(result.includes("- Old fact"));
    assert.ok(result.includes("- New fact"));
    assert.ok(result.endsWith("\n"));
  });

  it("creates header when memory is empty", () => {
    const result = appendFacts("", ["- First fact"]);
    assert.ok(result.startsWith("# Memory"));
    assert.ok(result.includes("- First fact"));
  });

  it("joins multiple facts with newlines", () => {
    const result = appendFacts("# Memory\n", ["- Fact A", "- Fact B", "- Fact C"]);
    assert.ok(result.includes("- Fact A\n- Fact B\n- Fact C"));
  });
});

describe("filterNewFacts", () => {
  it("removes facts already in existing memory", () => {
    const existing = "# Memory\n\n- Likes curry\n- Lives in Kochi\n";
    const newFacts = ["- Likes curry", "- Plays piano", "- Lives in Kochi"];
    assert.deepEqual(filterNewFacts(existing, newFacts), ["- Plays piano"]);
  });

  it("is case-insensitive", () => {
    const existing = "- likes CURRY\n";
    assert.deepEqual(filterNewFacts(existing, ["- Likes curry"]), []);
  });

  it("deduplicates within the new facts themselves", () => {
    assert.deepEqual(filterNewFacts("", ["- Fact A", "- Fact A", "- Fact B"]), ["- Fact A", "- Fact B"]);
  });

  it("returns all facts when memory is empty", () => {
    const facts = ["- Fact X", "- Fact Y"];
    assert.deepEqual(filterNewFacts("", facts), facts);
  });
});

describe("parseTaggedFacts", () => {
  it("reads the [type/topic] tag off each bullet", () => {
    assert.deepEqual(parseTaggedFacts("- [preference/food] Dislikes cilantro\n- [fact/family] Has a dog"), [
      { type: "preference", topic: "food", bullet: "- Dislikes cilantro" },
      { type: "fact", topic: "family", bullet: "- Has a dog" },
    ]);
  });

  it("files an untagged fact under fact/general instead of dropping it", () => {
    assert.deepEqual(parseTaggedFacts("- Plays piano"), [{ type: "fact", topic: "general", bullet: "- Plays piano" }]);
  });

  it("falls back to fact/general when the tag names no memory type", () => {
    assert.deepEqual(parseTaggedFacts("- [food/likes] Likes sushi"), [{ type: "fact", topic: "general", bullet: "- Likes sushi" }]);
  });

  it("slugifies a free-form topic and strips a .md suffix", () => {
    assert.deepEqual(parseTaggedFacts("- [interest/Board Games] Plays Catan\n- [preference/food.md] Likes ramen"), [
      { type: "interest", topic: "board-games", bullet: "- Plays Catan" },
      { type: "preference", topic: "food", bullet: "- Likes ramen" },
    ]);
  });

  it("keeps the type but uses topic `general` when the topic can't become a slug", () => {
    assert.deepEqual(parseTaggedFacts("- [fact/日本語] Lives in Kochi\n- [fact/memory] Owns a bike"), [
      { type: "fact", topic: "general", bullet: "- Lives in Kochi" },
      { type: "fact", topic: "general", bullet: "- Owns a bike" },
    ]);
  });

  it("treats a bracket without a slash as fact text, not a tag", () => {
    assert.deepEqual(parseTaggedFacts("- [sic] Spells it 'colour'"), [{ type: "fact", topic: "general", bullet: "- [sic] Spells it 'colour'" }]);
  });

  it("drops a tag with no fact after it, and NONE", () => {
    assert.deepEqual(parseTaggedFacts("- [fact/family]"), []);
    assert.deepEqual(parseTaggedFacts("NONE"), []);
  });
});

describe("filterNewTaggedFacts", () => {
  it("drops facts already in any topic file (case-insensitive) and repeats within the batch", () => {
    const files: TopicMemoryFile[] = [{ type: "preference", topic: "food", body: "# Food\n\n## Likes\n- Likes sushi\n", sections: ["Likes"] }];
    const facts: TopicBullet[] = [
      { type: "preference", topic: "food", bullet: "- likes SUSHI" },
      { type: "fact", topic: "family", bullet: "- Has a dog" },
      { type: "fact", topic: "pets", bullet: "- has a dog" },
    ];
    assert.deepEqual(filterNewTaggedFacts(files, facts), [{ type: "fact", topic: "family", bullet: "- Has a dog" }]);
  });
});

describe("buildTopicUserPrompt", () => {
  it("lists the existing topics, their bullets, stranded facts and the excerpts", () => {
    const files: TopicMemoryFile[] = [{ type: "preference", topic: "food", body: "# Food\n\n- Likes sushi\n", sections: [] }];
    const prompt = buildTopicUserPrompt(files, ["- Allergic to shrimp"], "[user] hi");
    assert.match(prompt, /## Existing topics:\n\n- preference\/food\.md/);
    assert.match(prompt, /### preference\/food\.md\n\n# Food\n\n- Likes sushi/);
    assert.match(prompt, /## Facts recorded earlier:\n\n- Allergic to shrimp/);
    assert.match(prompt, /## New chat excerpts:\n\n\[user\] hi/);
  });

  it("omits the topic and stranded-fact sections when there are none", () => {
    const prompt = buildTopicUserPrompt([], [], "[user] hi");
    assert.ok(!prompt.includes("## Existing topics"));
    assert.ok(!prompt.includes("## Already known"));
    assert.ok(!prompt.includes("## Facts recorded earlier"));
  });
});

// End to end against a real workspace layout. Before the fix, a topic-format workspace got its facts appended to
// `conversations/memory.md`, which `buildMemoryContext` never reads in that format.
describe("extractAndAppendMemory — topic-format workspace", () => {
  let workspaceRoot: string;
  let legacyPath: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "mulmoclaude-memory-extractor-topic-"));
    legacyPath = path.join(workspaceRoot, "conversations", "memory.md");
    await writeTopicFile(workspaceRoot, { type: "preference", topic: "food", body: "# Food\n\n## Likes\n- Likes sushi\n", sections: [] });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("files the facts into topic files and never writes memory.md", async () => {
    const userPrompts: string[] = [];
    const count = await extractAndAppendMemory({
      workspaceRoot,
      excerpts: "[user] I can't stand cilantro. My dog Pochi turned 3.",
      summarize: async (_system, user) => {
        userPrompts.push(user);
        return "- [preference/food] Dislikes cilantro\n- [fact/family] Has a dog named Pochi\n- [preference/food] Likes sushi";
      },
    });
    assert.equal(count, 2, "the already-known sushi bullet is filtered out");

    const files = await loadAllTopicFiles(workspaceRoot);
    const food = files.find((file) => file.type === "preference" && file.topic === "food");
    assert.ok(food);
    assert.match(food.body, /- Dislikes cilantro/);
    assert.equal(food.body.match(/Likes sushi/g)?.length, 1);
    const family = files.find((file) => file.type === "fact" && file.topic === "family");
    assert.ok(family);
    assert.match(family.body, /- Has a dog named Pochi/);
    assert.equal(existsSync(legacyPath), false);
    assert.match(userPrompts[0] ?? "", /- preference\/food\.md — Likes/);
  });

  it("files facts stranded in memory.md, then moves the file aside", async () => {
    await writeFile(legacyPath, "# Memory\n\nDistilled facts about you and your work.\n\n- Allergic to shrimp\n");
    let userPrompt = "";
    await extractAndAppendMemory({
      workspaceRoot,
      excerpts: "[user] hello",
      summarize: async (_system, user) => {
        userPrompt = user;
        return "- [fact/health] Allergic to shrimp";
      },
    });
    assert.match(userPrompt, /## Facts recorded earlier:\n\n- Allergic to shrimp/);
    const files = await loadAllTopicFiles(workspaceRoot);
    assert.ok(files.some((file) => file.type === "fact" && file.topic === "health" && file.body.includes("- Allergic to shrimp")));
    const names = await readdir(path.join(workspaceRoot, "conversations"));
    assert.ok(!names.includes("memory.md"), "memory.md no longer sits where the next pass would file it again");
    assert.ok(
      names.some((name) => name.startsWith("memory.md.filed-")),
      "its bytes are kept under a .filed- name",
    );
  });

  it("leaves memory.md in place when the LLM call fails", async () => {
    await writeFile(legacyPath, "# Memory\n\n- Allergic to shrimp\n");
    const count = await extractAndAppendMemory({
      workspaceRoot,
      excerpts: "[user] hello",
      summarize: async () => {
        throw new Error("rate limited");
      },
    });
    assert.equal(count, 0);
    assert.equal(existsSync(legacyPath), true);
  });
});

describe("extractAndAppendMemory — legacy layout", () => {
  it("still appends to memory.md when the workspace has no topic directories", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "mulmoclaude-memory-extractor-legacy-"));
    try {
      await mkdir(path.join(workspaceRoot, "conversations"), { recursive: true });
      const count = await extractAndAppendMemory({ workspaceRoot, excerpts: "[user] I play piano", summarize: async () => "- Plays piano" });
      assert.equal(count, 1);
      const content = await readFile(path.join(workspaceRoot, "conversations", "memory.md"), "utf-8");
      assert.match(content, /- Plays piano/);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
