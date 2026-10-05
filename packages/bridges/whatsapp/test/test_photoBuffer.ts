import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PHOTO_WAIT_SECONDS,
  MAX_PHOTOS_PER_TURN,
  PHOTO_MISSING_NOTE,
  PHOTO_ONLY_PROMPT,
  composePhotoTurnText,
  createPhotoBuffer,
  parsePhotoWaitMs,
} from "../src/photoBuffer.ts";

const WAIT_MS = 30_000;

describe("parsePhotoWaitMs", () => {
  it("uses the default when unset, blank or unparsable", () => {
    const fallback = DEFAULT_PHOTO_WAIT_SECONDS * 1000;
    assert.equal(parsePhotoWaitMs(undefined), fallback);
    assert.equal(parsePhotoWaitMs("  "), fallback);
    assert.equal(parsePhotoWaitMs("soon"), fallback);
  });

  it("converts seconds, including fractions and padding", () => {
    assert.equal(parsePhotoWaitMs(" 10 "), 10_000);
    assert.equal(parsePhotoWaitMs("2.5"), 2500);
  });

  it("treats zero and negatives as 'send right away'", () => {
    assert.equal(parsePhotoWaitMs("0"), 0);
    assert.equal(parsePhotoWaitMs("-5"), 0);
  });
});

describe("composePhotoTurnText", () => {
  it("passes the sender's question through", () => {
    assert.equal(composePhotoTurnText("is this joint OK?", 0), "is this joint OK?");
  });

  it("uses the photo-only prompt when nothing was typed", () => {
    assert.equal(composePhotoTurnText(null, 0), PHOTO_ONLY_PROMPT);
  });

  it("notes photos that could not be fetched", () => {
    assert.equal(composePhotoTurnText("and now?", 1), `and now?\n\n${PHOTO_MISSING_NOTE}`);
  });
});

describe("createPhotoBuffer", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  function setup() {
    const flushed: { sender: string; photos: string[] }[] = [];
    const buffer = createPhotoBuffer<string>({ waitMs: WAIT_MS, onTimeout: (sender, photos) => flushed.push({ sender, photos }) });
    return { buffer, flushed };
  }

  it("hands a held photo to the sender's next text and cancels the timeout", () => {
    const { buffer, flushed } = setup();
    buffer.hold("alice", "p1");
    assert.deepEqual(buffer.take("alice"), ["p1"]);
    mock.timers.tick(WAIT_MS * 2);
    assert.deepEqual(flushed, []);
    assert.deepEqual(buffer.take("alice"), []);
  });

  it("sends the photo on its own when no text arrives in time", () => {
    const { buffer, flushed } = setup();
    buffer.hold("alice", "p1");
    mock.timers.tick(WAIT_MS - 1);
    assert.deepEqual(flushed, []);
    mock.timers.tick(1);
    assert.deepEqual(flushed, [{ sender: "alice", photos: ["p1"] }]);
    assert.deepEqual(buffer.take("alice"), []);
  });

  it("collects several photos into one turn and restarts the wait on each", () => {
    const { buffer, flushed } = setup();
    buffer.hold("alice", "p1");
    mock.timers.tick(WAIT_MS - 1);
    buffer.hold("alice", "p2");
    mock.timers.tick(WAIT_MS - 1);
    assert.deepEqual(flushed, []);
    mock.timers.tick(1);
    assert.deepEqual(flushed, [{ sender: "alice", photos: ["p1", "p2"] }]);
  });

  it(`keeps only the newest ${MAX_PHOTOS_PER_TURN} photos`, () => {
    const { buffer } = setup();
    const photos = Array.from({ length: MAX_PHOTOS_PER_TURN + 2 }, (_, index) => `p${index}`);
    photos.forEach((photo) => buffer.hold("alice", photo));
    assert.deepEqual(buffer.take("alice"), photos.slice(-MAX_PHOTOS_PER_TURN));
  });

  it("keeps each sender's photos apart", () => {
    const { buffer, flushed } = setup();
    buffer.hold("alice", "a1");
    buffer.hold("bob", "b1");
    assert.deepEqual(buffer.take("bob"), ["b1"]);
    mock.timers.tick(WAIT_MS);
    assert.deepEqual(flushed, [{ sender: "alice", photos: ["a1"] }]);
  });
});
