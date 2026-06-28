# Module: main

## Purpose

Electron main-process entry point. Wires app lifecycle to a single `TrayManager` and enforces menu-bar-only behavior on macOS.

## Public Surface

This module has no exports — it is the executable entry (`package.json#main` → `dist/main.js`). — [main.ts](../../src/main.ts)

## Responsibilities

- Instantiate the single `TrayManager`. — [main.ts:4](../../src/main.ts#L4)
- Hide the Dock icon on macOS so the app lives only in the menu bar. — [main.ts:7-10](../../src/main.ts#L7-L10)
- Initialize the tray once Electron is ready. — [main.ts:12](../../src/main.ts#L12)
- Tear down the refresh timer on quit. — [main.ts:15-17](../../src/main.ts#L15-L17)

## Non-Goals

- No window/`BrowserWindow` creation — there is no renderer process.
- No usage parsing or menu construction (delegated to [usage](./usage.md) / [tray](./tray.md)).

## How It Works

On `app.whenReady()` it hides the Dock (darwin only) and awaits `trayManager.initializeTray()`. `before-quit` calls `dispose()`. `window-all-closed` quits only on non-darwin — defensive, since the app never opens windows. — [main.ts:6-23](../../src/main.ts#L6-L23)

## Invariants & Failure Modes

- Exactly one `TrayManager` instance for the app's lifetime. — [main.ts:4](../../src/main.ts#L4)
- `app.dock` is guarded before `.hide()` (undefined off-darwin). — [main.ts:8](../../src/main.ts#L8)

## Related Files

- [tray.ts](../../src/tray.ts) — the `TrayManager` this module drives.
