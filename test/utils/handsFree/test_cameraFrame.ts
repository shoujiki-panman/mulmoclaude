import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scaleToFit, snapshotFileName } from "../../../src/utils/handsFree/cameraFrame.js";

describe("scaleToFit", () => {
  it("shrinks a landscape frame so the long edge fits", () => {
    assert.deepEqual(scaleToFit(1920, 1080, 1568), { width: 1568, height: 882 });
  });

  it("shrinks a portrait frame by its height", () => {
    assert.deepEqual(scaleToFit(1080, 1920, 1568), { width: 882, height: 1568 });
  });

  it("never enlarges a small frame", () => {
    assert.deepEqual(scaleToFit(640, 480, 1568), { width: 640, height: 480 });
  });

  it("reports zero size before the video has a frame", () => {
    assert.deepEqual(scaleToFit(0, 0, 1568), { width: 0, height: 0 });
  });
});

describe("snapshotFileName", () => {
  it("is camera-YYYYMMDD-HHMMSS.jpg in local time, zero-padded", () => {
    assert.equal(snapshotFileName(new Date(2026, 0, 2, 3, 4, 5)), "camera-20260102-030405.jpg");
  });
});
