// Turns an assistant reply (markdown) into what should be SPOKEN, and slices
// it into utterances. Pure — the speech API itself is in `useReplyReadAloud`.
//
// Dropped is whatever a listener can't use: fenced code, raw HTML, images and
// bare URLs. Kept: link text, list items, table cells (one row per line).

import { Marked, type MarkedToken, type Token, type Tokens } from "marked";

/** Longest single utterance. Some engines (Chrome with network voices) cut a
 *  long utterance off after ~15 s, so a reply is queued as several. */
export const MAX_SPEECH_CHUNK_CHARS = 200;
/** How much of one reply is read aloud; anything past it stays on screen. */
export const MAX_SPOKEN_CHARS = 1500;

// A private instance: the app-wide `marked` carries host extensions (wiki
// embeds, …) that only make sense when rendering HTML.
const lexer = new Marked({ gfm: true });

const SILENT_TOKEN_TYPES: ReadonlySet<string> = new Set(["code", "html", "image", "hr", "space", "def"]);
const LINE_BREAK_HTML = /^<br\s*\/?>$/i;
const URL_TEXT = /^(https?:\/\/|mailto:)/i;
// After CJK full stops / marks, or after an ASCII "." followed by whitespace
// (so "3.3V" and "v1.2" stay in one piece).
const SENTENCE_BREAK = /(?<=[。！？!?．])\s*|(?<=\.)\s+/;
const SOFT_BREAK_CHAR = /[\s,、，;；:：]/;

const LOCALE_TO_SPEECH_LANG: Record<string, string> = {
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  es: "es-ES",
  "pt-BR": "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
};

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const MAX_CODE_POINT = 0x10ffff;

/** BCP 47 tag for `SpeechSynthesisUtterance.lang`, from a UI locale. */
export function speechLangForLocale(locale: string): string {
  return LOCALE_TO_SPEECH_LANG[locale] ?? locale;
}

export function markdownToSpeechText(markdown: string): string {
  return normalizeLines(decodeEntities(tokensToSpeech(lexer.lexer(markdown), "\n")));
}

/** Utterances for `text`: sentences packed up to `maxChunkChars`, never
 *  across a line (a list item or heading keeps its own pause), stopping
 *  before the running total passes `maxTotalChars`. */
export function splitSpeechChunks(text: string, maxChunkChars: number, maxTotalChars: number): string[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const chunks = lines.flatMap((line) => packSentences(splitSentences(line, maxChunkChars), maxChunkChars));
  return capTotal(chunks, maxTotalChars);
}

function tokensToSpeech(tokens: readonly Token[], separator: string): string {
  return tokens
    .map(tokenToSpeech)
    .filter((part) => part.length > 0)
    .join(separator);
}

function tokenToSpeech(token: Token): string {
  if (isTokenOfType(token, "html")) return LINE_BREAK_HTML.test(token.raw.trim()) ? "\n" : "";
  if (SILENT_TOKEN_TYPES.has(token.type)) return "";
  if (isTokenOfType(token, "br")) return "\n";
  if (isTokenOfType(token, "link")) return linkToSpeech(token);
  if (isTokenOfType(token, "list")) return listToSpeech(token);
  if (isTokenOfType(token, "table")) return tableToSpeech(token);
  if (isTokenOfType(token, "blockquote")) return tokensToSpeech(token.tokens, "\n");
  const children = childTokens(token);
  return children ? tokensToSpeech(children, "") : leafText(token);
}

// `Token` includes marked's open-ended `Generic` (`type: string`), so a
// plain `token.type === "link"` check doesn't narrow — this guard does.
function isTokenOfType<T extends MarkedToken["type"]>(token: Token, type: T): token is Extract<MarkedToken, { type: T }> {
  return token.type === type;
}

function childTokens(token: Token): Token[] | undefined {
  return "tokens" in token ? token.tokens : undefined;
}

function leafText(token: Token): string {
  return "text" in token && typeof token.text === "string" ? token.text : "";
}

// A link whose visible text is itself the address (GFM autolink) says nothing.
function linkToSpeech(link: Tokens.Link): string {
  const text = tokensToSpeech(link.tokens, "");
  return text === link.href || URL_TEXT.test(text) ? "" : text;
}

function listToSpeech(list: Tokens.List): string {
  return list.items.map((item) => tokensToSpeech(item.tokens, "\n")).join("\n");
}

function tableToSpeech(table: Tokens.Table): string {
  return [table.header, ...table.rows].map((cells) => cells.map((cell) => tokensToSpeech(cell.tokens, "")).join(", ")).join("\n");
}

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, name: string) => decodeEntity(name) ?? match);
}

function decodeEntity(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (!lower.startsWith("#")) return NAMED_ENTITIES[lower];
  const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
  return Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : undefined;
}

function normalizeLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function splitSentences(line: string, maxChunkChars: number): string[] {
  return line
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap((sentence) => wrapLongSentence(sentence, maxChunkChars));
}

// A sentence longer than one utterance breaks at the last comma / space in
// its second half, else hard at the limit (CJK text has no spaces).
function wrapLongSentence(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const cut = softBreakIndex(sentence, max);
  const head = sentence.slice(0, cut).trim();
  const tail = wrapLongSentence(sentence.slice(cut).trim(), max);
  return head.length > 0 ? [head, ...tail] : tail;
}

function softBreakIndex(text: string, max: number): number {
  for (let index = max; index > max / 2; index--) {
    if (SOFT_BREAK_CHAR.test(text.charAt(index - 1))) return index;
  }
  return max;
}

function packSentences(sentences: readonly string[], max: number): string[] {
  return sentences.reduce<string[]>((chunks, sentence) => {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + 1 + sentence.length <= max) return [...chunks.slice(0, -1), `${last} ${sentence}`];
    return [...chunks, sentence];
  }, []);
}

function capTotal(chunks: readonly string[], maxTotal: number): string[] {
  const kept: string[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (total + chunk.length > maxTotal) break;
    kept.push(chunk);
    total += chunk.length;
  }
  return kept;
}
