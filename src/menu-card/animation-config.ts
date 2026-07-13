// Tunable knobs for the card's animation(s), in one place so tuning "feel"
// never means hunting through drawing code. See docs/adr/013.
//
// Issues #52 (odometer digit-roll) and #54 (bar-chart grow-from-baseline) were
// removed: both only ever animate while the tray's native dropdown menu is
// closed or about to open, since Electron only repaints a MenuItem's icon at
// menuNeedsUpdate:/menuDidClose: — never while the menu is already open and
// idle — so neither animation could ever be seen. See ADR-013's resolved
// "open verification item."

import type { EmberConfig } from "./animation.js";

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
