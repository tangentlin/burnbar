# Module: about-window

## Purpose

Owns the "About Burnbar" `BrowserWindow` — a small static credits/links page — so the rest of the app only needs `open()` and `dispose()`. Unlike [window](./window.md)'s `DashboardWindow`, it has no preload and no IPC: the page is static markup, and the app version is its only dynamic value.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `AboutWindow` | class | [about-window.ts:14](../../src/about-window.ts#L14) |
| `AboutWindow#open()` | `() => void` | [about-window.ts:17](../../src/about-window.ts#L17) |
| `AboutWindow#dispose()` | `() => void` | [about-window.ts:68](../../src/about-window.ts#L68) |

## Responsibilities

- Lazily create the window on first `open()`, reusing/focusing it otherwise. — [about-window.ts:17-22](../../src/about-window.ts#L17-L22)
- Apply a tighter security boundary than the dashboard: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (default), **no preload**. — [about-window.ts:24-38](../../src/about-window.ts#L24-L38)
- Route every link on the page to the system browser: `setWindowOpenHandler` denies in-app window creation and calls `shell.openExternal` for `target="_blank"` links; a `will-navigate` listener is a backstop for any other navigation attempt. — [about-window.ts:41-53](../../src/about-window.ts#L41-L53)
- Show on `ready-to-show` and clear the handle on `closed`. — [about-window.ts:55-61](../../src/about-window.ts#L55-L61)
- Load the bundled page at `dist/about/index.html`, passing `app.getVersion()` as a `?version=` query param — the page's own script (`about.ts`) reads it client-side. — [about-window.ts:63-65](../../src/about-window.ts#L63-L65)
- Tear the window down on app quit. — [about-window.ts:68-73](../../src/about-window.ts#L68-L73)

## Non-Goals

- No data reading or IPC of any kind — see [features/about.md](../features/about.md)'s "Known Pitfalls" for why this window should stay that way.
- No credits content logic — that's static markup in `src/about/index.html` / `about.css`; the only script is `about.ts`, which just paints the version into the DOM.
- No menu wiring — [tray](./tray.md) invokes `open()` through the `onAbout` callback. — [main.ts](../../src/main.ts)

## How It Works

`open()` is idempotent: if a live window exists it just `show()` + `focus()`es; otherwise it constructs a `BrowserWindow` (shown deferred until `ready-to-show`), wires the two external-link guards, and `loadFile`s the bundled HTML with the version in the query string. The `closed` listener nulls the field so the next `open()` rebuilds. `dispose()` destroys and nulls on quit — same shape as [`DashboardWindow`](./window.md).

## Key Types

This module uses only Electron's `BrowserWindow`; it defines no domain types.

## Invariants & Failure Modes

- **Single window**: at most one About window exists; concurrent `open()`s focus rather than duplicate. — [about-window.ts:18-21](../../src/about-window.ts#L18-L21)
- **No leak after close**: `window` returns to `null` on `closed`. — [about-window.ts:59-61](../../src/about-window.ts#L59-L61)
- **Links never navigate the window**: both `setWindowOpenHandler` (new-window path) and `will-navigate` (same-window path) route to `shell.openExternal` instead. `will-navigate` does not fire for the initial `loadFile()` call — only for user/page-initiated navigation — so this can't race the page's own load. — [about-window.ts:41-53](../../src/about-window.ts#L41-L53)
- **Bundle path coupling**: `index.html`, `about.css`, `about.js`, and `burnbar.svg` are resolved relative to `dist/about/` — the esbuild `build:renderer` step must emit all four, or `loadFile` fails. — [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs)

## Extension Points

- Window chrome (size, resizability, background) is set inline; adjust the `BrowserWindow` options. — [about-window.ts:24-38](../../src/about-window.ts#L24-L38)
- A new credit or link is a markup-only change in `src/about/index.html` (+ `about.css`) — no TypeScript change needed unless it becomes dynamic.

## Related Files

- [main.ts](../../src/main.ts) — constructs the window and wires `open()` to `onAbout`.
- [src/about/index.html](../../src/about/index.html), [src/about/about.css](../../src/about/about.css), [src/about/about.ts](../../src/about/about.ts) — the static page.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs) — bundles `about.ts` and copies the HTML/CSS/SVG into `dist/about/`.
- See [features/about.md](../features/about.md) for the user-facing spec, and [window](./window.md) for the sibling dashboard window this deliberately diverges from (no preload/IPC).
