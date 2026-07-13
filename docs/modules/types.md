# Module: types

## Purpose

The shared, behavior-free type contracts for the whole app: the tray-display DTOs, the ccusage raw-output subset Burnbar parses, the durable archive records, the dashboard series, and the settings + tray-state push payload. Archive records deliberately mirror ccusage's field names so the `capture` normalizer stays a thin rename-free mapping.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `UsageStats`, `UsageData` | tray display model (`{totalTokens, cost}`; `daily`/`total` nullable; `error?`) | [types.ts:8-17](../../src/types.ts#L8-L17) |
| `CcusageModelBreakdown`, `CcusageRow`, `CcusageReportTotals` | parsed ccusage row shapes (shared by `daily` + `session`) | [types.ts:22-60](../../src/types.ts#L22-L60) |
| `CcusageDailyReport`, `CcusageSessionReport` | top-level report envelopes | [types.ts:63-72](../../src/types.ts#L63-L72) |
| `TokenCounts`, `ModelBreakdown`, `RecordTotals` | archive token/model primitives | [types.ts:77-94](../../src/types.ts#L77-L94) |
| `DailyRecord`, `SessionRecord`, `ArchiveManifest` | durable archive records | [types.ts:100-131](../../src/types.ts#L100-L131) |
| `SeriesRange`, `SeriesDimension`, `SeriesRequest`, `SeriesDataset`, `DashboardSeries` | dashboard query + chart series | [types.ts:135-156](../../src/types.ts#L135-L156) |
| `HeatmapRequest`, `HeatmapCell`, `HeatmapBreakdownEntry`, `HeatmapSeries` | calendar-heatmap query + per-day cells with model/agent splits | [types.ts#HeatmapSeries](../../src/types.ts) |
| `BurnbarBridge` | the `window.burnbar` surface the preload exposes (`getSeries`, `getHeatmap`, `exportData`) | [types.ts#BurnbarBridge](../../src/types.ts) |
| `AppSettings` | persisted user preferences (`settings.json`) | [types.ts:166-168](../../src/types.ts#L166-L168) |
| `MenuCard`, `MenuCardData` | derived 30-day stats-card figures, and the card renderer's full input (+ today's numbers) | [types.ts:175-189](../../src/types.ts#L175-L189) |
| `CardFrame` | one animated card frame — `{ png, animating }` — returned by `renderCardFrame` | [types.ts#CardFrame](../../src/types.ts) |
| `TrayState` | the full payload pushed to the tray on every capture/setting change | [types.ts:207-212](../../src/types.ts#L207-L212) |
| `UpdateStatus`, `UpdateState` | electron-updater lifecycle status + the serializable snapshot pushed to the tray's update row | [types.ts:220-239](../../src/types.ts#L220-L239) |

This module is pure type declarations — no runtime exports, no helpers.

## Responsibilities

- Define the tray display model (`UsageStats`, `UsageData`). — [types.ts:8-17](../../src/types.ts#L8-L17)
- Define the **external contract** assumed from ccusage — only the fields actually read. — [types.ts:22-72](../../src/types.ts#L22-L72)
- Define the **durable archive** shapes persisted by `store`. — [types.ts:77-131](../../src/types.ts#L77-L131)
- Define the **dashboard contract** between IPC/derive and the renderer (`SeriesRequest` → `DashboardSeries`, `HeatmapRequest` → `HeatmapSeries`, `BurnbarBridge`); `SeriesDataset` carries cost (`data`) and a parallel `tokens` array per label index, and each `HeatmapCell` carries the day total plus cost-descending `models`/`agents` splits. — [types.ts](../../src/types.ts)
- Define the **settings + tray-push contract**: `AppSettings.refreshIntervalMinutes` (`0` = manual only), the derived `MenuCard`/`MenuCardData` stats-card figures, and the `TrayState` snapshot the CaptureService emits. — [types.ts:176-212](../../src/types.ts#L176-L212)
- Define the **auto-update contract**: `UpdateStatus` (the lifecycle enum) and `UpdateState` (the serializable snapshot `UpdateService` pushes to the tray). — [types.ts:214-239](../../src/types.ts#L214-L239)

## Non-Goals

- Not the full ccusage schema — only the consumed subset is typed.
- No runtime validation — `JSON.parse` output is asserted with `as` at the capture boundary, not here. — [capture.ts](../../src/capture.ts)
- No persistence, formatting, scheduling, or aggregation behavior — pure declarations.

## How It Works

Two families share this file. The **archive records** (`DailyRecord`, `SessionRecord`, `ArchiveManifest`) build on `TokenCounts` (the five ccusage counts) → `ModelBreakdown` (per-model line + `cost`) → `RecordTotals` (rollup + `totalCost`); `store` merges them and `derive` reads them. The **view DTOs** flow the other way: `UsageData` feeds the tray, and `DashboardSeries` (built from `SeriesRequest`) feeds the renderer chart. `AppSettings` and `TrayState` close the loop — `settings` persists the interval, and the CaptureService folds today's `UsageData`, the last-success stamp, the derived 30-day `MenuCard`, and the active interval into one `TrayState` it pushes to the tray; the tray combines the card with today's numbers and the menu appearance into `MenuCardData` for the bitmap renderer.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `TokenCounts` | the five ccusage token counts (`totalTokens` = Σ other four) | [types.ts:77-83](../../src/types.ts#L77-L83) |
| `ModelBreakdown` | per-model line: `TokenCounts` + `modelName` + `cost` | [types.ts:86-89](../../src/types.ts#L86-L89) |
| `RecordTotals` | record rollup: `TokenCounts` + `totalCost` | [types.ts:92-94](../../src/types.ts#L92-L94) |
| `DailyRecord` / `SessionRecord` | durable archive records | [types.ts:100-122](../../src/types.ts#L100-L122) |
| `SeriesDataset` | one chart line: `label`, `data[]` (cost), `tokens[]` (parallel) | [types.ts:144-148](../../src/types.ts#L144-L148) |
| `AppSettings` | `{ refreshIntervalMinutes }` (`0` = manual) | [types.ts:166-168](../../src/types.ts#L166-L168) |
| `MenuCard` | derived 30-day card figures: `cost30d`, `tokens30d`, `topModel`, `spark[]` (daily costs) | [types.ts:175-180](../../src/types.ts#L175-L180) |
| `MenuCardData` | `MenuCard` + `todayCost`/`todayTokens` + `dark` (menu appearance) — the browser card renderer's input | [types.ts:186-190](../../src/types.ts#L186-L190) |
| `TrayState` | `{ usage, lastUpdatedAt, card, refreshIntervalMinutes }` | [types.ts:207-212](../../src/types.ts#L207-L212) |
| `UpdateState` | `{ status, version, percent, error }` — pushed by `UpdateService` on every transition | [types.ts:234-239](../../src/types.ts#L234-L239) |

## Invariants & Failure Modes

- `ModelBreakdown` and `RecordTotals` both extend `TokenCounts`; `totalTokens` is the sum of the four component counts, never trusted from the wire. — [types.ts:77-94](../../src/types.ts#L77-L94), [store.ts#rollupTotals](../../src/store.ts#L69)
- `UsageData.daily`/`total` are `UsageStats | null` (not optional) so the UI branches on value; `error` is the only optional field. — [types.ts:13-17](../../src/types.ts#L13-L17)
- The **rename**: ccusage's `totalCost` becomes `cost` only in `UsageStats`/`ModelBreakdown`; record-level totals keep `totalCost`. — [types.ts:8-11](../../src/types.ts#L8-L11), [types.ts:92-94](../../src/types.ts#L92-L94)
- `SeriesDataset.tokens` is **parallel to** `data` — same length, same `labels` index; a chart line's cost and token total at index *i* describe the same day. — [types.ts:144-148](../../src/types.ts#L144-L148), [derive.ts](../../src/derive.ts)
- `AppSettings.refreshIntervalMinutes === 0` is the **manual-only** sentinel — no auto-refresh timer is armed. — [types.ts:166-168](../../src/types.ts#L166-L168), [capture-service.ts:117](../../src/capture-service.ts#L117)
- `MenuCard.topModel` is `null` when nothing was spent in range; `MenuCardData` extends `MenuCard` with nullable `todayCost`/`todayTokens` (null = no row yet) and `dark` (the menu appearance, which picks the transparent card's value-text color). The CaptureService derives `MenuCard` from the archive over the same 30-day window the dashboard's `30d` view uses, so the two stay consistent. — [types.ts:175-190](../../src/types.ts#L175-L190), [capture-service.ts#computeCard](../../src/capture-service.ts#L201)
- `CardFrame.animating` is the sole signal the main-process poller (`card-animator.ts`) uses to decide whether to request another frame — it's `true` while ember particles are active (the odometer-roll/bar-growth animations that used to also drive this were removed; see [ADR-013's amendment](../adr/013-menu-card-animation-framework.md#amendment-the-verification-item-resolved-false-2026-07)).
- `TrayState.lastUpdatedAt` is `null` until the first *successful* capture; it is the success stamp, not the last *attempt*. — [types.ts:209](../../src/types.ts#L209), [capture-service.ts:224-234](../../src/capture-service.ts#L224-L234)
- `ArchiveManifest.schemaVersion` gates migrations; bump it when any record shape changes. — [types.ts:125-131](../../src/types.ts#L125-L131)
- `UpdateState.version`/`percent`/`error` are `null` outside the states that populate them (e.g. `percent` only during `downloading`); `status` is the single source of truth for which fields are meaningful. — [types.ts:220-239](../../src/types.ts#L220-L239), [update-service.ts](../../src/update-service.ts)

## Extension Points

- To consume more ccusage fields, extend `CcusageModelBreakdown`/`CcusageRow` plus the archive primitives, then the `capture` normalizer. — [types.ts:22-94](../../src/types.ts#L22-L94)
- To add a setting, extend `AppSettings` and `settings.ts`'s sanitize/persist path; thread it into `TrayState` if the tray needs it. — [types.ts:166-201](../../src/types.ts#L166-L201)
- To change what the stats card shows, extend `MenuCard`/`MenuCardData`, then `computeCard` in [capture-service.ts](../../src/capture-service.ts) and the canvas in [src/menu-card/card.ts](../../src/menu-card/card.ts).
- To add a chart dimension or extra per-line metric, extend `SeriesDimension`/`SeriesDataset` and the `derive` builders.

## Documentation Update Rule

Changing any of these types must update this file's tables, [DOMAIN.md](../DOMAIN.md) glossary/ER, and the consuming module docs ([capture](./capture.md), [store](./store.md), [derive](./derive.md), [tray](./tray.md), [capture-service](./capture-service.md), [update-service](./update-service.md)).

## Related Files

- Producers/consumers: [capture.ts](../../src/capture.ts), [store.ts](../../src/store.ts), [derive.ts](../../src/derive.ts), [tray.ts](../../src/tray.ts), [capture-service.ts](../../src/capture-service.ts), [settings.ts](../../src/settings.ts), [update-service.ts](../../src/update-service.ts).
- Sibling docs: [capture](./capture.md), [store](./store.md), [derive](./derive.md), [tray](./tray.md), [capture-service](./capture-service.md), [update-service](./update-service.md).
- [DOMAIN.md](../DOMAIN.md) — glossary + ER for these contracts.
