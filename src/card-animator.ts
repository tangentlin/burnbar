import type { NativeImage } from "electron";
import type { MenuCardData } from "./types.js";

// Self-scheduling (setTimeout, not setInterval) so a slow render never causes
// overlapping frame requests — each frame waits for the previous one to
// resolve before scheduling the next.
const FRAME_INTERVAL_MS = Math.round(1000 / 24);

// Runaway safety net for the bounded (menu-closed) run: an odometer roll +
// stagger tops out well under a second, but if a bug ever left `animating`
// stuck true, this guarantees the loop still stops.
const MAX_BOUNDED_RUN_MS = 1500;

export type RenderCardFrame = (
  data: MenuCardData,
  nowMs: number,
) => Promise<{ image: NativeImage | null; animating: boolean }>;

export type SetEmbersActive = (active: boolean, nowMs: number) => Promise<void>;

export type CardAnimatorOptions = {
  /** Called with every rendered frame (including a null on failure); the tray uses this to update the cached/live icon. */
  onFrame: (image: NativeImage | null) => void;
  now?: () => number;
  scheduleFrame?: (callback: () => void, delayMs: number) => unknown;
  cancelFrame?: (handle: unknown) => void;
};

/**
 * Drives the card renderer's frame-at-a-time API on a bounded or ambient
 * timer, decoupled from *how* a frame is produced (injected) so it's testable
 * without a real hidden window or real timers. Two triggers, one loop:
 *
 * - `onData` — new card figures arrived; pumps frames until the browser
 *   reports the odometer roll / bar growth finished, capped by
 *   {@link MAX_BOUNDED_RUN_MS}.
 * - `setMenuOpen(true)` — the tray menu opened; activates ember particles and
 *   pumps frames indefinitely until the menu closes.
 *
 * Whichever reason is currently active keeps the single loop alive; it stops
 * only once neither applies.
 */
export class CardAnimator {
  private readonly now: () => number;
  private readonly scheduleFrame: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelFrame: (handle: unknown) => void;

  private latestData: MenuCardData | null = null;
  private boundedDeadlineMs: number | null = null;
  private menuOpen = false;
  private runToken = 0;
  private timer: unknown = null;
  // True from the instant a pump loop is decided on until it actually stops.
  // Set synchronously (unlike `timer`, which is only assigned once the first
  // render resolves) so two triggers in the same tick — e.g. `onData()`
  // immediately followed by `setMenuOpen(true)` — can't both decide to start
  // a loop and race two concurrent pumps.
  private looping = false;

  constructor(
    private readonly renderFrame: RenderCardFrame,
    private readonly setEmbersActiveImpl: SetEmbersActive,
    private readonly options: CardAnimatorOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.scheduleFrame = options.scheduleFrame ?? ((cb, ms) => setTimeout(cb, ms));
    this.cancelFrame =
      options.cancelFrame ??
      ((handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));
  }

  /** New card data arrived (the tray already checked its signature changed). */
  onData(data: MenuCardData): void {
    this.latestData = data;
    this.boundedDeadlineMs = this.now() + MAX_BOUNDED_RUN_MS;
    this.ensureLoop();
  }

  /** The tray context menu opened or closed. */
  setMenuOpen(open: boolean): void {
    if (open === this.menuOpen) {
      return;
    }
    this.menuOpen = open;
    void this.setEmbersActiveImpl(open, this.now());
    if (open) {
      this.ensureLoop();
    }
    // Closing doesn't force-stop synchronously: the running loop (if any)
    // observes `menuOpen === false` on its next tick and stops naturally once
    // the browser also reports it's no longer animating.
  }

  dispose(): void {
    this.runToken++;
    this.looping = false;
    if (this.timer !== null) {
      this.cancelFrame(this.timer);
      this.timer = null;
    }
  }

  private ensureLoop(): void {
    if (this.looping) {
      return; // already pumping; it re-reads latestData/menuOpen every tick
    }
    this.looping = true;
    const token = ++this.runToken;
    this.pump(token);
  }

  private pump(token: number): void {
    if (token !== this.runToken || !this.latestData) {
      this.looping = false;
      this.timer = null;
      return;
    }
    const nowMs = this.now();
    const data = this.latestData;
    this.renderFrame(data, nowMs)
      .then(({ image, animating }) => {
        if (token !== this.runToken) {
          return; // superseded by a dispose() or a fresh run
        }
        this.options.onFrame(image);

        const pastDeadline = this.boundedDeadlineMs !== null && nowMs >= this.boundedDeadlineMs;
        const shouldContinue = this.menuOpen || (animating && !pastDeadline);
        if (!shouldContinue) {
          this.boundedDeadlineMs = null;
          this.looping = false;
          this.timer = null;
          return;
        }
        this.timer = this.scheduleFrame(() => this.pump(token), FRAME_INTERVAL_MS);
      })
      .catch(() => {
        if (token === this.runToken) {
          this.looping = false;
          this.timer = null;
        }
      });
  }
}
