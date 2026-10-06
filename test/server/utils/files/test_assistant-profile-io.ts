import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { WORKSPACE_FILES } from "../../../../server/workspace/paths.js";
import { readPersonality, writePersonality } from "../../../../server/utils/files/personality-io.js";
import { readRules, writeRules } from "../../../../server/utils/files/rules-io.js";
import { defaultPersonality } from "../../../../src/types/personality.js";

function makeWorkspace(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), "mulmoclaude-profile-io-")));
}

function writeRaw(root: string, relPath: string, content: string): void {
  const target = path.join(root, relPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe("personality-io", () => {
  let root: string;
  before(() => {
    root = makeWorkspace();
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("reads the defaults when the file is missing", async () => {
    assert.deepEqual(await readPersonality(root), defaultPersonality());
  });

  it("reads the defaults when the file is not JSON", async () => {
    writeRaw(root, WORKSPACE_FILES.personality, "{ nope");
    assert.deepEqual(await readPersonality(root), defaultPersonality());
  });

  it("writes the normalised value and reads it back", async () => {
    const saved = await writePersonality({ tone: "friendly", traits: { emoji: "more", warmth: "bogus" }, customInstructions: "  Be brief.  " }, root);
    assert.equal(saved.tone, "friendly");
    assert.equal(saved.traits.emoji, "more");
    assert.equal(saved.traits.warmth, "default");
    assert.equal(saved.customInstructions, "Be brief.");
    assert.deepEqual(await readPersonality(root), saved);
    const onDisk: unknown = JSON.parse(readFileSync(path.join(root, WORKSPACE_FILES.personality), "utf-8"));
    assert.deepEqual(onDisk, saved);
  });
});

describe("rules-io", () => {
  let root: string;
  before(() => {
    root = makeWorkspace();
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("reads no rules when the file is missing or malformed", async () => {
    assert.deepEqual(await readRules(root), { rules: [], plugins: {} });
    writeRaw(root, WORKSPACE_FILES.rules, "[1, 2");
    assert.deepEqual(await readRules(root), { rules: [], plugins: {} });
  });

  it("writes the normalised value and reads it back", async () => {
    const saved = await writeRules(
      {
        rules: [
          { id: "r1", kind: "ask", text: "Ask before booking", enabled: true },
          { id: "r2", kind: "unknown", text: "dropped" },
        ],
        plugins: { generateImage: "never", presentForm: "allow" },
      },
      root,
    );
    assert.deepEqual(saved, { rules: [{ id: "r1", kind: "ask", text: "Ask before booking", enabled: true }], plugins: { generateImage: "never" } });
    assert.deepEqual(await readRules(root), saved);
  });
});
