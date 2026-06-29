# Module: window

## Purpose

Owns the dashboard `BrowserWindow` — its lazy creation, security boundary, and lifecycle — so the rest of the app only needs `open()` and `dispose()`.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `DashboardWindow` | class | [window.ts:12](../../src/window.ts#L12) |
| `DashboardWindow#open()` | `() => void` | [window.ts:15](../../src/window.ts#L15) |
| `DashboardWindow#dispose()` | `() => void` | [window.ts:49](../../src/window.ts#L49) |

The `window` field and `__dirname` shim are module-private. — [window.ts:5,13](../../src/window.ts#L5)

## Responsibilities

- Lazily create the window on first `open()`, reusing/focusing it otherwise. — [window.ts:15-21](../../src/window.ts#L15-L21)
- Apply the renderer security boundary: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, ESM `preload.mjs`. — [window.ts:30-35](../../src/window.ts#L30-L35)
- Show on `ready-to-show` (avoids a flash of unstyled window) and clear the handle on `closed`. — [window.ts:38-44](../../src/window.ts#L38-L44)
- Load the bundled renderer at `dist/dashboard/index.html`. — [window.ts:46](../../src/window.ts#L46)
- Tear the window down on app quit. — [window.ts:49-54](../../src/window.ts#L49-L54)

## Non-Goals

- No data reading or IPC — the renderer reaches the archive only via the [preload](./preload.md) bridge and [ipc](./ipc.md) handler.
- No chart logic — that lives in `src/dashboard/renderer.ts` (see [dashboard](./dashboard.md)).
- No menu wiring — [tray](./tray.md) invokes `open()` through the `onOpenDashboard` callback. — [main.ts:28](../../src/main.ts#L28)

## How It Works

`open()` is idempotent: if a live window exists it just `show()` + `focus()`es; otherwise it constructs a `BrowserWindow` (shown deferred until `ready-to-show`) and `loadFile`s the bundled HTML. The `closed` listener nulls the field so the next `open()` rebuilds. `dispose()` destroys and nulls on quit. — [window.ts:15-54](../../src/window.ts#L15-L54)

## Key Types

This module uses only Electron's `BrowserWindow`; it defines no domain types. The renderer contract (`SeriesRequest` → `DashboardSeries`) lives in [types.ts](../../src/types.ts) and is exercised across the [preload](./preload.md)/[ipc](./ipc.md) boundary.

## Invariants & Failure Modes

- **Single window**: at most one dashboard exists; concurrent `open()`s focus rather than duplicate. — [window.ts:16-20](../../src/window.ts#L16-L20)
- **No leak after close**: `window` returns to `null` on `closed`, so `isDestroyed()` checks never read a freed handle. — [window.ts:42-44](../../src/window.ts#L42-L44)
- **`sandbox: false` is deliberate**, not an oversight — Electron 42 loads an ESM preload (`preload.mjs`) only when the sandbox is off. Practical risk is low (local code, one read-only channel, strict CSP). — [window.ts:30-35](../../src/window.ts#L30-L35), [ADR-008](../adr/008-dashboard-window-bundle.md)
- **Bundle path coupling**: `index.html` and `preload.mjs` are resolved relative to `dist/` — the esbuild + `tsc` build must emit both, or `loadFile` fails. — [window.ts:31,46](../../src/window.ts#L31)

## Extension Points

- Window chrome (size, title, background) is set inline; adjust the `BrowserWindow` options. — [window.ts:22-36](../../src/window.ts#L22-L36)
- To harden, swap to a sandboxed CommonJS preload (`sandbox: true`) — see the alternative in [ADR-008](../adr/008-dashboard-window-bundle.md).

## Related Files

- [main.ts](../../src/main.ts) — constructs the window and wires `open()`/`dispose()`.
- [preload.mts](../../src/preload.mts) ([preload](./preload.md)) — the contextBridge loaded here.
- See [features/usage-dashboard.md](../features/usage-dashboard.md) and [adr/008-dashboard-window-bundle.md](../adr/008-dashboard-window-bundle.md) for the rationale.
