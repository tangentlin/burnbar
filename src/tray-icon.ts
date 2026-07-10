import type { UpdateStatus } from "./types.js";

// Pure compositor for the tray icon's update badge. Kept Electron-free — and
// working on plain `Uint8Array`s rather than Node `Buffer`s — so the exact same
// function runs both in the main process (tray.ts feeds `templateIcon.toBitmap()`
// and wraps the result with `nativeImage.createFromBitmap()`) and in the browser
// (the Storybook badge story paints it to a canvas). See ADR-011's attention-cues
// amendment for why a badge exists and ADR-004 for why the default icon stays a
// macOS template image.

/** Which menu-bar appearance a badged icon is being composited for. */
export type IconAppearance = "light" | "dark";

/**
 * The two update states worth badging — each nudges the user toward a *different*
 * pending action, so they get distinct badge colors (per the "distinct per state"
 * decision). Everything else (checking/downloading/idle/error) carries no waiting
 * user action and shows the plain template icon.
 */
export type UpdateBadge = "available" | "downloaded";

/**
 * Badge dot colors (sRGB 0–255) so the icon alone hints which action is pending:
 * blue = a download is available, orange = a downloaded update is waiting to be
 * installed. macOS system accent hues (systemBlue / systemOrange).
 */
export const BADGE_RGB: Record<UpdateBadge, readonly [number, number, number]> = {
  available: [10, 132, 255],
  downloaded: [255, 159, 10],
};

/** Map the update lifecycle to a badge, or null for states needing no attention. */
export function badgeForStatus(status: UpdateStatus): UpdateBadge | null {
  return status === "available" || status === "downloaded" ? status : null;
}

// Badge geometry as fractions of the icon's device width, so it scales with the
// bitmap: a bottom-right dot ringed by a thin transparent "cutout" gap.
const DOT_RADIUS_FRACTION = 0.28;
const GAP_FRACTION = 0.05;

/**
 * Composite a **non-template** menu-bar icon from the template glyph's bitmap:
 * recolor the glyph to the menu foreground (white on a dark bar, black on a light
 * one) and stamp a colored status dot in the bottom-right corner.
 *
 * Pixels are premultiplied BGRA — Electron's `nativeImage` bitmap format on
 * macOS. Recoloring reads only the source **alpha** (byte 3) and writes a solid
 * gray, so it's independent of RGB channel order; the dot is written in BGRA.
 *
 * Throws if `base` isn't exactly `width × height × 4` bytes, so a caller feeding a
 * mismatched bitmap fails loud (the tray catches it and falls back to the
 * template icon rather than showing a corrupt image).
 */
export function composeBadgedIconBitmap(
  base: Uint8Array,
  width: number,
  height: number,
  appearance: IconAppearance,
  badge: UpdateBadge,
): Uint8Array {
  const expected = width * height * 4;
  if (base.length !== expected) {
    throw new Error(`bitmap length ${base.length} does not match ${width}×${height} (${expected})`);
  }

  const out = new Uint8Array(expected);

  // 1) Recolor the glyph: premultiplied solid foreground, keyed to source alpha.
  const foreground = appearance === "dark" ? 255 : 0;
  for (let i = 0; i < width * height; i++) {
    const alpha = base[i * 4 + 3];
    const value = Math.round((foreground * alpha) / 255);
    out[i * 4] = value;
    out[i * 4 + 1] = value;
    out[i * 4 + 2] = value;
    out[i * 4 + 3] = alpha;
  }

  // 2) Stamp the badge: an opaque colored dot ringed by a transparent gap so it
  // reads as a distinct mark instead of merging into the glyph beneath it.
  const [red, green, blue] = BADGE_RGB[badge];
  const dotRadius = Math.round(width * DOT_RADIUS_FRACTION);
  const gapRadius = dotRadius + Math.max(1, Math.round(width * GAP_FRACTION));
  const centerX = width - gapRadius - 1;
  const centerY = height - gapRadius - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceSq = dx * dx + dy * dy;
      const idx = (y * width + x) * 4;
      if (distanceSq <= dotRadius * dotRadius) {
        out[idx] = blue;
        out[idx + 1] = green;
        out[idx + 2] = red;
        out[idx + 3] = 255;
      } else if (distanceSq <= gapRadius * gapRadius) {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
      }
    }
  }

  return out;
}
