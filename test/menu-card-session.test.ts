import { describe, expect, it } from "vitest";
import type { EmberField } from "../src/menu-card/animation.js";
import { nextCardSession } from "../src/menu-card/card.js";
import type { MenuCardData } from "../src/types.js";

const BASE: MenuCardData = {
  todayCost: 1,
  cost30d: 10,
  tokens30d: 100,
  todayTokens: 10,
  topModel: "claude",
  spark: [1, 2, 3],
  dark: false,
};

describe("nextCardSession", () => {
  it("starts no odometer roll on first paint, but does reveal the bars", () => {
    const session = nextCardSession(null, BASE, 0);
    expect(session.rollFromData).toBeNull();
    expect(session.odometerStartMs).toBeNull();
    expect(session.barsStartMs).toBe(0);
  });

  it(
    "keeps rollFromData fixed across repeated polls with the same data reference " +
      "(regression: session.data was reused as the roll-from snapshot and got " +
      "clobbered on the very next frame, cutting every roll short after one frame)",
    () => {
      let session = nextCardSession(null, BASE, 0);
      const changed: MenuCardData = { ...BASE, todayCost: 5 };

      session = nextCardSession(session, changed, 100);
      expect(session.odometerStartMs).toBe(100);
      expect(session.rollFromData).toEqual(BASE);

      // CardAnimator polls with the *same* `changed` object reference across
      // every frame of a run — this must not disturb rollFromData/odometerStartMs.
      session = nextCardSession(session, changed, 150);
      expect(session.odometerStartMs).toBe(100);
      expect(session.rollFromData).toEqual(BASE);

      session = nextCardSession(session, changed, 400);
      expect(session.odometerStartMs).toBe(100);
      expect(session.rollFromData).toEqual(BASE);
    },
  );

  it("does not start a roll on a theme-only (`dark`) change", () => {
    let session = nextCardSession(null, BASE, 0);
    session = nextCardSession(session, { ...BASE, dark: true }, 100);
    expect(session.odometerStartMs).toBeNull();
    expect(session.rollFromData).toBeNull();
  });

  it("re-snapshots rollFromData on a second, distinct change", () => {
    let session = nextCardSession(null, BASE, 0);
    const first = { ...BASE, todayCost: 5 };
    session = nextCardSession(session, first, 100);

    const second = { ...first, todayCost: 9 };
    session = nextCardSession(session, second, 500);
    expect(session.rollFromData).toEqual(first);
    expect(session.odometerStartMs).toBe(500);
  });

  it("starts bar growth on first paint and whenever spark changes, not on unrelated stat changes", () => {
    let session = nextCardSession(null, BASE, 0);
    expect(session.barsStartMs).toBe(0);

    session = nextCardSession(session, { ...BASE, todayCost: 5 }, 100);
    expect(session.barsStartMs).toBe(0); // unrelated change — no regrow

    session = nextCardSession(session, { ...BASE, todayCost: 5, spark: [9, 9, 9] }, 200);
    expect(session.barsStartMs).toBe(200);
  });

  it("leaves the ember field untouched (owned by setEmbersActive, not this function)", () => {
    const emberField: EmberField = { startMs: 0, seeds: [] };
    let session = nextCardSession(null, BASE, 0);
    session = { ...session, emberField };

    const next = nextCardSession(session, BASE, 100);
    expect(next.emberField).toBe(emberField);
  });
});
