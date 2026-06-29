# Module: settings

## Purpose

Persists user preferences (`settings.json` under userData) behind a tiny `SettingsStore`. Today's only setting is the auto-refresh interval; writes reuse the store's atomic temp-then-rename IO so a crash mid-save never corrupts preferences.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `DEFAULT_REFRESH_INTERVAL_MINUTES` | `number` (15) | [settings.ts:5](../../src/settings.ts#L5) |
| `REFRESH_PRESETS_MINUTES` | `number[]` (`0, 5, 10, 15, 30, 60`) | [settings.ts:9](../../src/settings.ts#L9) |
| `SettingsStore` | load/get/read/write class | [settings.ts:24](../../src/settings.ts#L24) |
| `SettingsStore.load()` | `() => Promise<AppSettings>` | [settings.ts:30](../../src/settings.ts#L30) |
| `SettingsStore.get()` | `() => AppSettings` | [settings.ts:42](../../src/settings.ts#L42) |
| `SettingsStore.getRefreshIntervalMinutes()` | `() => number` | [settings.ts:46](../../src/settings.ts#L46) |
| `SettingsStore.setRefreshIntervalMinutes()` | `(minutes) => Promise<AppSettings>` | [settings.ts:50](../../src/settings.ts#L50) |

Module-private: `sanitizeMinutes` — the single coercion gate applied on every read and write. — [settings.ts:12](../../src/settings.ts#L12)

## Responsibilities

- Hold the in-memory `AppSettings`, seeded with the default so the store is usable before `load()`. — [settings.ts:25](../../src/settings.ts#L25)
- Load `settings.json`, coercing the parsed value through `sanitizeMinutes`; a missing or unreadable file leaves defaults in place. — [settings.ts:30-40](../../src/settings.ts#L30-L40)
- Expose the current settings / interval for the `CaptureService` seed and tray menu. — [settings.ts:42-48](../../src/settings.ts#L42-L48)
- Sanitize, set, and atomically persist a new interval, returning the updated settings. — [settings.ts:50-54](../../src/settings.ts#L50-L54)

## Non-Goals

- No scheduling — owning the live timer and applying interval changes is the [capture-service](./capture-service.md).
- No menu rendering — the tray reads `REFRESH_PRESETS_MINUTES` to build the Auto-Refresh submenu. — [tray.ts:167](../../src/tray.ts#L167)
- No atomic-write implementation — that's `atomicWriteJson`, reused from [store](./store.md). — [settings.ts:2](../../src/settings.ts#L2)
- No wiring of write-failure handling — `main.ts` owns logging the rejected persist. — [main.ts:44-46](../../src/main.ts#L44-L46)

## How It Works

`main.ts` constructs the store at `userData/settings.json`, awaits `load()`, then seeds the `CaptureService` with `getRefreshIntervalMinutes()`. When the tray's Auto-Refresh radio fires, `main.ts` updates the live service *immediately* and persists in the background — a write failure is logged, not thrown. — [main.ts:28-47](../../src/main.ts#L28-L47)

`sanitizeMinutes` is the only validator: non-numbers, non-finite, or negatives fall back to the default (15); valid values are floored. `0` is a legitimate value meaning "manual only / never auto-refresh", so it survives the gate. Because both `load()` and `setRefreshIntervalMinutes()` route through it, an out-of-range value can never reach disk or the service.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `AppSettings` | Persisted preferences (`refreshIntervalMinutes`; `0` = manual) | [types.ts#AppSettings](../../src/types.ts#L166-L168) |

## Invariants & Failure Modes

- **All values pass `sanitizeMinutes`**: every read (`load`) and every write (`set`) is coerced, so the in-memory and on-disk interval is always a non-negative integer. — [settings.ts:33](../../src/settings.ts#L33), [settings.ts:51](../../src/settings.ts#L51)
- **`0` is meaningful, not bogus**: it passes the gate and signals manual-only; only negatives/NaN/non-numbers fall back to the default. — [settings.ts:13-16](../../src/settings.ts#L13-L16)
- **Atomic persist (load-bearing)**: `setRefreshIntervalMinutes` writes via `atomicWriteJson`, so a crash mid-write leaves the prior `settings.json` intact. — [settings.ts:52](../../src/settings.ts#L52), [store.ts#atomicWriteJson](../../src/store.ts#L203)
- **Missing file is normal**: `ENOENT` is swallowed silently (first run); any other read/parse error is logged and defaults are kept — `load()` never throws. — [settings.ts:34-38](../../src/settings.ts#L34-L38)
- **Custom values survive**: an interval outside `REFRESH_PRESETS_MINUTES` (e.g. file-edited) is honored and shown as "Custom" in the tray, not snapped to a preset. — [tray.ts:175-183](../../src/tray.ts#L175-L183)

## Extension Points

- Add a field to `AppSettings`, give it a default in the constructor seed, and coerce it in `load()`/its setter — keep all validation in one gate per field. — [settings.ts:25](../../src/settings.ts#L25), [settings.ts:33](../../src/settings.ts#L33)
- Edit `REFRESH_PRESETS_MINUTES` to change the tray's offered intervals without touching the store. — [settings.ts:9](../../src/settings.ts#L9)
- Change the default by editing `DEFAULT_REFRESH_INTERVAL_MINUTES` (note: `capture-service.ts` keeps its own fallback constant for when no interval is passed). — [settings.ts:5](../../src/settings.ts#L5), [capture-service.ts:16](../../src/capture-service.ts#L16)

## Related Files

- [main.ts](../../src/main.ts) — constructs the store, seeds the service, persists tray changes.
- Sibling docs: [capture-service](./capture-service.md) (owns the live timer), [store](./store.md) (owns `atomicWriteJson`), [tray](./tray.md) (renders the presets), [types](./types.md).
- Feature: [usage-refresh.md](../features/usage-refresh.md).
