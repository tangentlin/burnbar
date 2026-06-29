import { describe, expect, it } from "vitest";
import { barHeights, sparklinePng } from "../src/sparkline.js";

// IHDR stores width/height as big-endian uint32 at byte offsets 16 and 20.
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("sparklinePng", () => {
  it("emits a valid PNG sized to the scaled (device) pixels", () => {
    const { png, scaleFactor } = sparklinePng([1, 2, 3, 4], { width: 100, height: 20, scale: 2 });
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(scaleFactor).toBe(2);
    expect(pngSize(png)).toEqual({ width: 200, height: 40 });
  });

  it("ends with an IEND chunk", () => {
    const { png } = sparklinePng([1, 2, 3]);
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });

  it("handles empty and all-zero inputs without throwing", () => {
    expect(() => sparklinePng([])).not.toThrow();
    expect(() => sparklinePng([0, 0, 0])).not.toThrow();
  });
});

describe("barHeights", () => {
  it("gives any non-zero cost at least 1px next to a much larger value", () => {
    const heights = barHeights([100, 0.001, 50], 35);
    expect(heights[0]).toBe(35); // the max fills the height
    expect(heights[1]).toBeGreaterThanOrEqual(1); // was previously rounding to 0 (invisible)
    expect(heights[2]).toBeGreaterThan(0);
  });

  it("keeps $0 days at 0 (no bar) and all-zero input flat", () => {
    expect(barHeights([0, 5, 0], 35)).toEqual([0, 35, 0]);
    expect(barHeights([0, 0, 0], 35)).toEqual([0, 0, 0]);
  });
});
