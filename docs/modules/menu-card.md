# Module: menu-card

## Purpose

The browser-context renderer that **draws** the tray's menu bitmaps: the stats card and the two menu-row glyphs. It exposes two globals — `window.__burnbarDrawCard(data)` for the card and `window.__burnbarDrawIcon(name)` for the row glyphs — each paints an off-DOM `<canvas>` and returns a PNG data URL. Like [dashboard](./dashboard.md), it runs outside the main process and is bundled by esbuild; unlike the dashboard it has no UI, no DOM mutation beyond the throwaway canvas, and no IPC — driven entirely by [menu-card-window](./menu-card-window.md).

The card previously animated (issues #52/#53/#54 — an odometer-style digit roll, a bar-chart grow-from-baseline reveal, and drifting ember particles — see [ADR-013](../adr/013-menu-card-animation-framework.md)). All three were removed: Electron only repaints a `MenuItem`'s icon right before a menu opens or once it closes, never while the native tray dropdown is already open and idle, so none of the three could ever actually be seen in production. See ADR-013's amendments for the full trace and removal.

## Public Surface

No module exports (`window` globals) — it is an esbuild bundle entry point. On load it assigns `window.__burnbarDrawCard` (the card) and `window.__burnbarDrawIcon` (monochrome row glyphs: `"refresh"`, `"dashboard"`). — [card.ts](../../src/menu-card/card.ts)

It also has one plain **named export**, used directly (no `window`) by tests and by [Storybook](../storybook.md) (`stories/menu-card.stories.ts`), since the module runs in any real browser context, not just Electron's hidden window:

| Export | Purpose |
|--------|---------|
| `drawCard(data)` | The production entry point — the function `window.__burnbarDrawCard` wraps. Renders the card as a PNG data URL; `""` on a canvas-context failure. |

The `window.__burnbar*` assignments are guarded (`if (typeof window !== "undefined")`) so the module stays importable from plain Node despite living in a browser-only bundle entry point (not currently exercised — the module has no pure, DOM-free logic left worth a Node-side unit test; see [Non-Goals](#non-goals)).

Internal helpers: `drawStat` (label + value), `drawBars` (the warm bar chart), `cardCanvas` (the lazily-created, reused canvas+context), `money`/`tokens` formatters, and the icon helpers `iconContext`/`drawRefreshIcon`/`drawDashboardIcon`/`drawIcon`.

## Responsibilities

- Paint the stats card on a **transparent** background at `SCALE`× device pixels (logical 270×212): a 2×2 stat grid — **Today** $ / **30d cost** $ ; **30d tokens** / **Today tokens** — a warm-orange bar chart of the 30-day daily costs over a faint baseline, a "Top model: …" line, and the footnote "Estimated from local logs at API rates". — [drawCard](../../src/menu-card/card.ts)
- Format money as USD and tokens as compact (`1.1B`, `42M`); render `—` for `null` (no daily row yet). — [card.ts](../../src/menu-card/card.ts)
- Draw the menu-row glyphs (refresh ↻, dashboard bar-chart) solid-black on transparent at the standard 16-px menu-icon size; the main process flags them template images so macOS tints them. — [drawIcon](../../src/menu-card/card.ts)
- Return `canvas.toDataURL("image/png")` for the main process to decode. — [card.ts](../../src/menu-card/card.ts)

## Non-Goals

- **No animation** — see [Purpose](#purpose)/[ADR-013](../adr/013-menu-card-animation-framework.md). `drawCard` is a single, deterministic paint of whatever `MenuCardData` it's handed; there is no session, no timing state, no "another frame needed" signal.
- **No Electron, no `NativeImage`, no `scaleFactor`, no `setTemplateImage`** — wrapping the PNG, the retina tagging, and the template flag belong to [menu-card-window](./menu-card-window.md).
- **No data access** — it draws exactly the `MenuCardData` it's handed; derivation is the [capture-service](./capture-service.md)'s job and assembly is the [tray](./tray.md)'s.
- No theme **detection**: the card adapts its value-text color from the `dark` flag the tray passes in (`MenuCardData.dark`), it doesn't query the OS itself; the **icons** are alpha-only so macOS owns their tint. See [adr/009](../adr/009-menu-stats-card.md).
- Not unit-tested — the module has no pure, DOM-free logic to test in isolation (unlike the removed animation math); its correctness is verified via the production `MenuCardRenderer` and via [Storybook](../storybook.md).

## How It Works

`card.ts` is bundled by **esbuild** (`platform: "browser"`, ESM), *not* `tsc`, because it needs the DOM lib the Node16 main config omits; type-checking happens via `tsconfig.dashboard.json` (which includes `src/menu-card`). The bundle plus `index.html` are copied into `dist/menu-card/`. — [build-renderer.mjs](../../scripts/build-renderer.mjs)

`drawCard(data)` scales the (lazily-created, reused) canvas context by `SCALE` (so all layout is in logical px), clears it, lays out the four stats via `drawStat` (a plain label + value `fillText`), draws the bars via `drawBars` (always at full height), then the optional top-model line and footnote, and returns `canvas.toDataURL("image/png")`. `drawIcon` does the equivalent at 16-px on a transparent canvas for the two row glyphs. `index.html` carries a strict **CSP** (`default-src 'none'; script-src 'self'`) and renders nothing visible.

```mermaid
flowchart LR
    data["MenuCardData"] --> draw["drawCard()"]
    draw --> png["PNG data URL"]
```

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `MenuCardData` | the card's full input (`MenuCard` + today's numbers) | [types.ts#MenuCardData](../../src/types.ts) |

## Invariants & Failure Modes

- **Global contract**: the page must define `window.__burnbarDrawCard` and `window.__burnbarDrawIcon`; the hidden window calls them by name. Renaming one breaks that render (the renderer then returns `null`). — [card.ts](../../src/menu-card/card.ts), [menu-card-window](./menu-card-window.md)
- **Retina contract**: draws at `SCALE`× and the consumer tags the image `scaleFactor: SCALE`; the two constants must agree. — [card.ts](../../src/menu-card/card.ts)
- **Canvas is module-scoped, not per-call**: `drawCard` reuses one lazily-created canvas+context across every call (each call fully repaints, so this is behaviorally identical to a fresh canvas). Correct because production has exactly one hidden window instance; harmless in Storybook since nothing here holds cross-call *state*, only a backing store.
- **Transparent card + adaptive text**: the card has no background fill, so the bold value color follows `MenuCardData.dark` (light text on dark menus, dark text on light) to stay legible on the menu surface; labels, bars, and template-tinted icons read on both. See [adr/009](../adr/009-menu-stats-card.md). The **icons** are alpha-only on purpose (template tinting).
- **Graceful empties**: an all-zero spark draws just the baseline (no bars); a `null` top model omits that line; `null` today figures render `—`. — [drawBars](../../src/menu-card/card.ts), [drawCard](../../src/menu-card/card.ts)

## Extension Points

- Change the layout/typography/palette by editing the geometry + color constants and the `drawStat`/`drawBars` helpers.
- Add a stat: extend `MenuCardData` in [types](./types.md), feed it from [capture-service](./capture-service.md)'s `computeCard`, and draw it here.
- Add a menu-row icon: extend the `"refresh" | "dashboard"` union, add a `drawXIcon` branch in `drawIcon`, and render it via the tray's `loadIcons`. Keep it alpha-only (any fill color) so the template tint works.
- If the card's logical size changes, keep `SCALE`/`W`/`H` consistent with [menu-card-window](./menu-card-window.md)'s `scaleFactor`.
- Preview without Electron: [`stories/menu-card.stories.ts`](../../stories/menu-card.stories.ts) drives the real `drawCard` — see [storybook.md](../storybook.md).
- **Considering another animation?** Read [ADR-013](../adr/013-menu-card-animation-framework.md) and its amendments first: any design that needs multiple frames visible *while the native tray menu is already open* can't work with this module's architecture (a `MenuItem` icon inside a native `Menu`). Target the always-visible tray icon (`Tray.setImage()`, see issue #51) instead, or an effect bounded entirely to before the menu opens.

## Related Files

- [menu-card-window.ts](../../src/menu-card-window.ts) → [menu-card-window.md](./menu-card-window.md) — the hidden window that calls `__burnbarDrawCard`/`__burnbarDrawIcon` and wraps the PNG.
- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — assembles `MenuCardData`, calls `MenuCardRenderer.render`, and attaches the resulting image.
- [capture-service.ts](../../src/capture-service.ts) → [capture-service.md](./capture-service.md) — derives the `MenuCard` figures.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs) — bundles this alongside the dashboard renderer.
- [dashboard.md](./dashboard.md) — the sibling browser-context renderer (the visible window).
- [adr/009-menu-stats-card.md](../adr/009-menu-stats-card.md) — the card's original rationale. [adr/013-menu-card-animation-framework.md](../adr/013-menu-card-animation-framework.md) — the animation framework that was tried, why it didn't work, and its full removal.
- [storybook.md](../storybook.md) — the live, Electron-free preview of the card.
