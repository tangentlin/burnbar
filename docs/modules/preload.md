# Module: preload

## Purpose

The renderer's only door to the main process: a contextBridge preload that exposes `window.burnbar` (`getSeries`, `getHeatmap`, `exportData`) and nothing else. Compiled to `dist/preload.mjs` and loaded into the dashboard window.

## Public Surface

| Export | Type | File |
|--------|------|------|
| _(none)_ — runs for its side effect | — | [preload.mts:15](../../src/preload.mts#L15) |

No module exports. The "surface" is the runtime global `window.burnbar`, shaped by `BurnbarBridge` and injected via `contextBridge.exposeInMainWorld`. — [preload.mts:11-15](../../src/preload.mts#L11-L15)

## Responsibilities

- Build the `bridge` object whose methods (`getSeries`, `getHeatmap`, `exportData`) forward to `ipcRenderer.invoke`. — [preload.mts](../../src/preload.mts)
- Expose it as `window.burnbar` across the contextIsolation boundary. — [preload.mts](../../src/preload.mts)

## Non-Goals

- No store, file, or Node access — the renderer asks; [ipc](./ipc.md) answers. — [preload.mts:5-8](../../src/preload.mts#L5-L8)
- No request validation or shaping — defaults and clamping live in the [ipc](./ipc.md) handler.
- No imports beyond `electron` (see invariants).

## How It Works

Wrap each IPC `invoke` in a `BurnbarBridge` and hand it to `exposeInMainWorld`. The renderer then calls e.g. `window.burnbar.getSeries(req)` / `getHeatmap(req)` and awaits the derived payload. Each channel id is an inlined string literal (`"archive:get-series"`, `"archive:get-heatmap"`, …) that mirrors the matching constant in [ipc](./ipc.md) — the two must stay in sync by hand, since the preload can't import them (below). — [preload.mts](../../src/preload.mts)

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `BurnbarBridge` | The renderer-facing surface (`window.burnbar`) | [types.ts#BurnbarBridge](../../src/types.ts#L157-L160) |
| `SeriesRequest` | `getSeries` argument (range + dimension) | [types.ts#SeriesRequest](../../src/types.ts#L138-L141) |
| `DashboardSeries` | Resolved chart payload | [types.ts#DashboardSeries](../../src/types.ts#L149-L155) |

## Invariants & Failure Modes

- **`.mts` → `.mjs` + `sandbox:false`**: the source is `.mts` so it compiles to an ES module (`preload.mjs`); Electron 42 only loads an ESM preload when the window runs un-sandboxed. The window sets `sandbox:false` with `contextIsolation:true` to honor this. — [preload.mts:4-5](../../src/preload.mts#L4-L5), [window.ts:30-34](../../src/window.ts#L30-L34)
- **Self-contained**: only the `electron` import survives compilation; the `import type` is erased. The preload must never depend on other `dist/` modules resolving at load time, so the channel string is inlined rather than imported from [ipc](./ipc.md). — [preload.mts:1-10](../../src/preload.mts#L1-L10)
- **Channel drift** [load-bearing]: if an inlined channel string here (`"archive:get-series"`, `"archive:get-heatmap"`, …) and its `*_CHANNEL` constant diverge, that bridge call silently hangs (no main-process handler). — [preload.mts](../../src/preload.mts), [ipc.ts](../../src/ipc.ts)
- See [adr/008-dashboard-window-bundle.md](../adr/008-dashboard-window-bundle.md) for the bundling/loading rationale.

## Extension Points

- To expose another renderer capability, add a method to `BurnbarBridge`, implement it here as an `invoke`, and register its handler in [ipc](./ipc.md). — [types.ts#BurnbarBridge](../../src/types.ts#L157-L160)

## Related Files

- [ipc](./ipc.md) — the main-process handler this bridge calls.
- [window](./window.md) — sets `preload` + `sandbox:false` and loads the dashboard.
- [dashboard](./dashboard.md) — the renderer that consumes `window.burnbar`.
- [types.ts](../../src/types.ts) — `BurnbarBridge`, `SeriesRequest`, `DashboardSeries`.
- [adr/008-dashboard-window-bundle.md](../adr/008-dashboard-window-bundle.md) — ESM preload + bundle decision.
