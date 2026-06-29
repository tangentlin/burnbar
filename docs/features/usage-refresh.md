# Feature: Refresh Cadence & Manual Refresh

## User Story

As a user, I want Burnbar's numbers to refresh on a cadence I control — including turning auto-refresh off entirely — and to force an update on demand, with a clear sense of when the stats last changed.

## Scope

**Includes:** a default **15-minute** auto-refresh; a tray "Auto-Refresh" submenu to change it (Manual / 5 / 10 / 15 / 30 / 60 min); **0 = manual** (no auto-refresh); a "Refresh Now" item; a relative-time "Updated …" row; persistence of the chosen interval to `settings.json` under userData.
**Excludes:** free-form numeric entry in the menu (presets only — a non-preset value placed in `settings.json` is honored and shown as "Custom"); per-view or per-window cadences.

## How It Works

The chosen interval drives the single ccusage call that feeds both the tray and the archive: the [CaptureService](../modules/capture-service.md) (re)schedules its timer on launch and whenever the interval changes, and skips the timer entirely in manual mode. "Refresh Now" calls `refreshNow()` for an immediate capture; the menu's "Updated …" label is recomputed from the last **successful** capture time (a lightweight tray timer keeps it honest between refreshes). The interval is read from [SettingsStore](../modules/settings.md) at startup and written back atomically when changed. — [capture-service.ts](../../src/capture-service.ts), [settings.ts](../../src/settings.ts), [tray.ts](../../src/tray.ts)

## Acceptance Criteria

- [ ] Defaults to a 15-minute auto-refresh on first run. — [settings.ts](../../src/settings.ts)
- [ ] The Auto-Refresh submenu changes the cadence live and persists it. — [tray.ts](../../src/tray.ts), [main.ts](../../src/main.ts)
- [ ] **0 = manual**: no auto-refresh; only "Refresh Now", launch, and quit capture. — [capture-service.ts](../../src/capture-service.ts)
- [ ] "Refresh Now" triggers an immediate daily + session capture. — [capture-service.ts#refreshNow](../../src/capture-service.ts)
- [ ] The menu shows a friendly "Updated …" relative time from the last successful capture. — [tray.ts](../../src/tray.ts), [time.ts#formatRelativeTime](../../src/time.ts)
- [ ] Capture stays best-effort — a failure never crashes the tray and leaves the archive intact. — [capture-service.ts](../../src/capture-service.ts)

## Data Model (Conceptual)

`AppSettings { refreshIntervalMinutes }` persisted in `settings.json`; the live value flows into `TrayState.refreshIntervalMinutes` for the submenu checkmark. — [types.ts](../../src/types.ts), [DOMAIN.md](../DOMAIN.md)

## Known Pitfalls

- In **manual** mode there is no day-rollover tick, so an end-of-day session capture may wait until the next manual refresh / launch / quit — keep-richest backfill means no data is lost, only deferred.
- Relative time is recomputed on a modest tray timer; it can lag the true age by under a minute between refreshes.

## Related

- [modules/settings.md](../modules/settings.md), [modules/capture-service.md](../modules/capture-service.md), [modules/tray.md](../modules/tray.md), [features/usage-menu.md](./usage-menu.md).
