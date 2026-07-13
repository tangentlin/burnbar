import { describe, expect, it } from "vitest";
import type { EmberField } from "../src/menu-card/animation.js";
import { nextCardSession } from "../src/menu-card/card.js";

describe("nextCardSession", () => {
  it("starts with no ember field on first paint", () => {
    const session = nextCardSession(null);
    expect(session.emberField).toBeNull();
  });

  it("carries the ember field forward untouched (owned by setEmbersActive, not this function)", () => {
    const emberField: EmberField = { startMs: 0, seeds: [] };
    const session = nextCardSession(null);
    const withEmbers = { ...session, emberField };

    const next = nextCardSession(withEmbers);
    expect(next.emberField).toBe(emberField);
  });
});
