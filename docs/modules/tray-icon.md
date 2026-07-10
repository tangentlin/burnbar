# Module: tray-icon

## Purpose

The **pure** compositor for the menu-bar icon's update badge: given the template glyph's raw bitmap, it produces a non-template variant that recolors the glyph for the current menu appearance and stamps a colored status dot. Kept Electron-free and working on plain `Uint8Array`s (not Node `Buffer`s), so the **exact same function** runs both in the main process (unit-tested, no `NativeImage`) and in the browser — the [Storybook](../storybook.md) badge story paints it to a canvas. Introduced with [ADR-011's attention-cues amendment](../adr/011-auto-update-mechanism.md#amendment-attention-cues-2026-07); the default icon stays a template per [ADR-004](../adr/004-template-tray-icon.md).

## Public Surface

| Export | Type | File |
|--------|------|------|
| `IconAppearance` | `"light" \| "dark"` | [tray-icon.ts](../../src/tray-icon.ts) |
| `UpdateBadge` | `"available" \| "downloaded"` | [tray-icon.ts](../../src/tray-icon.ts) |
| `BADGE_RGB` | badge dot colors (blue = available, orange = downloaded) | [tray-icon.ts](../../src/tray-icon.ts) |
| `badgeForStatus(status)` | `(UpdateStatus) => UpdateBadge \| null` | [tray-icon.ts](../../src/tray-icon.ts) |
| `composeBadgedIconBitmap(base, w, h, appearance, badge)` | `(base: Uint8Array, …) => Uint8Array` | [tray-icon.ts](../../src/tray-icon.ts) |

## Responsibilities

- Map the update lifecycle to a badge: only `available` / `downloaded` warrant one; every other state returns `null` (plain template icon). — `badgeForStatus`
- Recolor the glyph to the menu foreground (white on a dark bar, black on a light one) by reading only the source **alpha**, so it's independent of RGB channel order.
- Stamp an opaque colored dot (bottom-right) ringed by a transparent "cutout" gap so it reads as a distinct mark, scaled as fractions of the icon width.

## Non-Goals

- **No Electron / `NativeImage`** — the caller ([tray](./tray.md)) supplies `templateIcon.toBitmap()` and wraps the returned `Uint8Array` back into a `Buffer` for `nativeImage.createFromBitmap()`.
- **No notification** — that's [update-notifier](./update-notifier.md).
- **No caching** — the tray memoizes composited variants by `${badge}:${appearance}`.

## Invariants & Failure Modes

- **Premultiplied BGRA** `Uint8Array` in and out (Electron's macOS bitmap format); the dot is written in BGRA order.
- **Length-checked**: throws if `base` isn't exactly `width × height × 4` bytes, so a mismatched bitmap fails loud and the tray falls back to the template icon rather than rendering garbage.
- **Pure**: no I/O, no globals — the same inputs always yield the same buffer, which is what [test/tray-icon.test.ts](../../test/tray-icon.test.ts) asserts.

## Related Files

- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — the sole main-process caller; owns the `NativeImage` bridging and the appearance/variant cache.
- [stories/badge.stories.ts](../../stories/badge.stories.ts) → [storybook.md](../storybook.md) — runs this same function in the browser to preview every badge state.
- [types.ts](../../src/types.ts) — `UpdateStatus`.
- Decisions: [adr/011](../adr/011-auto-update-mechanism.md) (why a badge), [adr/004](../adr/004-template-tray-icon.md) (why the default icon is a template).
