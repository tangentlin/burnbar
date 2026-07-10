# Module: main

## Purpose

Electron main-process entry point. Builds the object graph — `ArchiveStore`, `SettingsStore`, `CaptureService`, `UpdateService`, `UpdateNotifier`, `MenuCardRenderer`, `TrayManager`, `DashboardWindow` (plus the archive IPC) — wires the tray's actions to the service, settings, and updater, and enforces menu-bar-only behavior with a bounded quit-time flush.

## Public Surface

No exports — this is the executable entry (`package.json#main` → `dist/main.js`). Module-private state: the singleton `captureService`/`trayManager`/`dashboardWindow`/`menuCardRenderer`/`updateService` handles, the `GITHUB_URL` About target, and the `quitting` latch. — [main.ts:18-22](../../src/main.ts#L18-L22)

## Responsibilities

- Hide the Dock on macOS for menu-bar-only operation. — [main.ts:25-28](../../src/main.ts#L25-L28)
- Resolve the timezone and construct the `ArchiveStore` (`userData/archive`) and `SettingsStore` (`userData/settings.json`), then `await settings.load()`. — [main.ts:30-36](../../src/main.ts#L30-L36)
- Construct the `CaptureService`, seeding `refreshIntervalMinutes` from the loaded settings, and the `UpdateService` (fixed cadence, no settings seed — see [update-service](./update-service.md)). — [main.ts:41-47](../../src/main.ts#L41-L47)
- Record the running `app.getVersion()` into `settings.lastRunVersion` (fire-and-forget) and remember the previous value, so a changed version after relaunch is detected as a just-installed update. — [main.ts](../../src/main.ts)
- Construct the `UpdateNotifier` with `() => updates.downloadUpdate()` as the "available" notification's click action (download-auto / restart-passive, see [update-notifier](./update-notifier.md)). — [main.ts](../../src/main.ts)
- Construct the `DashboardWindow` and `MenuCardRenderer`, then the `TrayManager` (passing the renderer), wiring `TrayCallbacks`: `onOpenDashboard` → `dashboard.open()`, `onRefreshNow` → `service.refreshNow()`, `onSetRefreshInterval` → `service.setRefreshIntervalMinutes(m)` then persist via `settings.setRefreshIntervalMinutes(m)`, `onAbout` → `shell.openExternal(GITHUB_URL)`, `onOpenLogFolder`/`onCopyDiagnostics` → `logger` helpers, and `onCheckForUpdates`/`onDownloadUpdate`/`onRestartToUpdate` → `updateService.checkNow()`/`downloadUpdate()`/`quitAndInstall()` (each write/open failure is logged, never an unhandled rejection). — [main.ts:50-88](../../src/main.ts#L50-L88)
- Register the read-only archive IPC, initialize the tray, subscribe it to usage state (`service.onState(state => tray.render(state))`), and fan update state out to **both** the tray and the notifier (`updates.onState(state => { tray.renderUpdate(state); updateNotifier.handle(state); })`); if the recorded version changed since last launch, `announceInstalled()` once; then `start()` both services. — [main.ts](../../src/main.ts)
- On `before-quit`, defer once and run a bounded final flush so the last interval persists, then tear down (including `updateService.dispose()`). — [main.ts:106-136](../../src/main.ts#L106-L136)

## Non-Goals

- No usage fetching, merging, or menu construction — delegated to [capture-service](./capture-service.md) / [store](./store.md) / [tray](./tray.md).
- No update check/download/install logic — delegated to [update-service](./update-service.md); `main.ts` only wires the tray's clicks to it (and is the **sole** caller of `quitAndInstall()` — see [ADR-011](../adr/011-auto-update-mechanism.md)).
- No settings sanitization or atomic write — owned by [settings](./settings.md) (and `atomicWriteJson` from [store](./store.md)).
- No dashboard rendering or archive querying — delegated to [window](./window.md) / [ipc](./ipc.md).

## How It Works

On `app.whenReady()` it builds the object graph and starts both services, which immediately backfill/check and push their first state to the tray via `onState`. The dashboard window is created lazily on the tray's "Open Usage Dashboard…" action. The live refresh interval has two owners kept in lockstep by `onSetRefreshInterval`: the `CaptureService` (the in-memory timer/menu) updates synchronously, and the `SettingsStore` persists asynchronously so the choice survives restart. `UpdateService` has no such lockstep — its check cadence is a fixed constant, not a persisted setting.

`before-quit` uses a deferred-quit pattern: the first event calls `preventDefault()`, runs `captureService.flush()` raced against `QUIT_FLUSH_TIMEOUT_MS`, then disposes `captureService`/`updateService` and calls `app.quit()`; the second pass (re-entry with `quitting` set) disposes every collaborator, `updateService` included. This guarantees the last interval is captured without letting a hung ccusage block shutdown. Note: `UpdateService.quitAndInstall()` itself calls the real electron-updater's `quitAndInstall()`, which internally triggers `app.quit()`/`app.exit()` — that re-enters this same `before-quit` handler, so an install+relaunch rides the identical bounded flush-then-quit path (delayed by at most `QUIT_FLUSH_TIMEOUT_MS`). — [main.ts:106-136](../../src/main.ts#L106-L136)

```mermaid
flowchart TD
    ready["app.whenReady"] --> stores["new ArchiveStore + SettingsStore (await load)"]
    stores --> svc["new CaptureService(refreshIntervalMinutes)"]
    ready --> upd["new UpdateService(logger)"]
    ready --> card["new MenuCardRenderer"]
    card --> tray["new TrayManager(TrayCallbacks, cardRenderer)"]
    ready --> win["new DashboardWindow"]
    ready --> ipc["registerArchiveIpc(store, tz)"]
    svc -->|onState| tray
    upd -->|onState| tray
    tray -->|onSetRefreshInterval| svc
    tray -->|persist| stores
    tray -->|onCheckForUpdates/onDownloadUpdate/onRestartToUpdate| upd
    ready --> start["service.start() + updates.start()"]
    quit["before-quit"] --> flush["bounded service.flush()"] --> teardown["dispose all (incl. updateService) → app.quit()"]
    upd -.->|quitAndInstall() triggers app.quit()| quit
```

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `TrayCallbacks` | The tray actions main wires (Open Dashboard, Refresh Now, Set Interval, About, Open Log Folder, Copy Diagnostics, Check/Download/Restart-to-Update) | [tray.ts:22-31](../../src/tray.ts#L22-L31) |
| `TrayState` | What `service.onState` pushes to the tray | [types.ts#TrayState](../../src/types.ts#L207-L212) |
| `UpdateState` | What `updates.onState` pushes to the tray's update row | [types.ts#UpdateState](../../src/types.ts#L234-L239) |
| `AppSettings` | Persisted prefs seeding the service | [types.ts#AppSettings](../../src/types.ts#L166-L168) |

## Invariants & Failure Modes

- Exactly one of each collaborator for the app's lifetime; all module-level handles — including the `MenuCardRenderer` and `UpdateService` — are disposed on quit. — [main.ts:90-94](../../src/main.ts#L90-L94), [main.ts:115-134](../../src/main.ts#L115-L134)
- `app.dock` is guarded before `.hide()` (undefined off-darwin). — [main.ts:26-28](../../src/main.ts#L26-L28)
- Settings load is awaited before the service is built, so the timer starts at the persisted cadence — never the default-then-correct flicker. — [main.ts:36-39](../../src/main.ts#L36-L39)
- `UpdateService` is seeded with no settings at all — its cadence is a fixed constant (see [update-service](./update-service.md)), so there is nothing here to await/lockstep for it beyond construction.
- The persist on `onSetRefreshInterval` is fire-and-forget with a `.catch`: the live timer/menu change is immediate and a disk failure degrades to "not remembered next launch", not a crash. — [main.ts:54-60](../../src/main.ts#L54-L60)
- **`quitAndInstall()` has exactly one call site**: `onRestartToUpdate` — no other code path in `main.ts` invokes it, satisfying the "only from the explicit click" guarantee. The `UpdateNotifier` is wired to `downloadUpdate()` (never `quitAndInstall`), so surfacing the "downloaded" notification cannot install — the restart stays the tray's job. — [main.ts:81-85](../../src/main.ts#L81-L85), [ADR-011](../adr/011-auto-update-mechanism.md)
- **Post-update confirmation fires at most once per install**: it is gated on `previousVersion && previousVersion !== currentVersion`, and the running version is recorded each launch, so an unchanged version (or first run, `undefined`) shows nothing. — [main.ts](../../src/main.ts)
- The quit flush is bounded by `QUIT_FLUSH_TIMEOUT_MS` (5 s); a hung ccusage cannot prevent shutdown. `UpdateService.dispose()` is synchronous and unaffected by the bound. — [main.ts:14-15](../../src/main.ts#L14-L15), [main.ts:120-134](../../src/main.ts#L120-L134)
- On non-darwin, closing the dashboard quits the app (`window-all-closed`); on macOS it stays resident in the tray. — [main.ts:138-143](../../src/main.ts#L138-L143)

## Extension Points

- New persisted preferences: extend [settings](./settings.md) + `AppSettings`, then thread the value through the `CaptureService` construction here.
- New tray actions: add a field to `TrayCallbacks` and wire it in the `TrayManager` constructor call (e.g. `onAbout` opening `GITHUB_URL`). — [main.ts:50-88](../../src/main.ts#L50-L88)
- New main-process IPC: register alongside `registerArchiveIpc`. — [main.ts:96](../../src/main.ts#L96)
- New update-lifecycle behavior: change [update-service.ts](../../src/update-service.ts); `main.ts` only needs new wiring if a new tray-facing action is added.

## Related Files

- [capture-service.ts](../../src/capture-service.ts), [update-service.ts](../../src/update-service.ts), [settings.ts](../../src/settings.ts), [tray.ts](../../src/tray.ts), [menu-card-window.ts](../../src/menu-card-window.ts), [window.ts](../../src/window.ts), [ipc.ts](../../src/ipc.ts), [store.ts](../../src/store.ts) — the wired collaborators.
- Sibling docs: [capture-service](./capture-service.md), [update-service](./update-service.md), [update-notifier](./update-notifier.md), [settings](./settings.md), [tray](./tray.md), [tray-icon](./tray-icon.md), [menu-card-window](./menu-card-window.md), [window](./window.md), [ipc](./ipc.md), [store](./store.md), [types](./types.md).
- [ARCHITECTURE.md](../ARCHITECTURE.md) for the overall graph; features: [usage-refresh.md](../features/usage-refresh.md), [auto-update.md](../features/auto-update.md).
