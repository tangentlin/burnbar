// Every tunable knob for the card's three animations, in one place so tuning
// "feel" never means hunting through drawing code. See docs/adr/013.

import { easeOutCubic, type EmberConfig } from "./animation.js";

/** Odometer digit-roll (issue #52): each changed digit column rolls in turn. */
export const ODOMETER = {
  durationMs: 260,
  staggerMs: 16, // per-character delay, left→right, for the slot-machine cascade
  easing: easeOutCubic,
};

/** Bar-chart grow-from-baseline reveal (issue #54). */
export const BARS = {
  durationMs: 240,
  staggerMs: 6, // per-bar delay, left→right, for a subtle cascade
  easing: easeOutCubic,
};

/** Ember particles drifting over the bar chart while the menu is open (issue #53). */
export const EMBERS: EmberConfig = {
  count: 6,
  minRadius: 1,
  maxRadius: 1.6,
  minLifeMs: 2600,
  maxLifeMs: 3800,
  riseDistance: 38,
  maxOpacity: 0.4,
};

// Fixed seed: embers form the same pattern every time they (re)activate rather
// than reshuffling on every menu open, which reads as jittery, not alive.
export const EMBER_SEED = 20260711;
