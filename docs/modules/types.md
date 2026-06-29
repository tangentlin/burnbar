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
| `BurnbarBridge` | the `window.burnbar` surface the preload exposes | [types.ts:159-161](../../src/types.ts#L159-L161) |
| `AppSettings` | persisted user preferences (`settings.json`) | [types.ts:166-168](../../src/types.ts#L166-L168) |
| `TrayState` | the full payload pushed to the tray on every capture/setting change | [types.ts:175-180](../../src/types.ts#L175-L180) |

This module is pure type declarations — no runtime exports, no helpers.

## Responsibilities

- Define the tray display model (`UsageStats`, `UsageData`). — [types.ts:8-17](../../src/types.ts#L8-L17)
- Define the **external contract** assumed from ccusage — only the fields actually read. — [types.ts:22-72](../../src/types.ts#L22-L72)
- Define the **durable archive** shapes persisted by `store`. — [types.ts:77-131](../../src/types.ts#L77-L131)
- Define the **dashboard contract** between IPC/derive and the renderer (`SeriesRequest` → `DashboardSeries`, `BurnbarBridge`); `SeriesDataset` carries cost (`data`) and a parallel `tokens` array per label index. — [types.ts:144-161](../../src/types.ts#L144-L161)
- Define the **settings + tray-push contract**: `AppSettings.refreshIntervalMinutes` (`0` = manual only) and the `TrayState` snapshot the CaptureService emits. — [types.ts:166-180](../../src/types.ts#L166-L180)

## Non-Goals

- Not the full ccusage schema — only the consumed subset is typed.
- No runtime validation — `JSON.parse` output is asserted with `as` at the capture boundary, not here. — [capture.ts](../../src/capture.ts)
- No persistence, formatting, scheduling, or aggregation behavior — pure declarations.

## How It Works

Two families share this file. The **archive records** (`DailyRecord`, `SessionRecord`, `ArchiveManifest`) build on `TokenCounts` (the five ccusage counts) → `ModelBreakdown` (per-model line + `cost`) → `RecordTotals` (rollup + `totalCost`); `store` merges them and `derive` reads them. The **view DTOs** flow the other way: `UsageData` feeds the tray, and `DashboardSeries` (built from `SeriesRequest`) feeds the renderer chart. `AppSettings` and `TrayState` close the loop — `settings` persists the interval, and the CaptureService folds today's `UsageData`, the last-success stamp, the 30-day cost `sparkline`, and the active interval into one `TrayState` it pushes to the tray.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `TokenCounts` | the five ccusage token counts (`totalTokens` = Σ other four) | [types.ts:77-83](../../src/types.ts#L77-L83) |
| `ModelBreakdown` | per-model line: `TokenCounts` + `modelName` + `cost` | [types.ts:86-89](../../src/types.ts#L86-L89) |
| `RecordTotals` | record rollup: `TokenCounts` + `totalCost` | [types.ts:92-94](../../src/types.ts#L92-L94) |
| `DailyRecord` / `SessionRecord` | durable archive records | [types.ts:100-122](../../src/types.ts#L100-L122) |
| `SeriesDataset` | one chart line: `label`, `data[]` (cost), `tokens[]` (parallel) | [types.ts:144-148](../../src/types.ts#L144-L148) |
| `AppSettings` | `{ refreshIntervalMinutes }` (`0` = manual) | [types.ts:166-168](../../src/types.ts#L166-L168) |
| `TrayState` | `{ usage, lastUpdatedAt, sparkline, refreshIntervalMinutes }` | [types.ts:175-180](../../src/types.ts#L175-L180) |

## Invariants & Failure Modes

- `ModelBreakdown` and `RecordTotals` both extend `TokenCounts`; `totalTokens` is the sum of the four component counts, never trusted from the wire. — [types.ts:77-94](../../src/types.ts#L77-L94), [store.ts#rollupTotals](../../src/store.ts#L69)
- `UsageData.daily`/`total` are `UsageStats | null` (not optional) so the UI branches on value; `error` is the only optional field. — [types.ts:13-17](../../src/types.ts#L13-L17)
- The **rename**: ccusage's `totalCost` becomes `cost` only in `UsageStats`/`ModelBreakdown`; record-level totals keep `totalCost`. — [types.ts:8-11](../../src/types.ts#L8-L11), [types.ts:92-94](../../src/types.ts#L92-L94)
- `SeriesDataset.tokens` is **parallel to** `data` — same length, same `labels` index; a chart line's cost and token total at index *i* describe the same day. — [types.ts:144-148](../../src/types.ts#L144-L148), [derive.ts](../../src/derive.ts)
- `AppSettings.refreshIntervalMinutes === 0` is the **manual-only** sentinel — no auto-refresh timer is armed. — [types.ts:166-168](../../src/types.ts#L166-L168), [capture-service.ts:117](../../src/capture-service.ts#L117)
- `TrayState.lastUpdatedAt` is `null` until the first *successful* capture; it is the success stamp, not the last *attempt*. — [types.ts:177](../../src/types.ts#L177), [capture-service.ts:227-233](../../src/capture-service.ts#L227-L233)
- `ArchiveManifest.schemaVersion` gates migrations; bump it when any record shape changes. — [types.ts:125-131](../../src/types.ts#L125-L131)

## Extension Points

- To consume more ccusage fields, extend `CcusageModelBreakdown`/`CcusageRow` plus the archive primitives, then the `capture` normalizer. — [types.ts:22-94](../../src/types.ts#L22-L94)
- To add a setting, extend `AppSettings` and `settings.ts`'s sanitize/persist path; thread it into `TrayState` if the tray needs it. — [types.ts:166-180](../../src/types.ts#L166-L180)
- To add a chart dimension or extra per-line metric, extend `SeriesDimension`/`SeriesDataset` and the `derive` builders.

## Documentation Update Rule

Changing any of these types must update this file's tables, [DOMAIN.md](../DOMAIN.md) glossary/ER, and the consuming module docs ([capture](./capture.md), [store](./store.md), [derive](./derive.md), [tray](./tray.md), [capture-service](./capture-service.md)).

## Related Files

- Producers/consumers: [capture.ts](../../src/capture.ts), [store.ts](../../src/store.ts), [derive.ts](../../src/derive.ts), [tray.ts](../../src/tray.ts), [capture-service.ts](../../src/capture-service.ts), [settings.ts](../../src/settings.ts).
- Sibling docs: [capture](./capture.md), [store](./store.md), [derive](./derive.md), [tray](./tray.md), [capture-service](./capture-service.md).
- [DOMAIN.md](../DOMAIN.md) — glossary + ER for these contracts.
