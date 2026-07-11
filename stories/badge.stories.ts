import type { Meta, StoryObj } from "@storybook/html-vite";
// Extension-less so Vite resolves the .ts (the module's own imports are type-only,
// so nothing needs runtime .js→.ts resolution). The compositor is the *real* one
// shipped in the app — this story is not a re-implementation.
import { type IconAppearance, type UpdateBadge, composeBadgedIconBitmap } from "../src/tray-icon";

const meta: Meta = {
  title: "Update/Tray icon badge",
  parameters: {
    docs: {
      description: {
        component:
          "The real `composeBadgedIconBitmap` run in the browser against the committed tray template. " +
          "Colors are interpreted as premultiplied **BGRA** (Electron's macOS bitmap format) — the story is " +
          "self-consistent, so it validates dot geometry, contrast, and the light/dark glyph recolor, but the " +
          "true macOS channel order can only be confirmed on a Mac.",
      },
    },
  },
};
export default meta;

const BASE_ICON_URL = "/icon@2x.png"; // served from assets/ via staticDirs
const PREVIEW_SCALE = 5; // enlarge the 44px device bitmap so pixels are legible

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable");
  }
  return ctx;
}

/** Load the committed tray template and read its pixels (alpha carries the glyph). */
async function loadBaseBitmap(): Promise<{ data: Uint8Array; width: number; height: number }> {
  const img = new Image();
  img.src = BASE_ICON_URL;
  await img.decode();
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = context2d(canvas);
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data: new Uint8Array(data.buffer.slice(0)), width, height };
}

/** Un-premultiply one channel by its pixel's alpha (0–255) for canvas display. */
function unpremultiply(value: number, alpha: number): number {
  return alpha === 0 ? 0 : Math.min(255, Math.round((value * 255) / alpha));
}

/** Premultiplied-BGRA (compositor output) → straight-RGBA canvas, scaled up crisp. */
function bitmapToCanvas(out: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const alpha = out[i * 4 + 3];
    rgba[i * 4] = unpremultiply(out[i * 4 + 2], alpha); // R (from BGRA index 2)
    rgba[i * 4 + 1] = unpremultiply(out[i * 4 + 1], alpha); // G
    rgba[i * 4 + 2] = unpremultiply(out[i * 4], alpha); // B (from BGRA index 0)
    rgba[i * 4 + 3] = alpha;
  }
  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  context2d(src).putImageData(new ImageData(rgba, width, height), 0, 0);

  const scaled = document.createElement("canvas");
  scaled.width = width * PREVIEW_SCALE;
  scaled.height = height * PREVIEW_SCALE;
  const ctx = context2d(scaled);
  ctx.imageSmoothingEnabled = false; // nearest-neighbor: show the actual pixels
  ctx.drawImage(src, 0, 0, scaled.width, scaled.height);
  return scaled;
}

const BADGES: { badge: UpdateBadge; label: string }[] = [
  { badge: "available", label: "available → blue + up-arrow" },
  { badge: "downloaded", label: "downloaded → orange + restart arrow" },
];

const APPEARANCES: { appearance: IconAppearance; bg: string; fg: string }[] = [
  { appearance: "dark", bg: "#2b2b2b", fg: "#f5f5f7" },
  { appearance: "light", bg: "#e9e9ea", fg: "#1d1d1f" },
];

function cell(
  base: { data: Uint8Array; width: number; height: number },
  appearance: IconAppearance,
  badge: UpdateBadge,
  fg: string,
  label: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px";
  const composed = composeBadgedIconBitmap(base.data, base.width, base.height, appearance, badge);
  wrap.appendChild(bitmapToCanvas(composed, base.width, base.height));
  const caption = document.createElement("div");
  caption.textContent = label;
  caption.style.cssText = `font:12px/1.3 -apple-system,system-ui,sans-serif;color:${fg};opacity:0.85`;
  wrap.appendChild(caption);
  return wrap;
}

function renderGallery(): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-wrap:wrap;gap:24px;padding:24px;font-family:-apple-system,system-ui,sans-serif";

  void loadBaseBitmap().then((base) => {
    for (const { appearance, bg, fg } of APPEARANCES) {
      const panel = document.createElement("div");
      panel.style.cssText = `background:${bg};border-radius:12px;padding:20px 28px;display:flex;flex-direction:column;gap:14px`;
      const heading = document.createElement("div");
      heading.textContent = `${appearance} menu bar`;
      heading.style.cssText = `font:600 13px -apple-system,system-ui,sans-serif;color:${fg}`;
      panel.appendChild(heading);
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:28px";
      for (const { badge, label } of BADGES) {
        row.appendChild(cell(base, appearance, badge, fg, label));
      }
      panel.appendChild(row);
      root.appendChild(panel);
    }
  });

  return root;
}

export const AllStates: StoryObj = {
  name: "All badge states (light + dark)",
  render: () => renderGallery(),
};
