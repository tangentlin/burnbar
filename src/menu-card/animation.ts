// Pure, DOM-free animation primitives shared by every menu-card animation
// (odometer digit-roll, bar-chart growth, ember particles). Deliberately a
// function of an absolute timestamp rather than incremental per-frame state,
// so the same code drives three different clocks: the main process's
// setTimeout-based frame poller (card-animator.ts), a Storybook
// requestAnimationFrame loop, and Vitest assertions at arbitrary instants.

export type EasingFn = (t: number) => number;

export const linear: EasingFn = (t) => t;
export const easeOutQuad: EasingFn = (t) => 1 - (1 - t) * (1 - t);
export const easeOutCubic: EasingFn = (t) => 1 - Math.pow(1 - t, 3);

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

// --- Tween -----------------------------------------------------------------

/**
 * A single eased transition from `startMs` (+ optional `delayMs`, for
 * staggering a group of tweens) over `durationMs`. Stateless by design: the
 * same `Tween` evaluated at any `nowMs` always yields the same progress, so
 * "is it still animating" is just "was `nowMs` asked before it finished".
 */
export type Tween = {
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing: EasingFn;
  readonly delayMs: number;
};

export function createTween(
  startMs: number,
  durationMs: number,
  easing: EasingFn = easeOutCubic,
  delayMs = 0,
): Tween {
  return { startMs, durationMs, easing, delayMs };
}

/** Eased progress in [0,1]; 0 before the delay elapses, 1 once the duration completes. */
export function tweenProgress(tween: Tween, nowMs: number): number {
  const elapsed = nowMs - tween.startMs - tween.delayMs;
  if (elapsed <= 0) {
    return 0;
  }
  if (elapsed >= tween.durationMs) {
    return 1;
  }
  return tween.easing(elapsed / tween.durationMs);
}

export function tweenDone(tween: Tween, nowMs: number): boolean {
  return nowMs - tween.startMs - tween.delayMs >= tween.durationMs;
}

// --- Seeded PRNG -------------------------------------------------------------

/** mulberry32 — tiny deterministic PRNG so particle fields are reproducible from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Ember particle field ---------------------------------------------------

export type EmberConfig = {
  count: number;
  minRadius: number;
  maxRadius: number;
  minLifeMs: number;
  maxLifeMs: number;
  riseDistance: number; // px risen over one life cycle (drawing owns the region geometry)
  maxOpacity: number;
};

type EmberSeed = {
  xFrac: number; // fixed horizontal position, 0..1 across the spawn width
  radius: number;
  lifeMs: number;
  phaseMs: number; // birth offset so particles don't spawn/loop in lockstep
};

/** A reproducible set of ember particles anchored to the instant embers were (re)activated. */
export type EmberField = {
  readonly startMs: number;
  readonly seeds: readonly EmberSeed[];
};

export function createEmberField(seed: number, startMs: number, config: EmberConfig): EmberField {
  const rand = mulberry32(seed);
  const seeds: EmberSeed[] = [];
  for (let i = 0; i < config.count; i++) {
    const lifeMs = lerp(config.minLifeMs, config.maxLifeMs, rand());
    seeds.push({
      xFrac: rand(),
      radius: lerp(config.minRadius, config.maxRadius, rand()),
      lifeMs,
      phaseMs: rand() * lifeMs,
    });
  }
  return { startMs, seeds };
}

export type EmberInstance = {
  xFrac: number;
  riseFrac: number; // 0 (spawn point) .. 1 (fully risen, config.riseDistance away)
  opacity: number;
  radius: number;
};

/**
 * Each particle loops on its own life cycle indefinitely (rise + fade in, fade
 * out near the top, respawn) — a pure function of elapsed time, so the exact
 * same instant always renders the exact same positions regardless of who's
 * asking (the main-process poller, a Storybook RAF loop, a test).
 */
export function emberInstancesAt(
  field: EmberField,
  config: EmberConfig,
  nowMs: number,
): EmberInstance[] {
  const elapsed = Math.max(0, nowMs - field.startMs);
  return field.seeds.map((seed) => {
    const cycle = (elapsed + seed.phaseMs) % seed.lifeMs;
    const t = cycle / seed.lifeMs;
    return {
      xFrac: seed.xFrac,
      riseFrac: easeOutQuad(t),
      // Fades in, holds, fades out within each cycle — cheap single-sine envelope.
      opacity: config.maxOpacity * Math.sin(Math.PI * t),
      radius: seed.radius,
    };
  });
}
