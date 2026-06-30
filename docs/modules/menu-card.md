# Module: menu-card

## Purpose

The browser-context renderer that **draws** the tray's menu bitmaps. It exposes two globals — `window.__burnbarDrawCard(data)` for the stats card and `window.__burnbarDrawIcon(name)` for the small menu-row glyphs — each paints an off-DOM `<canvas>` and returns a PNG data URL. Like [dashboard](./dashboard.md), it runs outside the main process and is bundled by esbuild; unlike the dashboard it has no UI, no DOM mutation, and no IPC — pure `data → PNG string` functions driven by [menu-card-window](./menu-card-window.md).

## Public Surface

No module exports — it is an esbuild bundle entry point. On load it assigns `window.__burnbarDrawCard` (the colored stats card) and `window.__burnbarDrawIcon` (monochrome row glyphs: `"refresh"`, `"dashboard"`), the capabilities the hidden renderer window calls. — [card.ts](../../src/menu-card/card.ts)

Internal helpers: `drawCard` (the entry), `drawStat` (a label + bold value), `drawBars` (the warm bar chart), `money`/`tokens` formatters (`Intl.NumberFormat`, mirroring the dashboard's USD + compact-token formatting), and the icon helpers `iconContext` / `drawRefreshIcon` / `drawDashboardIcon` / `drawIcon`.

## Responsibilities

- Paint the stats card on a **transparent** background at `SCALE`× device pixels (logical 270×212): a 2×2 stat grid — **Today** $ / **30d cost** $ ; **30d tokens** / **Today tokens** — a warm-orange bar chart of the 30-day daily costs over a faint baseline, a "Top model: …" line, and the footnote "Estimated from local logs at API rates". — [drawCard](../../src/menu-card/card.ts)
- Format money as USD and tokens as compact (`1.1B`, `42M`); render `—` for `null` (no daily row yet). — [card.ts](../../src/menu-card/card.ts)
- Draw the menu-row glyphs (refresh ↻, dashboard bar-chart) solid-black on transparent at the standard 16-px menu-icon size; the main process flags them template images so macOS tints them. — [drawIcon](../../src/menu-card/card.ts)
- Return `canvas.toDataURL("image/png")` for the main process to decode. — [drawCard](../../src/menu-card/card.ts)

## Non-Goals

- **No Electron, no `NativeImage`, no `scaleFactor`, no `setTemplateImage`** — wrapping the PNG, the retina tagging, and the template flag belong to [menu-card-window](./menu-card-window.md).
- **No data access** — it draws exactly the `MenuCardData` it's handed; derivation is the [capture-service](./capture-service.md)'s job and assembly is the [tray](./tray.md)'s.
- No theme **detection**: the card adapts its value-text color from the `dark` flag the tray passes in (`MenuCardData.dark`), it doesn't query the OS itself; the **icons** are alpha-only so macOS owns their tint. See [adr/009](../adr/009-menu-stats-card.md).
- Not unit-tested (a DOM/canvas renderer); verified by rendering through the production `MenuCardRenderer`.

## How It Works

`card.ts` is bundled by **esbuild** (`platform: "browser"`, ESM), *not* `tsc`, because it needs the DOM lib the Node16 main config omits; type-checking happens via `tsconfig.dashboard.json` (which now includes `src/menu-card`). The bundle plus `index.html` are copied into `dist/menu-card/`. — [build-renderer.mjs](../../scripts/build-renderer.mjs)

`drawCard` creates a `<canvas>` sized `W*SCALE × H*SCALE`, scales the context by `SCALE` (so all layout is in logical px) on a transparent canvas (no card fill), lays out the four stats with `drawStat`, draws the bars with `drawBars` (heights scaled to the max cost; `$0` days skipped; a vertical orange gradient), then the optional top-model line and footnote, and returns the data URL. `drawIcon` does the same at 16-px on a transparent canvas for the two row glyphs. `index.html` carries a strict **CSP** (`default-src 'none'; script-src 'self'`) and renders nothing visible.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `MenuCardData` | the card's full input (`MenuCard` + today's numbers) | [types.ts#MenuCardData](../../src/types.ts) |

## Invariants & Failure Modes

- **Global contract**: the page must define `window.__burnbarDrawCard` and `window.__burnbarDrawIcon`; the hidden window calls them by name. Renaming one breaks that render (the renderer then returns `null`). — [card.ts](../../src/menu-card/card.ts), [menu-card-window](./menu-card-window.md)
- **Retina contract**: draws at `SCALE`× and the consumer tags the image `scaleFactor: SCALE`; the two constants must agree. — [card.ts](../../src/menu-card/card.ts)
- **Transparent card + adaptive text**: the card has no background fill, so the bold value color follows `MenuCardData.dark` (light text on dark menus, dark text on light) to stay legible on the menu surface; labels, bars, and template-tinted icons read on both. See [adr/009](../adr/009-menu-stats-card.md). The **icons** are alpha-only on purpose (template tinting).
- **Graceful empties**: an all-zero spark draws just the baseline (no bars); a `null` top model omits that line; `null` today figures render `—`. — [drawBars](../../src/menu-card/card.ts), [drawCard](../../src/menu-card/card.ts)

## Extension Points

- Change the layout/typography/palette by editing the geometry + color constants and the `drawStat`/`drawBars` helpers.
- Add a stat: extend `MenuCardData` in [types](./types.md), feed it from [capture-service](./capture-service.md)'s `computeCard`, and draw it here.
- Add a menu-row icon: extend the `"refresh" | "dashboard"` union, add a `drawXIcon` branch in `drawIcon`, and render it via the tray's `loadIcons`. Keep it alpha-only (any fill color) so the template tint works.
- If the card's logical size changes, keep `SCALE`/`W`/`H` consistent with [menu-card-window](./menu-card-window.md)'s `scaleFactor`.

## Related Files

- [menu-card-window.ts](../../src/menu-card-window.ts) → [menu-card-window.md](./menu-card-window.md) — the hidden window that calls `__burnbarDrawCard` and wraps the PNG.
- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — assembles `MenuCardData` and attaches the resulting image.
- [capture-service.ts](../../src/capture-service.ts) → [capture-service.md](./capture-service.md) — derives the `MenuCard` figures.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs) — bundles this alongside the dashboard renderer.
- [dashboard.md](./dashboard.md) — the sibling browser-context renderer (the visible window).
- [adr/009-menu-stats-card.md](../adr/009-menu-stats-card.md) — the rationale and rejected alternatives.
