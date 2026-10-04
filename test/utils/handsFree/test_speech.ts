import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markdownToSpeechText, speechLangForLocale, splitSpeechChunks } from "../../../src/utils/handsFree/speech.js";

describe("markdownToSpeechText", () => {
  it("keeps prose and drops markdown syntax", () => {
    assert.equal(markdownToSpeechText("# Step one\n\nHeat the **iron** to _350°C_."), "Step one\nHeat the iron to 350°C.");
  });

  it("drops fenced code blocks but keeps inline code text", () => {
    const text = markdownToSpeechText("Run `yarn dev`.\n\n```bash\nrm -rf node_modules\n```\n\nThen wait.");
    assert.equal(text, "Run yarn dev.\nThen wait.");
  });

  it("reads link text, not the address", () => {
    assert.equal(markdownToSpeechText("See [the datasheet](https://example.com/ds.pdf) first."), "See the datasheet first.");
  });

  it("drops bare URLs and autolinks entirely", () => {
    assert.equal(markdownToSpeechText("Docs: https://example.com/a/b and <https://example.com/c>."), "Docs: and .");
  });

  it("drops images and raw HTML, turning <br> into a line break", () => {
    assert.equal(markdownToSpeechText("![wiring](wiring.png)Before<br>After <span>x</span>"), "Before\nAfter x");
  });

  it("puts each list item on its own line, nested lists included", () => {
    assert.equal(markdownToSpeechText("- Insert R1\n- Bend the legs\n  1. outwards\n- Solder"), "Insert R1\nBend the legs\noutwards\nSolder");
  });

  it("reads a table one row per line, cells comma-separated", () => {
    assert.equal(markdownToSpeechText("| Part | Value |\n|---|---|\n| R1 | 10k |\n| C1 | 100n |"), "Part, Value\nR1, 10k\nC1, 100n");
  });

  it("reads blockquotes as plain lines", () => {
    assert.equal(markdownToSpeechText("> Careful: it is hot.\n>\n> Really."), "Careful: it is hot.\nReally.");
  });

  it("decodes common HTML entities and leaves unknown ones alone", () => {
    assert.equal(markdownToSpeechText("R&amp;D &lt;3 &#x41;&#66; &bogus;"), "R&D <3 AB &bogus;");
  });

  it("ignores an out-of-range numeric entity instead of throwing", () => {
    assert.equal(markdownToSpeechText("x &#99999999; y"), "x &#99999999; y");
  });

  it("returns an empty string for a code-only reply", () => {
    assert.equal(markdownToSpeechText("```js\nconsole.log(1);\n```"), "");
  });

  it("speaks Japanese prose unchanged", () => {
    assert.equal(markdownToSpeechText("まず **はんだごて** を温めます。"), "まず はんだごて を温めます。");
  });
});

describe("splitSpeechChunks", () => {
  it("packs sentences of one line into a single utterance when they fit", () => {
    assert.deepEqual(splitSpeechChunks("One. Two! Three?", 50, 500), ["One. Two! Three?"]);
  });

  it("never merges across lines", () => {
    assert.deepEqual(splitSpeechChunks("Insert R1\nSolder it", 50, 500), ["Insert R1", "Solder it"]);
  });

  it("splits after CJK sentence marks", () => {
    assert.deepEqual(splitSpeechChunks("温めます。差し込みます。", 8, 500), ["温めます。", "差し込みます。"]);
  });

  it("does not split inside a decimal like 3.3V", () => {
    assert.deepEqual(splitSpeechChunks("Use 3.3V here. Not 5V.", 12, 500), ["Use 3.3V", "here.", "Not 5V."]);
  });

  it("breaks a long sentence at a space rather than mid-word", () => {
    const chunks = splitSpeechChunks("alpha beta gamma delta epsilon", 12, 500);
    assert.deepEqual(chunks, ["alpha beta", "gamma delta", "epsilon"]);
    assert.ok(chunks.every((chunk) => chunk.length <= 12));
  });

  it("hard-splits text with no break opportunity", () => {
    assert.deepEqual(splitSpeechChunks("あいうえおかきくけこさし", 5, 500), ["あいうえお", "かきくけこ", "さし"]);
  });

  it("stops before the total budget is exceeded", () => {
    assert.deepEqual(splitSpeechChunks("aaaa\nbbbb\ncccc", 10, 9), ["aaaa", "bbbb"]);
  });

  it("returns nothing for blank text", () => {
    assert.deepEqual(splitSpeechChunks(" \n \n", 10, 100), []);
  });
});

describe("speechLangForLocale", () => {
  it("maps UI locales to BCP 47 voice tags", () => {
    assert.equal(speechLangForLocale("ja"), "ja-JP");
    assert.equal(speechLangForLocale("en"), "en-US");
    assert.equal(speechLangForLocale("pt-BR"), "pt-BR");
  });

  it("passes an unknown locale through unchanged", () => {
    assert.equal(speechLangForLocale("it-IT"), "it-IT");
  });
});
