# Module: dashboard

## Purpose

The browser-context renderer for Burnbar's one window: it requests a `DashboardSeries` over the preload bridge and draws it as a stacked, toggleable Chart.js bar chart. This is the only module that runs outside the main process.

## Public Surface

This module has **no exports** — it is a bundle entry point, not a library. The browser loads it as `renderer.js` (esbuild output) and its top-level statements run on load. — [renderer.ts:157-159](../../src/dashboard/renderer.ts#L157-L159)

It reads exactly one capability off the window: `window.burnbar.getSeries`, typed by `BurnbarBridge`. — [renderer.ts:16-20](../../src/dashboard/renderer.ts#L16-L20)

Internal helpers: `byId` (typed `getElementById`), `setControlState`, `draw`, `refresh`, `wireControls`. — [renderer.ts:46-155](../../src/dashboard/renderer.ts#L46-L155)

## Responsibilities

- Register **only** the Chart.js pieces used (`BarController`, `BarElement`, scales, `Tooltip`, `Legend`) so esbuild tree-shakes the rest. — [renderer.ts:12-14](../../src/dashboard/renderer.ts#L12-L14)
- Fetch a series via the read-only bridge on load, on range click, and on dimension click. — [renderer.ts:112-117](../../src/dashboard/renderer.ts#L112-L117)
- Render a **stacked** bar chart (both axes `stacked: true`), USD-formatted y-ticks and tooltips. — [renderer.ts:84-109](../../src/dashboard/renderer.ts#L84-L109)
- Update the total header from the *server-confirmed* `series.range`, not the local toggle. — [renderer.ts:118-119](../../src/dashboard/renderer.ts#L118-L119)
- Drive the three view states — chart / empty / error — by toggling `hidden`. — [renderer.ts:121-133](../../src/dashboard/renderer.ts#L121-L133)
- Reflect the active range/dimension on the segmented buttons (`.active` + `aria-pressed`). — [renderer.ts:54-65](../../src/dashboard/renderer.ts#L54-L65)

## Non-Goals

- No data access beyond `getSeries` — no Node, no `fs`, no network; the archive read and all aggregation live behind [ipc](./ipc.md) / [derive](./derive.md).
- No persistence or caching — every toggle is a fresh round-trip.
- No type-checking at build time — esbuild only transpiles; types are checked separately by `tsconfig.dashboard.json`. — [build-renderer.mjs](../../scripts/build-renderer.mjs)
- **Not unit-tested in v1** — verified manually (toggle each range × dimension, empty archive, IPC error). See [usage-dashboard.md](../features/usage-dashboard.md).

## How It Works

`renderer.ts` is bundled by **esbuild** (`platform: "browser"`, ESM, tree-shaken Chart.js), *not* by `tsc`, because Chart.js must be inlined and the renderer needs the DOM lib the Node16 main config omits. The bundle plus `index.html` and `dashboard.css` are copied into `dist/dashboard/`. — [build-renderer.mjs](../../scripts/build-renderer.mjs), [adr/008](../adr/008-dashboard-window-bundle.md)

On load it wires the two segmented control groups, paints the initial button state, and calls `refresh()`. `refresh()` awaits `getSeries({ range, dimension })`, then either `draw()`s (reusing the existing `Chart` via `chart.update()` when present) or shows the empty/error paragraph. `draw()` maps each `SeriesDataset` to a bar dataset, cycling the color-blind-friendly `PALETTE`; the legend appears only when `dimension !== "none"`. — [renderer.ts:67-159](../../src/dashboard/renderer.ts#L67-L159)

`index.html` carries a strict **CSP** (`default-src 'none'`, `script-src 'self'`) — the renderer's security boundary, matching ADR-008's "local code only, one read-only channel". — [index.html:5-8](../../src/dashboard/index.html#L5-L8)

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `SeriesRequest` | `{ range, dimension }` sent to `getSeries` | [types.ts#SeriesRequest](../../src/types.ts#L138-L141) |
| `DashboardSeries` | labels + datasets + `totalCost` to render | [types.ts#DashboardSeries](../../src/types.ts#L149-L155) |
| `SeriesDataset` | one stacked bar (label + per-label cost) | [types.ts#SeriesDataset](../../src/types.ts#L144-L147) |
| `SeriesRange` / `SeriesDimension` | the toggle enums | [types.ts:135-136](../../src/types.ts#L135-L136) |
| `BurnbarBridge` | the lone `getSeries` capability on `window.burnbar` | [types.ts#BurnbarBridge](../../src/types.ts#L158-L160) |

## Invariants & Failure Modes

- **`byId` throws** if any expected element id is missing — a structural contract between `renderer.ts` and `index.html`; rename an id in one and the renderer fails loudly on load. — [renderer.ts:46-52](../../src/dashboard/renderer.ts#L46-L52)
- Exactly **one** of chart / empty / error is visible: `empty` shows when no dataset has a positive value, `error` on any rejection, `chart` otherwise. — [renderer.ts:121-133](../../src/dashboard/renderer.ts#L121-L133)
- `dataset.range`/`dataset.dim` are cast (`as SeriesRange`) — trusted because the HTML hardcodes the only valid values. — [renderer.ts:142](../../src/dashboard/renderer.ts#L142), [index.html:23-30](../../src/dashboard/index.html#L23-L30)
- All thrown values are stringified into the error paragraph; the renderer never crashes the window. — [renderer.ts:128-133](../../src/dashboard/renderer.ts#L128-L133)
- The `Chart` instance is a module singleton (`let chart`) reused across refreshes — never re-instantiated, so toggles animate-free via `update()`. — [renderer.ts:42](../../src/dashboard/renderer.ts#L42), [renderer.ts:77-82](../../src/dashboard/renderer.ts#L77-L82)

## Extension Points

- Add a Chart.js feature (e.g. a plugin or chart type) → register it in the `Chart.register(...)` call so esbuild keeps it. — [renderer.ts:14](../../src/dashboard/renderer.ts#L14)
- Add a range/dimension → extend the enums in [types.ts](../../src/types.ts#L135-L136), the `RANGE_LABELS` map, and the buttons in [index.html](../../src/dashboard/index.html#L21-L32); [derive](./derive.md) must honor it.
- Restyle via CSS variables (`--bg`, `--accent`, …) without touching the renderer. — [dashboard.css:1-10](../../src/dashboard/dashboard.css#L1-L10)

## Related Files

- [window.ts](../../src/window.ts) → [window.md](./window.md) — creates the `BrowserWindow` and loads this bundle.
- [preload.mts](../../src/preload.mts) → [preload.md](./preload.md) — exposes `window.burnbar.getSeries` via `contextBridge`.
- [ipc.ts](../../src/ipc.ts) → [ipc.md](./ipc.md) and [derive.md](./derive.md) — the main-side handler that answers `getSeries`.
- [types.md](./types.md) — the shared `DashboardSeries`/`Series*` contracts.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs), [adr/008](../adr/008-dashboard-window-bundle.md), [features/usage-dashboard.md](../features/usage-dashboard.md).
