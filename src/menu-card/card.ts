import type { CardFrame, MenuCardData } from "../types.js";
import {
  createEmberField,
  type EmberField,
  type EmberInstance,
  emberInstancesAt,
} from "./animation.js";
import { EMBER_SEED, EMBERS } from "./animation-config.js";

// Browser-context renderer for the tray's "stats card". The main process drives
// it through `window.__burnbarRenderCardFrame(data, nowMs)` (see
// menu-card-window.ts), which paints an off-DOM <canvas> for the given instant
// and returns a PNG data URL plus whether more frames are needed. Pure(-ish;
// see `session` below) draw → string: no network, no DOM mutation beyond the
// throwaway canvas, no Electron — just Canvas 2D.
//
// Animation state (`session`) is module-scoped rather than passed in, because
// the hidden BrowserWindow that hosts this page is created once and reused for
// the app's lifetime (see ADR-009) — the main process only supplies the latest
// data and the current time; this module remembers the active ember field
// across frames. (Issues #52/#54 — an odometer roll and a bar-growth reveal —
// were removed: both only ever animated while the tray's native menu was
// closed or about to open, never while a user had it open, so neither could
// ever be seen. See ADR-013.)

declare global {
  interface Window {
    __burnbarRenderCardFrame: (data: MenuCardData, nowMs: number) => CardFrame;
    __burnbarSetEmbersActive: (active: boolean, nowMs: number) => void;
    // Tiny monochrome menu-row glyphs; the main process marks them template images.
    __burnbarDrawIcon: (name: "refresh" | "dashboard") => string;
  }
}

// Logical card geometry (device pixels = logical × SCALE; main tags the image @SCALE).
const SCALE = 2;
const W = 270;
const H = 212;
const PAD = 18;
const COL_GAP = 18;
const COL_W = (W - PAD * 2 - COL_GAP) / 2;
const COL_X = [PAD, PAD + COL_W + COL_GAP];
const BARS_TOP = 114;
const BARS_HEIGHT = 46;

// The card background is transparent — content sits on the native menu surface,
// so the bold value text adapts to the menu appearance (the muted label/foot and
// the warm bars read on both). Warm bars echo Burnbar's "burn" identity.
const LABEL = "#9a9aa8";
const VALUE_DARK = "#f2f2f7";
const VALUE_LIGHT = "#1d1d1f";
const FOOT = "#73737f";
const BAR_TOP = "#e08b54";
const BAR_BOTTOM = "#c4744a";
const AXIS = "rgba(255, 255, 255, 0.06)";
const EMBER_RGB = "232, 141, 84"; // same warm hue family as the bars

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
const LABEL_FONT = `600 11px ${FONT_STACK}`;
const VALUE_FONT = `700 20px ${FONT_STACK}`;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const money = (value: number | null): string => (value === null ? "—" : usd.format(value));
const tokens = (value: number | null): string => (value === null ? "—" : compact.format(value));

/** A label + its bold value. */
function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  label: string,
  value: string,
  valueColor: string,
): void {
  ctx.fillStyle = LABEL;
  ctx.font = LABEL_FONT;
  ctx.fillText(label, x, top);
  ctx.font = VALUE_FONT;
  ctx.fillStyle = valueColor;
  ctx.fillText(value, x, top + 14);
}

/** Warm bar chart of the 30-day daily costs over a faint baseline axis. */
function drawBars(
  ctx: CanvasRenderingContext2D,
  costs: number[],
  top: number,
  height: number,
): void {
  const innerW = W - PAD * 2;
  const baseline = top + height;

  ctx.fillStyle = AXIS;
  ctx.fillRect(PAD, baseline, innerW, 1);

  const max = Math.max(...costs, 0);
  if (max <= 0) {
    return;
  }
  const gap = 2;
  const count = Math.max(costs.length, 1);
  const barW = Math.max(1, (innerW - gap * (count - 1)) / count);
  const gradient = ctx.createLinearGradient(0, top, 0, baseline);
  gradient.addColorStop(0, BAR_TOP);
  gradient.addColorStop(1, BAR_BOTTOM);
  ctx.fillStyle = gradient;

  for (let i = 0; i < costs.length; i++) {
    const value = Math.max(0, costs[i] ?? 0);
    if (value <= 0) {
      continue;
    }
    const barH = Math.max(1, Math.round((value / max) * height));
    const x = PAD + i * (barW + gap);
    ctx.beginPath();
    ctx.roundRect(x, baseline - barH, barW, barH, Math.min(1.5, barW / 2));
    ctx.fill();
  }
}

// --- Ember particles (issue #53) --------------------------------------------

function drawEmbers(ctx: CanvasRenderingContext2D, instances: EmberInstance[]): void {
  const region = { x: PAD, width: W - PAD * 2, top: BARS_TOP };
  for (const instance of instances) {
    if (instance.opacity <= 0.01) {
      continue;
    }
    const x = region.x + instance.xFrac * region.width;
    const y = region.top - instance.riseFrac * EMBERS.riseDistance;
    ctx.save();
    ctx.fillStyle = `rgba(${EMBER_RGB}, ${instance.opacity.toFixed(3)})`;
    ctx.shadowColor = `rgba(${EMBER_RGB}, ${Math.min(1, instance.opacity * 1.4).toFixed(3)})`;
    ctx.shadowBlur = instance.radius * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, instance.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Layout + orchestration --------------------------------------------------

type CardCanvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
let sharedCard: CardCanvas | null = null;

/**
 * Lazily creates one canvas+context and reuses it for every frame. `paintCard`
 * runs up to ~24×/sec while animating (indefinitely while embers are active),
 * so allocating a fresh backing store per frame would be wasteful — each call
 * fully repaints anyway, so a cleared, reused canvas is behaviorally identical.
 */
function cardCanvas(): CardCanvas | null {
  if (sharedCard) {
    return sharedCard;
  }
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  sharedCard = { canvas, ctx };
  return sharedCard;
}

type StatSpec = {
  x: number;
  top: number;
  label: string;
  value: string;
};

/** Paints one frame given already-resolved animation state; owns no session/timing bookkeeping. */
function paintCard(data: MenuCardData, emberInstances: EmberInstance[] | null): CardFrame {
  const card = cardCanvas();
  if (!card) {
    return { png: "", animating: false };
  }
  const { canvas, ctx } = card;
  ctx.resetTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";

  // Transparent background by design: no card fill, content sits on the menu, so
  // the value text adapts to the menu appearance.
  const valueColor = data.dark ? VALUE_DARK : VALUE_LIGHT;
  const stats: StatSpec[] = [
    { x: COL_X[0]!, top: 18, label: "Today", value: money(data.todayCost) },
    { x: COL_X[1]!, top: 18, label: "30d cost", value: money(data.cost30d) },
    { x: COL_X[0]!, top: 66, label: "30d tokens", value: tokens(data.tokens30d) },
    { x: COL_X[1]!, top: 66, label: "Today tokens", value: tokens(data.todayTokens) },
  ];
  for (const stat of stats) {
    drawStat(ctx, stat.x, stat.top, stat.label, stat.value, valueColor);
  }

  drawBars(ctx, data.spark, BARS_TOP, BARS_HEIGHT);

  let animating = false;
  if (emberInstances && emberInstances.length > 0) {
    drawEmbers(ctx, emberInstances);
    animating = true;
  }

  if (data.topModel) {
    ctx.fillStyle = LABEL;
    ctx.font = `500 11px ${FONT_STACK}`;
    ctx.fillText(`Top model: ${data.topModel}`, PAD, 170);
  }
  ctx.fillStyle = FOOT;
  ctx.font = `400 10px ${FONT_STACK}`;
  ctx.fillText("Estimated from local logs at API rates", PAD, 188);

  return { png: canvas.toDataURL("image/png"), animating };
}

export type CardSession = {
  emberField: EmberField | null;
};

/**
 * Pure state transition: carries the active ember field forward from the
 * previous session (or `null` on first paint). No DOM/canvas — kept separate
 * from `renderCardFrame` specifically so it's unit-testable
 * (`test/menu-card-session.test.ts`) without a browser environment.
 */
export function nextCardSession(session: CardSession | null): CardSession {
  return { emberField: session?.emberField ?? null };
}

let session: CardSession | null = null;

/** Forget animation history (used by Storybook/tests so switching examples starts clean). */
export function resetCardSession(): void {
  session = null;
}

/** Renders the card as of `nowMs`. Ember particles ride along whenever `setEmbersActive` last turned them on. */
export function renderCardFrame(data: MenuCardData, nowMs: number): CardFrame {
  session = nextCardSession(session);
  const emberInstances = session.emberField
    ? emberInstancesAt(session.emberField, EMBERS, nowMs)
    : null;

  return paintCard(data, emberInstances);
}

/** Start/stop the ember loop (menu open/close). The pattern's *shape* (particle positions/sizes) stays fixed across activations via `EMBER_SEED` — only its start time is fresh — so it reads as a stable motif, not a reshuffled scatter each time the menu opens. */
export function setEmbersActive(active: boolean, nowMs: number): void {
  if (!session) {
    return; // nothing rendered yet to animate embers over
  }
  session = { ...session, emberField: active ? createEmberField(EMBER_SEED, nowMs, EMBERS) : null };
}

/** A fully static render (no embers) — the settled look, also used by Storybook's reference story. */
export function drawCard(data: MenuCardData): string {
  return paintCard(data, null).png;
}

// Guarded so this module stays importable from plain Node (Vitest, no DOM)
// for the pure exports (e.g. `nextCardSession`) — in the browser, `window`
// is always defined and this always runs.
if (typeof window !== "undefined") {
  window.__burnbarRenderCardFrame = renderCardFrame;
  window.__burnbarSetEmbersActive = setEmbersActive;
}

// --- Menu-row icons -------------------------------------------------------
// Drawn solid-black on transparent; the main process flags them template
// images so macOS tints them to the menu foreground (light/dark aware). Only
// the alpha matters under templating, so the fill color is irrelevant.

const ICON = 16; // logical px (standard macOS menu-item icon size)

function iconContext(): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = ICON * SCALE;
  canvas.height = ICON * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  return ctx;
}

/** A circular "reload" arrow with one arrowhead. */
function drawRefreshIcon(ctx: CanvasRenderingContext2D): void {
  const cx = 8;
  const cy = 8;
  const r = 5;
  const end = Math.PI * (250 / 180); // arc ends upper-left, leaving a top gap
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * (300 / 180), end + Math.PI * 2); // ~310° sweep, clockwise
  ctx.stroke();

  // Arrowhead at the arc's end, pointing along the (clockwise) tangent.
  const px = cx + r * Math.cos(end);
  const py = cy + r * Math.sin(end);
  const dir = { x: -Math.sin(end), y: Math.cos(end) };
  const perp = { x: -dir.y, y: dir.x };
  const tip = { x: px + dir.x * 3.2, y: py + dir.y * 3.2 };
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(px + perp.x * 2.3, py + perp.y * 2.3);
  ctx.lineTo(px - perp.x * 2.3, py - perp.y * 2.3);
  ctx.closePath();
  ctx.fill();
}

/** A small three-bar chart (echoes the card + the dashboard it opens). */
function drawDashboardIcon(ctx: CanvasRenderingContext2D): void {
  const baseline = 13;
  const bars = [
    { x: 3, h: 4.5 },
    { x: 6.8, h: 9 },
    { x: 10.6, h: 6.5 },
  ];
  for (const bar of bars) {
    ctx.beginPath();
    ctx.roundRect(bar.x, baseline - bar.h, 2.6, bar.h, 0.8);
    ctx.fill();
  }
}

function drawIcon(name: "refresh" | "dashboard"): string {
  const ctx = iconContext();
  if (!ctx) {
    return "";
  }
  if (name === "refresh") {
    drawRefreshIcon(ctx);
  } else {
    drawDashboardIcon(ctx);
  }
  return (ctx.canvas as HTMLCanvasElement).toDataURL("image/png");
}

if (typeof window !== "undefined") {
  window.__burnbarDrawIcon = drawIcon;
}
