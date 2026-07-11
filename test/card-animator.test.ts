import { describe, expect, it, vi } from "vitest";
import { CardAnimator } from "../src/card-animator.js";
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

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** A controllable test harness: `now` and the scheduled-frame callback are driven by hand, not real timers. */
function harness(renderResults: Array<{ image: unknown; animating: boolean }>) {
  let nowValue = 0;
  let pending: (() => void) | null = null;
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
    now: () => nowValue,
    scheduleFrame: (cb) => {
      pending = cb;
      return {};
    },
    cancelFrame: () => {
      pending = null;
    },
  });

  return {
    animator,
    frames,
    renderFrame,
    setEmbersActive,
    emberCalls,
    setNow: (value: number) => {
      nowValue = value;
    },
    hasPending: () => pending !== null,
    runPending: async () => {
      const cb = pending;
      expect(cb).not.toBeNull();
      pending = null;
      cb?.();
      await flush();
    },
  };
}

describe("CardAnimator", () => {
  it("pumps frames on a data change until the renderer reports it's done, then stops", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: true },
      { image: "f3", animating: false },
    ]);

    h.animator.onData(FAKE_DATA);
    await flush();
    expect(h.frames).toEqual(["f1"]);
    expect(h.hasPending()).toBe(true);

    await h.runPending();
    expect(h.frames).toEqual(["f1", "f2"]);
    expect(h.hasPending()).toBe(true);

    await h.runPending();
    expect(h.frames).toEqual(["f1", "f2", "f3"]);
    expect(h.hasPending()).toBe(false); // settled — no more frames scheduled
  });

  it("does not render anything before the first onData", async () => {
    const h = harness([{ image: "f1", animating: false }]);
    h.animator.setMenuOpen(false);
    await flush();
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
    await flush();
    expect(h.emberCalls).toEqual([{ active: true, nowMs: 0 }]);

    await h.runPending();
    expect(h.frames).toEqual(["f1", "f2"]);
    expect(h.hasPending()).toBe(true); // menu still open — keeps going despite animating:false

    await h.runPending();
    expect(h.frames).toEqual(["f1", "f2", "f3"]);
    expect(h.hasPending()).toBe(true);
  });

  it("stops one tick after the menu closes, once the renderer also reports done", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: false }, // still "animating" per menuOpen this tick
      { image: "f3", animating: false },
    ]);
    h.animator.onData(FAKE_DATA);
    h.animator.setMenuOpen(true);
    await flush();
    h.animator.setMenuOpen(false);
    expect(h.emberCalls.at(-1)).toEqual({ active: false, nowMs: 0 });

    await h.runPending(); // this tick still observes menuOpen flip mid-flight is fine either way
    // One more tick should see menuOpen=false and animating=false, and stop.
    if (h.hasPending()) {
      await h.runPending();
    }
    expect(h.hasPending()).toBe(false);
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
    await flush();
    // Exactly one frame landed from the single in-flight render, not two
    // concurrent pumps racing each other.
    expect(h.frames).toEqual(["f1"]);
    expect(h.renderFrame).toHaveBeenCalledTimes(1);

    await h.runPending();
    expect(h.frames).toEqual(["f1", "f2"]);
    expect(h.renderFrame).toHaveBeenCalledTimes(2);
    expect(h.hasPending()).toBe(false);
  });

  it("enforces the bounded safety cap when the renderer never reports done and the menu stays closed", async () => {
    const h = harness([{ image: "f", animating: true }]);
    h.animator.onData(FAKE_DATA);
    await flush();
    expect(h.hasPending()).toBe(true);

    h.setNow(10_000); // far past MAX_BOUNDED_RUN_MS
    await h.runPending();
    expect(h.hasPending()).toBe(false);
  });

  it("dispose() stops the loop and ignores any already in-flight render", async () => {
    const h = harness([
      { image: "f1", animating: true },
      { image: "f2", animating: true },
    ]);
    h.animator.onData(FAKE_DATA);
    await flush();
    expect(h.frames).toEqual(["f1"]);

    h.animator.dispose();
    // A pending scheduled frame should have been cancelled...
    expect(h.hasPending()).toBe(false);
  });
});
