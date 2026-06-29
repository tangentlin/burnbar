import { deflateSync } from "node:zlib";

// Renders a tiny bar sparkline to a PNG for the tray menu's 30-day spend glance.
// Pure (numbers → PNG buffer) so it is unit-testable with no Electron/DOM. Pixels
// are opaque black on a transparent background; the tray marks the NativeImage a
// template so macOS tints it to the menu's foreground color (light/dark aware).
//
// PNG is hand-encoded (RGBA, single none-filter scanline, zlib IDAT) to avoid a
// native image dependency — Node's `zlib` is built in; CRC-32 is table-based so
// it does not depend on a particular Node version's `zlib.crc32`.

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // bytes 10..12 (compression/filter/interlace) stay 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); // leading filter byte = 0
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export type SparklineOptions = {
  width?: number; // logical px
  height?: number; // logical px
  scale?: number; // device px per logical px (retina)
  gap?: number; // logical px between bars
};

export type SparklineImage = {
  png: Buffer;
  scaleFactor: number; // pass to nativeImage.createFromBuffer for the logical size
};

function setPixel(rgba: Buffer, width: number, x: number, y: number, alpha: number): void {
  const idx = (y * width + x) * 4;
  rgba[idx + 3] = Math.max(rgba[idx + 3], alpha); // R/G/B stay 0 (black); alpha is the mask
}

/**
 * Per-bar pixel heights scaled to `maxBarHeight`. Any non-zero cost gets at least
 * 1px so a tiny day next to a big one stays visible; a $0 day stays at 0 (no bar).
 */
export function barHeights(costs: number[], maxBarHeight: number): number[] {
  const max = Math.max(...costs, 0);
  return costs.map((cost) => {
    const value = Math.max(0, cost);
    if (value <= 0 || max <= 0) {
      return 0;
    }
    return Math.max(1, Math.round((value / max) * maxBarHeight));
  });
}

/** Render `costs` (oldest → newest) as a bar sparkline PNG. */
export function sparklinePng(costs: number[], options: SparklineOptions = {}): SparklineImage {
  const scale = options.scale ?? 2;
  const width = Math.round((options.width ?? 168) * scale);
  const height = Math.round((options.height ?? 30) * scale);
  const gap = Math.max(0, Math.round((options.gap ?? 1) * scale));
  const rgba = Buffer.alloc(width * height * 4); // zeroed = fully transparent

  const count = Math.max(costs.length, 1);
  const barWidth = Math.max(1, Math.floor((width - gap * (count - 1)) / count));
  const heights = barHeights(costs, height - 1);

  // Subtle baseline so a sparse range still reads as a chart axis.
  for (let x = 0; x < width; x++) {
    setPixel(rgba, width, x, height - 1, 48);
  }

  for (let i = 0; i < costs.length; i++) {
    const x0 = i * (barWidth + gap);
    for (let x = x0; x < x0 + barWidth && x < width; x++) {
      for (let y = height - heights[i]; y < height; y++) {
        setPixel(rgba, width, x, y, 255);
      }
    }
  }

  return { png: encodePng(width, height, rgba), scaleFactor: scale };
}
