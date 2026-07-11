import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardAnimator, FRAME_INTERVAL_MS, MAX_BOUNDED_RUN_MS } from "../src/card-animator.js";
import type { MenuCardData } from "../src/types.js";

const FAKE_DATA: MenuCardData = {
  cost30d: 10,
  tokens30d: 100,
  topModel: "claude",
  spark: [1, 2, 3],
  todayCost: 1,
  todayTokens: 10,
  dark: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0); // pin Date.now() so nowMs assertions are deterministic
});

afterEach(() => {
  vi.useRealTimers();
});

/** A controllable test harness: `renderFrame`/`setEmbersActive` are mocks; the clock is Vitest's fake timer. */
function harness(renderResults: Array<{ image: unknown; animating: boolean }>) {
  const frames: unknown[] = [];
  const emberCalls: Array<{ active: boolean; nowMs: number }> = [];
  let call = 0;

  const renderFrame = vi.fn(async () => {
    const result = renderResults[Math.min(call, renderResults.length - 1)]!;
    call++;
    return result as { image: never; animating: boolean };
  });
  const setEmbersActive = vi.fn(async (active: boolean, nowMs: number) => {
    emberCalls.push({ active, nowMs });
  });

  const animator = new CardAnimator(renderFrame, setEmbersActive, {
    onFrame: (image) => frames.push(image),
  });

  return { animator, frames, renderFrame, setEmbersActive, emberCalls };
}

describe("CardAnimator", () => {
  it("pumps frames on a data change until the renderer reports it's done, then stops", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: true },
      { image: "f3", animating: false },
    ]);

    h.animator.onData(FAKE_DATA);
    await vi.advanceTimersByTimeAsync(0); // flush the first (synchronously-kicked-off) render
    expect(h.frames).toEqual(["f1"]);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(h.frames).toEqual(["f1", "f2"]);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(h.frames).toEqual(["f1", "f2", "f3"]);

    // Settled — advancing further shouldn't schedule/render anything else.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);
    expect(h.frames).toEqual(["f1", "f2", "f3"]);
    expect(h.renderFrame).toHaveBeenCalledTimes(3);
  });

  it("does not render anything before the first onData", async () => {
    const h = harness([{ image: "f1", animating: false }]);
    h.animator.setMenuOpen(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.frames).toEqual([]);
  });

  it("keeps pumping indefinitely while the menu is open, even once the renderer reports done", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: false },
      { image: "f3", animating: false },
    ]);
    h.animator.onData(FAKE_DATA);
    h.animator.setMenuOpen(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.emberCalls).toEqual([{ active: true, nowMs: 0 }]);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(h.frames).toEqual(["f1", "f2"]);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(h.frames).toEqual(["f1", "f2", "f3"]);

    // Menu still open — keeps going indefinitely despite animating:false.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(h.renderFrame.mock.calls.length).toBeGreaterThan(3);
  });

  it("stops once the menu closes and the renderer also reports done", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: false },
      { image: "f3", animating: false },
    ]);
    h.animator.onData(FAKE_DATA);
    h.animator.setMenuOpen(true);
    await vi.advanceTimersByTimeAsync(0);
    h.animator.setMenuOpen(false);
    expect(h.emberCalls.at(-1)).toEqual({ active: false, nowMs: 0 });

    // Give it a few frames' worth of time to settle after the close.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    const callsAtSettle = h.renderFrame.mock.calls.length;

    // No further renders once it's stopped.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(h.renderFrame).toHaveBeenCalledTimes(callsAtSettle);
  });

  it("a second onData() before the first render resolves doesn't start a duplicate concurrent pump", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: false },
    ]);
    h.animator.onData(FAKE_DATA);
    // Fresh data arrives synchronously, before the in-flight render settles —
    // this is exactly the race `looping` (set before any await) guards against.
    h.animator.onData({ ...FAKE_DATA, todayCost: 2 });
    await vi.advanceTimersByTimeAsync(0);
    // Exactly one frame landed from the single in-flight render, not two
    // concurrent pumps racing each other.
    expect(h.frames).toEqual(["f1"]);
    expect(h.renderFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(h.frames).toEqual(["f1", "f2"]);
    expect(h.renderFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(h.renderFrame).toHaveBeenCalledTimes(2); // settled, no more scheduled
  });

  it("enforces the bounded safety cap when the renderer never reports done and the menu stays closed", async () => {
    const h = harness([{ image: "f", animating: true }]);
    h.animator.onData(FAKE_DATA);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(MAX_BOUNDED_RUN_MS + FRAME_INTERVAL_MS * 2);
    const callsAtCap = h.renderFrame.mock.calls.length;

    // Past the cap, further time shouldn't produce more renders.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);
    expect(h.renderFrame).toHaveBeenCalledTimes(callsAtCap);
  });

  it("dispose() stops the loop and ignores any already in-flight render", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: true },
    ]);
    h.animator.onData(FAKE_DATA);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.frames).toEqual(["f1"]);

    h.animator.dispose();
    // No further renders after dispose, even though the loop was still "animating".
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(h.frames).toEqual(["f1"]);
  });
});
