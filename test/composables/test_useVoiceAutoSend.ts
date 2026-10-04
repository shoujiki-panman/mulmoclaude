import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick, ref } from "vue";
import { useVoiceAutoSend } from "../../src/composables/useVoiceAutoSend.js";
import { AUTO_SEND_DELAY_MS } from "../../src/utils/handsFree/autoSend.js";

function setup(initiallyReady = false) {
  const ready = ref(initiallyReady);
  let sends = 0;
  const scope = effectScope();
  scope.run(() =>
    useVoiceAutoSend(
      () => ready.value,
      () => {
        sends += 1;
      },
    ),
  );
  return { ready, sends: () => sends, dispose: () => scope.stop() };
}

describe("useVoiceAutoSend", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  it("sends once the gate has stayed open for the full delay", async () => {
    const { ready, sends, dispose } = setup();
    ready.value = true;
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS - 1);
    assert.equal(sends(), 0);
    mock.timers.tick(1);
    assert.equal(sends(), 1);
    dispose();
  });

  it("cancels when the gate closes before the delay ends (the user spoke again)", async () => {
    const { ready, sends, dispose } = setup();
    ready.value = true;
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS / 2);
    ready.value = false;
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS * 2);
    assert.equal(sends(), 0);
    dispose();
  });

  it("restarts the full countdown when the gate reopens", async () => {
    const { ready, sends, dispose } = setup();
    ready.value = true;
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS - 100);
    ready.value = false;
    await nextTick();
    ready.value = true;
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS - 1);
    assert.equal(sends(), 0);
    mock.timers.tick(1);
    assert.equal(sends(), 1);
    dispose();
  });

  it("does not send for a gate that is already open at creation until it changes", async () => {
    // Mounting with a stale ready draft (e.g. returning to a session) must
    // not fire a send the user never triggered in this view.
    const { sends, dispose } = setup(true);
    await nextTick();
    mock.timers.tick(AUTO_SEND_DELAY_MS * 2);
    assert.equal(sends(), 0);
    dispose();
  });

  it("drops a pending send when the scope is disposed", async () => {
    const { ready, sends, dispose } = setup();
    ready.value = true;
    await nextTick();
    dispose();
    mock.timers.tick(AUTO_SEND_DELAY_MS * 2);
    assert.equal(sends(), 0);
  });
});
