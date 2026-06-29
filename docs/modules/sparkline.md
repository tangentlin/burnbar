# Module: sparkline

## Purpose

Pure data→PNG bar sparkline for the menu's 30-day spend glance: turns a cost series into a hand-encoded RGBA PNG (no native image dependency) that the tray marks a template image so macOS tints it to the menu foreground.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `SparklineOptions` | `{ width?, height?, scale?, gap? }` (logical px + retina scale) | [sparkline.ts:65](../../src/sparkline.ts#L65) |
| `SparklineImage` | `{ png, scaleFactor }` for `nativeImage.createFromBuffer` | [sparkline.ts:72](../../src/sparkline.ts#L72) |
| `barHeights()` | `(costs, maxBarHeight) => number[]` | [sparkline.ts:86](../../src/sparkline.ts#L86) |
| `sparklinePng()` | `(costs, options?) => SparklineImage` | [sparkline.ts:98](../../src/sparkline.ts#L98) |

Module-private: the hand-rolled PNG encoder (`crc32` table + `chunk` + `encodePng`) and the `setPixel` alpha-mask helper. — [sparkline.ts:14-63](../../src/sparkline.ts#L14-L63), [sparkline.ts:77](../../src/sparkline.ts#L77)

## Responsibilities

- Map costs to per-bar pixel heights scaled to the tallest bar; floor any non-zero cost to ≥1px so a tiny day stays visible, leave $0 at 0px. — [barHeights](../../src/sparkline.ts#L86-L95)
- Render bars left→right (oldest→newest) over a transparent canvas with a faint baseline axis row. — [sparklinePng](../../src/sparkline.ts#L98-L124)
- Hand-encode the canvas as a PNG: signature + IHDR (8-bit RGBA) + a single none-filter raw scanline buffer deflated into IDAT + IEND. — [encodePng](../../src/sparkline.ts#L43-L63)
- Compute the IDAT CRC from a self-built CRC-32 table (not `zlib.crc32`) so output is Node-version-independent. — [CRC_TABLE/crc32](../../src/sparkline.ts#L14-L32)
- Return `scaleFactor` alongside the buffer so the caller restores the logical (retina) size. — [sparkline.ts:123](../../src/sparkline.ts#L123)

## Non-Goals

- No Electron/`NativeImage` use, no `setTemplateImage`, no menu wiring — that's [tray](./tray.md).
- No cost computation, range selection, or zero-fill — the series arrives from [derive](./derive.md) via the capture service.
- No color/theme logic: pixels are black-with-alpha by intent; macOS owns the tint.
- No general image format support — only the one fixed PNG shape this glance needs.

## How It Works

`sparklinePng` allocates a zeroed (fully transparent) RGBA buffer at device size (`width*scale` × `height*scale`), draws a subtle baseline on the last row, then for each cost fills a `barWidth`-wide column up from the bottom by `barHeights(costs, height-1)`. `setPixel` writes only the **alpha** channel (R/G/B stay 0/black) with a `max`, so the buffer is an opacity mask — exactly what a macOS template image consumes. The buffer becomes a PNG by prepending a 0 filter byte per scanline, `deflateSync`-ing the raw stream into IDAT, and wrapping each chunk with a big-endian length + CRC.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `SparklineOptions` | logical width/height, retina `scale`, inter-bar `gap` | [sparkline.ts:65-70](../../src/sparkline.ts#L65) |
| `SparklineImage` | PNG buffer + `scaleFactor` handoff to Electron | [sparkline.ts:72-75](../../src/sparkline.ts#L72) |

This module owns no `types.ts` symbols; its consumer reads `TrayState.sparkline` (a `number[]`). — [types.ts#TrayState](../../src/types.ts#L175-L181)

## Invariants & Failure Modes

- **Template-image intent (load-bearing)**: every drawn pixel is black with only alpha varying, so the PNG is a tint mask. Adding color here would break the macOS light/dark tinting the tray relies on. — [setPixel](../../src/sparkline.ts#L77-L80)
- **Visibility floor**: non-zero costs round up to ≥1px, so a small day next to a large one never vanishes; $0 (or all-zero / negative) days render nothing. — [barHeights](../../src/sparkline.ts#L88-L94)
- **Total & no-throw**: empty `[]` and all-zero inputs produce a valid PNG without throwing (`count`/`barWidth` clamp to ≥1, `max` defaults to 0). — [sparkline.ts:105-106](../../src/sparkline.ts#L105), [test/sparkline.test.ts:22](../../test/sparkline.test.ts#L22)
- **Output is device-sized**: IHDR width/height are the scaled pixels; `scaleFactor` is the contract that lets the caller recover the logical size. — [sparkline.ts:99-101](../../src/sparkline.ts#L99), [test/sparkline.test.ts:10](../../test/sparkline.test.ts#L10)
- **Self-contained encoder**: only `node:zlib` deflate is used; the table-based CRC avoids any dependency on `zlib.crc32` availability. — [sparkline.ts:1](../../src/sparkline.ts#L1), [sparkline.ts:14](../../src/sparkline.ts#L14)

## Extension Points

- Tune the glance via `SparklineOptions` at the call site (tray uses `{ width: 150, height: 18, scale: 2 }`). — [tray.ts:102](../../src/tray.ts#L102)
- Change bar styling (gap, baseline alpha, fill alpha) inside `sparklinePng`; keep R/G/B at 0 to preserve the template-mask invariant. — [sparkline.ts:109-121](../../src/sparkline.ts#L109)
- A different chart shape (lines, stacked) is a new draw loop over the same `encodePng`/`setPixel` primitives — no encoder change needed.

## Related Files

- [tray.ts](../../src/tray.ts) — the only consumer: skips rendering when all costs are 0, builds the `NativeImage`, sets it a template, and attaches it to the "Last 30 Days · Spend" drill-down item. — [tray.ts:93-106](../../src/tray.ts#L93-L106)
- [capture-service.ts](../../src/capture-service.ts) — produces the `number[]` series (last `SPARKLINE_DAYS` of zero-filled daily cost). — [capture-service.ts:195-204](../../src/capture-service.ts#L195)
- [test/sparkline.test.ts](../../test/sparkline.test.ts) — PNG validity, sizing, and the 1px-floor / $0 rules.
- Sibling docs: [tray](./tray.md), [derive](./derive.md), [types](./types.md).
