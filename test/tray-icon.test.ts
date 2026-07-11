import { describe, expect, it } from "vitest";
import { BADGE_RGB, badgeForStatus, composeBadgedIconBitmap } from "../src/tray-icon.js";
import type { UpdateStatus } from "../src/types.js";

// Build a solid-alpha BGRA bitmap (black glyph, fully opaque) to exercise the
// recolor + badge stamp deterministically.
function opaqueBlack(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4 + 3] = 255; // alpha only; RGB stays 0 (black glyph)
  }
  return buf;
}

const pixel = (
  buf: Uint8Array,
  x: number,
  y: number,
  width: number,
): [number, number, number, number] => {
  const idx = (y * width + x) * 4;
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
};

/** Whether any pixel is fully opaque white — the badge glyph's color. */
const hasPureWhite = (buf: Uint8Array): boolean => {
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] === 255 && buf[i + 1] === 255 && buf[i + 2] === 255 && buf[i + 3] === 255) {
      return true;
    }
  }
  return false;
};

describe("badgeForStatus", () => {
  it("badges only the two states with a pending user action", () => {
    expect(badgeForStatus("available")).toBe("available");
    expect(badgeForStatus("downloaded")).toBe("downloaded");
    for (const status of ["idle", "checking", "downloading", "error"] satisfies UpdateStatus[]) {
      expect(badgeForStatus(status)).toBeNull();
    }
  });
});

describe("composeBadgedIconBitmap", () => {
  const W = 40;
  const H = 40;

  it("recolors the glyph white on a dark menu bar (top-left, away from the dot)", () => {
    const out = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "dark", "available");
    expect(pixel(out, 0, 0, W)).toEqual([255, 255, 255, 255]);
  });

  it("recolors the glyph black on a light menu bar", () => {
    const out = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "light", "available");
    expect(pixel(out, 0, 0, W)).toEqual([0, 0, 0, 255]);
  });

  it("scales the recolor by the source alpha (premultiplied)", () => {
    const base = new Uint8Array(W * H * 4);
    base[3] = 128; // pixel (0,0): half-transparent black
    const out = composeBadgedIconBitmap(base, W, H, "dark", "available");
    const value = Math.round((255 * 128) / 255);
    expect(pixel(out, 0, 0, W)).toEqual([value, value, value, 128]);
  });

  it("keeps the dot color on the dot, away from the glyph, distinct per state", () => {
    // Center is derived the same way the compositor does (bottom-right corner);
    // sample near the dot's edge, clear of the centered glyph.
    const dotR = Math.round(W * 0.28);
    const gapR = dotR + Math.max(1, Math.round(W * 0.05));
    const cx = W - gapR - 1;
    const cy = H - gapR - 1;
    const edgeX = cx + (dotR - 1);

    const available = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "dark", "available");
    const [r1, g1, b1] = BADGE_RGB.available;
    expect(pixel(available, edgeX, cy, W)).toEqual([b1, g1, r1, 255]);

    const downloaded = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "dark", "downloaded");
    const [r2, g2, b2] = BADGE_RGB.downloaded;
    expect(pixel(downloaded, edgeX, cy, W)).toEqual([b2, g2, r2, 255]);
  });

  it("stamps a white action glyph — up-arrow fills the center, restart is a hollow ring", () => {
    const dotR = Math.round(W * 0.28);
    const gapR = dotR + Math.max(1, Math.round(W * 0.05));
    const cx = W - gapR - 1;
    const cy = H - gapR - 1;

    // Light appearance recolors the base glyph to black, so the only white is the badge glyph.
    const available = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "light", "available");
    expect(pixel(available, cx, cy, W)).toEqual([255, 255, 255, 255]); // arrow stem at center

    const downloaded = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "light", "downloaded");
    const [r, g, b] = BADGE_RGB.downloaded;
    expect(pixel(downloaded, cx, cy, W)).toEqual([b, g, r, 255]); // ring hollow at the center
    expect(hasPureWhite(downloaded)).toBe(true); // ...but the ring itself paints white
  });

  it("carves a transparent gap ring between the dot and the glyph", () => {
    const dotR = Math.round(W * 0.28);
    const gapR = dotR + Math.max(1, Math.round(W * 0.05));
    const cx = W - gapR - 1;
    const cy = H - gapR - 1;
    // A pixel just inside the gap radius but outside the dot radius is cleared.
    const out = composeBadgedIconBitmap(opaqueBlack(W, H), W, H, "dark", "available");
    expect(pixel(out, cx, cy - (dotR + 1), W)).toEqual([0, 0, 0, 0]);
  });

  it("throws when the bitmap length does not match the dimensions", () => {
    expect(() => composeBadgedIconBitmap(new Uint8Array(4), W, H, "dark", "available")).toThrow();
  });
});
