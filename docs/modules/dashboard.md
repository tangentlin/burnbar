# Module: dashboard

## Purpose

The browser-context renderer for Burnbar's one window: it requests a `DashboardSeries` or a `HeatmapSeries` over the preload bridge and draws either a stacked, toggleable Chart.js bar chart **or** a GitHub-style calendar heatmap. This is the only module that runs outside the main process.

## Public Surface

This module has **no exports** — it is a bundle entry point, not a library. The browser loads it as `renderer.js` (esbuild output) and its top-level statements run on load. — [renderer.ts](../../src/dashboard/renderer.ts)

It reads capabilities off the window via `BurnbarBridge`: `window.burnbar.getSeries` (chart view), `getHeatmap` (heatmap view), and `exportData` (JSON/CSV). — [renderer.ts](../../src/dashboard/renderer.ts)

Internal helpers: `byId` (typed `getElementById`), `setControlState`, `draw` (chart), `drawHeatmap` + `levelForCost`/`tooltipHtml`/`showTooltip` (heatmap), `refresh`, `wireControls`. — [renderer.ts](../../src/dashboard/renderer.ts)

## Responsibilities

- Register **only** the Chart.js pieces used (`BarController`, `BarElement`, scales, `Tooltip`, `Legend`) so esbuild tree-shakes the rest. — [renderer.ts](../../src/dashboard/renderer.ts)
- Fetch the active view's payload via the read-only bridge on load and on range / view / dimension click (`getSeries` for chart, `getHeatmap` for heatmap). — [renderer.ts#refresh](../../src/dashboard/renderer.ts)
- Render a **stacked** bar chart (both axes `stacked: true`), USD-formatted y-ticks and tooltips. — [renderer.ts#draw](../../src/dashboard/renderer.ts)
- Render the **heatmap**: a CSS-grid calendar (leading blanks align the first day to its weekday row; month labels placed by week column), quantile-bucketed cell colors (`data-level` → `--hm-*` ramp), and a hover tooltip with the day's model + agent breakdown. — [renderer.ts#drawHeatmap](../../src/dashboard/renderer.ts), [dashboard.css](../../src/dashboard/dashboard.css)
- Update the total header from the *server-confirmed* `range`, not the local toggle. — [renderer.ts#refresh](../../src/dashboard/renderer.ts)
- Drive the view states — chart / heatmap / empty / error — by toggling `hidden`. — [renderer.ts#refresh](../../src/dashboard/renderer.ts)
- Reflect the active range / view / dimension on the segmented buttons (`.active` + `aria-pressed`), and hide the breakdown toggle in the heatmap view. — [renderer.ts#setControlState](../../src/dashboard/renderer.ts)

## Non-Goals

- No data access beyond the bridge (`getSeries` / `getHeatmap` / `exportData`) — no Node, no `fs`, no network; the archive read and all aggregation live behind [ipc](./ipc.md) / [derive](./derive.md).
- No persistence or caching — every toggle is a fresh round-trip.
- No type-checking at build time — esbuild only transpiles; types are checked separately by `tsconfig.dashboard.json`. — [build-renderer.mjs](../../scripts/build-renderer.mjs)
- **Not unit-tested** — the pure derivation is (see [derive](./derive.md)); the renderer itself is verified by rendering the built bundle against a stubbed bridge (toggle each view × range × dimension, hover a heatmap cell, empty archive, IPC error). See [usage-dashboard.md](../features/usage-dashboard.md).

## How It Works

`renderer.ts` is bundled by **esbuild** (`platform: "browser"`, ESM, tree-shaken Chart.js), *not* by `tsc`, because Chart.js must be inlined and the renderer needs the DOM lib the Node16 main config omits. The bundle plus `index.html` and `dashboard.css` are copied into `dist/dashboard/`. — [build-renderer.mjs](../../scripts/build-renderer.mjs), [adr/008](../adr/008-dashboard-window-bundle.md)

On load it wires the segmented control groups (range / view / dimension), paints the initial button state, wires the heatmap hover delegation, and calls `refresh()`. `refresh()` branches on the active `view`: chart → `getSeries({ range, dimension })` → `draw()` (reusing the existing `Chart` via `chart.update()`); heatmap → `getHeatmap({ range })` → `drawHeatmap()`; either falls back to the empty/error paragraph. `draw()` maps each `SeriesDataset` to a bar dataset cycling the color-blind-friendly `PALETTE`. `drawHeatmap()` builds the calendar grid and derives per-cell color levels via `levelForCost` (quantile buckets); hovering a cell renders `tooltipHtml` (day total + by-model + by-agent). — [renderer.ts](../../src/dashboard/renderer.ts)

`index.html` carries a strict **CSP** (`default-src 'none'`, `script-src 'self'`) — the renderer's security boundary, matching ADR-008's "local code only, one read-only channel". — [index.html:5-8](../../src/dashboard/index.html#L5-L8)

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `SeriesRequest` | `{ range, dimension }` sent to `getSeries` | [types.ts#SeriesRequest](../../src/types.ts) |
| `DashboardSeries` | labels + datasets + `totalCost` to render | [types.ts#DashboardSeries](../../src/types.ts) |
| `SeriesDataset` | one stacked bar (label + per-label cost) | [types.ts#SeriesDataset](../../src/types.ts) |
| `HeatmapRequest` / `HeatmapSeries` | `{ range }` sent to `getHeatmap` → per-day `HeatmapCell[]` + `totalCost` | [types.ts#HeatmapSeries](../../src/types.ts) |
| `HeatmapCell` | one day: `cost`, `tokens`, cost-desc `models` + `agents` splits | [types.ts#HeatmapCell](../../src/types.ts) |
| `SeriesRange` / `SeriesDimension` | the toggle enums | [types.ts](../../src/types.ts) |
| `BurnbarBridge` | the `window.burnbar` capabilities (`getSeries`, `getHeatmap`, `exportData`) | [types.ts#BurnbarBridge](../../src/types.ts) |

## Invariants & Failure Modes

- **`byId` throws** if any expected element id is missing — a structural contract between `renderer.ts` and `index.html`; rename an id in one and the renderer fails loudly on load. — [renderer.ts#byId](../../src/dashboard/renderer.ts)
- Exactly **one** of chart / heatmap / empty / error is visible: `empty` shows when nothing in range has a positive value, `error` on any rejection, otherwise the active view's canvas or grid. — [renderer.ts#refresh](../../src/dashboard/renderer.ts)
- **`[hidden]` cascade traps** [load-bearing]: `.segmented` and Chart.js's inline `display:block` on the canvas each outrank the UA `[hidden]{display:none}` rule, so `.hidden = true` alone doesn't hide them — explicit CSS (`.segmented[hidden]`, `canvas[hidden]{display:none !important}`) is required, and `.heatmap`/overlays use the `:not([hidden])` idiom for the same reason. — [dashboard.css](../../src/dashboard/dashboard.css)
- `dataset.range`/`dataset.dim`/`dataset.view` are cast (`as SeriesRange` / `View`) — trusted because the HTML hardcodes the only valid values. — [renderer.ts](../../src/dashboard/renderer.ts), [index.html](../../src/dashboard/index.html)
- All thrown values are stringified into the error paragraph; the renderer never crashes the window. — [renderer.ts:128-133](../../src/dashboard/renderer.ts#L128-L133)
- The `Chart` instance is a module singleton (`let chart`) reused across refreshes — never re-instantiated, so toggles animate-free via `update()`. — [renderer.ts:42](../../src/dashboard/renderer.ts#L42), [renderer.ts:77-82](../../src/dashboard/renderer.ts#L77-L82)

## Extension Points

- Add a Chart.js feature (e.g. a plugin or chart type) → register it in the `Chart.register(...)` call so esbuild keeps it. — [renderer.ts](../../src/dashboard/renderer.ts)
- Add a range/dimension → extend the enums in [types.ts](../../src/types.ts), the `RANGE_LABELS` map, and the buttons in [index.html](../../src/dashboard/index.html); [derive](./derive.md) must honor it.
- Retune the heatmap color scale → adjust the `--hm-0..4` ramp (or `levelForCost`'s bucketing) — the renderer keys cells by `data-level`, so color lives entirely in CSS. — [dashboard.css](../../src/dashboard/dashboard.css)
- Restyle via CSS variables (`--bg`, `--accent`, `--hm-*`, …) without touching the renderer. — [dashboard.css](../../src/dashboard/dashboard.css)

## Related Files

- [window.ts](../../src/window.ts) → [window.md](./window.md) — creates the `BrowserWindow` and loads this bundle.
- [preload.mts](../../src/preload.mts) → [preload.md](./preload.md) — exposes `window.burnbar.getSeries` via `contextBridge`.
- [ipc.ts](../../src/ipc.ts) → [ipc.md](./ipc.md) and [derive.md](./derive.md) — the main-side handler that answers `getSeries`.
- [types.md](./types.md) — the shared `DashboardSeries`/`Series*` contracts.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs), [adr/008](../adr/008-dashboard-window-bundle.md), [features/usage-dashboard.md](../features/usage-dashboard.md).
