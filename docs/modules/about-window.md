# Module: about-window

## Purpose

Owns the "About Burnbar" `BrowserWindow` — a small static credits/links page — so the rest of the app only needs `open()` and `dispose()`. Unlike [window](./window.md)'s `DashboardWindow`, it has no preload and no IPC: the page is static markup, and the app version is its only dynamic value.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `AboutWindow` | class | [about-window.ts:34](../../src/about-window.ts#L34) |
| `AboutWindow#open()` | `() => void` | [about-window.ts:37](../../src/about-window.ts#L37) |
| `AboutWindow#dispose()` | `() => void` | [about-window.ts:92](../../src/about-window.ts#L92) |

`openExternal(url)` (module-private) is the shared gate every link routes through. — [about-window.ts:12-25](../../src/about-window.ts#L12-L25)

## Responsibilities

- Lazily create the window on first `open()`, reusing/focusing it otherwise. — [about-window.ts:37-42](../../src/about-window.ts#L37-L42)
- Apply a tighter security boundary than the dashboard: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, **no preload**. — [about-window.ts:44-58](../../src/about-window.ts#L44-L58)
- Route every link on the page to the system browser through `openExternal`, which allow-lists `http:`/`https:` (refusing `file:`, `javascript:`, …) and logs — rather than throws on — a rejected `shell.openExternal` call. `setWindowOpenHandler` denies in-app window creation for `target="_blank"` links; a `will-navigate` listener is a backstop for any other navigation attempt. — [about-window.ts:7-25](../../src/about-window.ts#L7-L25), [about-window.ts:66-73](../../src/about-window.ts#L66-L73)
- Show on `ready-to-show` and clear the handle on `closed`. — [about-window.ts:75-81](../../src/about-window.ts#L75-L81)
- Load the bundled page at `dist/about/index.html`, passing `app.getVersion()` as a `?version=` query param — the page's own script (`about.ts`) reads it client-side; a load failure is caught and logged rather than left as an unhandled rejection. — [about-window.ts:83-90](../../src/about-window.ts#L83-L90)
- Tear the window down on app quit. — [about-window.ts:92-97](../../src/about-window.ts#L92-L97)

## Non-Goals

- No data reading or IPC of any kind — see [features/about.md](../features/about.md)'s "Known Pitfalls" for why this window should stay that way.
- No credits content logic — that's static markup in `src/about/index.html` / `about.css`; the only script is `about.ts`, which just paints the version into the DOM.
- No menu wiring — [tray](./tray.md) invokes `open()` through the `onAbout` callback. — [main.ts](../../src/main.ts)

## How It Works

`open()` is idempotent: if a live window exists it just `show()` + `focus()`es; otherwise it constructs a `BrowserWindow` (shown deferred until `ready-to-show`), wires the two external-link guards, and `loadFile`s the bundled HTML with the version in the query string. The `closed` listener nulls the field so the next `open()` rebuilds. `dispose()` destroys and nulls on quit — same shape as [`DashboardWindow`](./window.md).

## Key Types

This module uses only Electron's `BrowserWindow`; it defines no domain types.

## Invariants & Failure Modes

- **Single window**: at most one About window exists; concurrent `open()`s focus rather than duplicate. — [about-window.ts:38-41](../../src/about-window.ts#L38-L41)
- **No leak after close**: `window` returns to `null` on `closed`. — [about-window.ts:79-81](../../src/about-window.ts#L79-L81)
- **Links never navigate the window, and never an unexpected scheme**: both `setWindowOpenHandler` (new-window path) and `will-navigate` (same-window path) route through `openExternal`, which allow-lists `http:`/`https:` before calling `shell.openExternal`. `will-navigate` does not fire for the initial `loadFile()` call — only for user/page-initiated navigation — so this can't race the page's own load. — [about-window.ts:7-25](../../src/about-window.ts#L7-L25), [about-window.ts:66-73](../../src/about-window.ts#L66-L73)
- **Bundle path coupling**: `index.html`, `about.css`, and `about.js` are emitted from `src/about/` by the esbuild `build:renderer` step; `burnbar.svg` is copied separately from the repo's canonical `assets/burnbar.svg` (not duplicated under `src/about/`). All four must land in `dist/about/`, or `loadFile` fails. — [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs)

## Extension Points

- Window chrome (size, resizability, background) is set inline; adjust the `BrowserWindow` options. — [about-window.ts:44-58](../../src/about-window.ts#L44-L58)
- A new credit or link is a markup-only change in `src/about/index.html` (+ `about.css`) — no TypeScript change needed unless it becomes dynamic.

## Related Files

- [main.ts](../../src/main.ts) — constructs the window and wires `open()` to `onAbout`.
- [src/about/index.html](../../src/about/index.html), [src/about/about.css](../../src/about/about.css), [src/about/about.ts](../../src/about/about.ts) — the static page.
- [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs) — bundles `about.ts`, copies the HTML/CSS from `src/about/`, and copies `burnbar.svg` from `assets/` into `dist/about/`.
- See [features/about.md](../features/about.md) for the user-facing spec, and [window](./window.md) for the sibling dashboard window this deliberately diverges from (no preload/IPC).
