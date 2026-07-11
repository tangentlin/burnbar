import { describe, expect, it } from "vitest";
import {
  createEmberField,
  createTween,
  easeOutCubic,
  easeOutQuad,
  emberInstancesAt,
  lerp,
  linear,
  mulberry32,
  tweenDone,
  tweenProgress,
} from "../src/menu-card/animation.js";

describe("easing functions", () => {
  it.each([
    ["linear", linear],
    ["easeOutQuad", easeOutQuad],
    ["easeOutCubic", easeOutCubic],
  ])("%s maps 0 -> 0 and 1 -> 1", (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
  });

  it("linear is the identity", () => {
    expect(linear(0.5)).toBeCloseTo(0.5);
  });

  it("easeOutQuad/easeOutCubic front-load progress (ahead of linear at t=0.5)", () => {
    expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("lerp", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(5, 5, 0.7)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("Tween", () => {
  it("is 0 before its start, mid-value while running (linear), and 1 once done", () => {
    const tween = createTween(1000, 200, linear);
    expect(tweenProgress(tween, 999)).toBe(0);
    expect(tweenProgress(tween, 1000)).toBe(0);
    expect(tweenProgress(tween, 1100)).toBeCloseTo(0.5);
    expect(tweenProgress(tween, 1200)).toBe(1);
    expect(tweenProgress(tween, 5000)).toBe(1);
  });

  it("honors a delay (used for per-character/per-bar stagger)", () => {
    const tween = createTween(1000, 100, linear, 50);
    expect(tweenProgress(tween, 1040)).toBe(0); // still inside the delay
    expect(tweenProgress(tween, 1100)).toBeCloseTo(0.5); // 50ms into a 100ms run
    expect(tweenProgress(tween, 1150)).toBe(1);
  });

  it("tweenDone flips exactly when progress reaches 1", () => {
    const tween = createTween(0, 100, linear, 10);
    expect(tweenDone(tween, 109)).toBe(false);
    expect(tweenDone(tween, 110)).toBe(true);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces values in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("ember particle field", () => {
  const config = {
    count: 6,
    minRadius: 1,
    maxRadius: 1.6,
    minLifeMs: 1000,
    maxLifeMs: 1000, // fixed life for deterministic cycle-boundary assertions
    riseDistance: 40,
    maxOpacity: 0.4,
  };

  it("yields exactly `count` instances", () => {
    const field = createEmberField(1, 0, config);
    expect(emberInstancesAt(field, config, 0)).toHaveLength(6);
  });

  it("is a pure function of time: the same instant always yields the same instances", () => {
    const field = createEmberField(1, 0, config);
    expect(emberInstancesAt(field, config, 1234)).toEqual(emberInstancesAt(field, config, 1234));
  });

  it("a fixed seed always produces the same field (reproducible pattern on reactivation)", () => {
    const fieldA = createEmberField(99, 0, config);
    const fieldB = createEmberField(99, 5000, config); // different start time, same seed
    const atA = emberInstancesAt(fieldA, config, 500);
    const atB = emberInstancesAt(fieldB, config, 5500); // same elapsed-since-start
    expect(atA).toEqual(atB);
  });

  it("clamps elapsed time at 0 for a `nowMs` before the field started", () => {
    const field = createEmberField(1, 10_000, config);
    expect(() => emberInstancesAt(field, config, 0)).not.toThrow();
  });

  it("opacity stays within [0, maxOpacity] and riseFrac within [0, 1]", () => {
    const field = createEmberField(3, 0, config);
    for (let t = 0; t <= 2000; t += 137) {
      for (const instance of emberInstancesAt(field, config, t)) {
        expect(instance.opacity).toBeGreaterThanOrEqual(0);
        expect(instance.opacity).toBeLessThanOrEqual(config.maxOpacity + 1e-9);
        expect(instance.riseFrac).toBeGreaterThanOrEqual(0);
        expect(instance.riseFrac).toBeLessThanOrEqual(1);
      }
    }
  });
});
