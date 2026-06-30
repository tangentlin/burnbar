import type { MenuCardData } from "../types.js";

// Browser-context renderer for the tray's "stats card". The main process drives
// it through `window.__burnbarDrawCard(data)` (see menu-card-window.ts), which
// paints an off-DOM <canvas> and returns a PNG data URL. Pure draw → string: no
// network, no DOM mutation, no Electron — just Canvas 2D.

declare global {
  interface Window {
    __burnbarDrawCard: (data: MenuCardData) => string;
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

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const money = (value: number | null): string => (value === null ? "—" : usd.format(value));
const tokens = (value: number | null): string => (value === null ? "—" : compact.format(value));

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  label: string,
  value: string,
  valueColor: string,
): void {
  ctx.fillStyle = LABEL;
  ctx.font = `600 11px ${FONT_STACK}`;
  ctx.fillText(label, x, top);
  ctx.fillStyle = valueColor;
  ctx.font = `700 20px ${FONT_STACK}`;
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
    const value = Math.max(0, costs[i]);
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

function drawCard(data: MenuCardData): string {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";

  // Transparent background by design: no card fill, content sits on the menu, so
  // the value text adapts to the menu appearance.
  const valueColor = data.dark ? VALUE_DARK : VALUE_LIGHT;
  drawStat(ctx, COL_X[0], 18, "Today", money(data.todayCost), valueColor);
  drawStat(ctx, COL_X[1], 18, "30d cost", money(data.cost30d), valueColor);
  drawStat(ctx, COL_X[0], 66, "30d tokens", tokens(data.tokens30d), valueColor);
  drawStat(ctx, COL_X[1], 66, "Today tokens", tokens(data.todayTokens), valueColor);

  drawBars(ctx, data.spark, 114, 46);

  if (data.topModel) {
    ctx.fillStyle = LABEL;
    ctx.font = `500 11px ${FONT_STACK}`;
    ctx.fillText(`Top model: ${data.topModel}`, PAD, 170);
  }
  ctx.fillStyle = FOOT;
  ctx.font = `400 10px ${FONT_STACK}`;
  ctx.fillText("Estimated from local logs at API rates", PAD, 188);

  return canvas.toDataURL("image/png");
}

window.__burnbarDrawCard = drawCard;

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

window.__burnbarDrawIcon = drawIcon;
