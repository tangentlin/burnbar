# Module: derive

## Purpose

Pure read-time projection: turns archive records ([`DailyRecord[]`](../../src/types.ts#L100-L108), [`SessionRecord[]`](../../src/types.ts#L114-L122)) into a chart-ready [`DashboardSeries`](../../src/types.ts#L150-L156) over a continuous, zero-filled daily axis. Data in → data out, no IO.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `deriveSeries()` | `(daily, sessions, options) => DashboardSeries` | [derive.ts:125](../../src/derive.ts#L125) |

`options` is `{ range, dimension, timezone, today }`. The axis/window helpers (`shiftDate`, `rangeStart`, `dateAxis`, `sessionLocalDate`) and the three per-dimension builders (`costByDate`, `costByModel`, `costByAgent`) are module-private. — [derive.ts:21-123](../../src/derive.ts#L21-L123)

## Responsibilities

- Build the date window: fixed `RANGE_DAYS` for `30d`/`90d`, or anchor `all` to the earliest source date. — [derive.ts:16-38](../../src/derive.ts#L16-L38)
- Emit a **continuous** ascending `YYYY-MM-DD` axis from `start` to `today` (no gaps). — [derive.ts:40-46](../../src/derive.ts#L40-L46)
- Dispatch on `dimension`: `none` → single "Cost" line, `model` → one stacked dataset per model, `agent` → one per agent. — [derive.ts:143-150](../../src/derive.ts#L143-L150)
- Carry, on every dataset, parallel `data` (cost) **and** `tokens` arrays for the tooltip — sourced per dimension (day, per-model, or summed-session), never from a single shared total. — [derive.ts:57-122](../../src/derive.ts#L57-L122)
- Bucket each session to its **local last-activity day** for the by-agent view (the documented approximation). — [derive.ts:87-122](../../src/derive.ts#L87-L122)
- Zero-fill every axis index with no data, so stacked datasets stay index-aligned. — [derive.ts:61-62,81-82,120-121](../../src/derive.ts#L61-L62)
- Sum `totalCost` across the visible datasets. — [derive.ts:152-155](../../src/derive.ts#L152-L155)

## Non-Goals

- No persistence or capture — it reads what [store](../../src/store.ts) already merged.
- No formatting, colors, or chart config — that is the renderer's job ([dashboard](../../src/dashboard.ts)).
- Not authoritative for by-agent daily totals — see the approximation below and [adr/007](../adr/007-keep-richest-merge.md).

## How It Works

Date math is done by **UTC shift on the `YYYY-MM-DD` string** (`shiftDate`), which is tz-agnostic and calendar-correct, so DST never skews the axis. — [derive.ts:21-29](../../src/derive.ts#L21-L29)

`deriveSeries` first picks the `sourceDates` that anchor an `all` window — session local days for the `agent` dimension, else daily `record.date` — then computes `start`, the axis `labels`, and an `inRange` set, and dispatches to the matching builder. Each builder returns datasets whose `data` is cost and whose parallel `tokens` is total tokens at the same index: `costByDate` reads the day's `totals`, `costByModel` reads each model's per-model `cost`/`totalTokens` line, and `costByAgent` sums each agent's session `totals`. — [derive.ts:125-150](../../src/derive.ts#L125-L150)

```mermaid
flowchart LR
    A[daily + sessions] --> B[rangeStart]
    B --> C[dateAxis → labels]
    C --> D{dimension}
    D -->|none| E[costByDate]
    D -->|model| F[costByModel]
    D -->|agent| G[costByAgent]
    E & F & G --> H[DashboardSeries]
```

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `DailyRecord` | Authoritative per-day source (cost-over-time, by-model) | [types.ts:100-108](../../src/types.ts#L100-L108) |
| `SessionRecord` | Per-session source (by-agent) | [types.ts:114-122](../../src/types.ts#L114-L122) |
| `SeriesRange` / `SeriesDimension` | Window + breakdown selectors | [types.ts:135-136](../../src/types.ts#L135-L136) |
| `SeriesDataset` | One stacked line: `{ label, data[], tokens[] }`, both aligned to `labels` | [types.ts:143-148](../../src/types.ts#L143-L148) |
| `DashboardSeries` | The returned chart payload | [types.ts:150-156](../../src/types.ts#L150-L156) |

## Invariants & Failure Modes

- **Aligned datasets**: `data` and `tokens` each have exactly `labels.length` entries; gaps are `0`, never `undefined`, so the renderer can zip cost and tokens by index. — [derive.ts:61-62,120-121](../../src/derive.ts#L61-L62)
- **Tokens track the dimension**: `none` uses the day `totals.totalTokens`, `model` uses each model line's `totalTokens`, `agent` sums each session's `totals.totalTokens` — never a day-level total stand-in for a per-line value. — [derive.ts:62,82,116](../../src/derive.ts#L62)
- **Continuous axis**: `labels` is strictly ascending with no missing days; `all` never starts after `today`. — [derive.ts:36-46](../../src/derive.ts#L36-L46)
- **Invalid timestamps are skipped**, not crashed: a session whose `lastActivity` fails `Date` parsing returns `null` from `sessionLocalDate` and is dropped from both `sourceDates` and the by-agent buckets. — [derive.ts:48-55,111](../../src/derive.ts#L48-L55)
- **By-agent approximation (load-bearing)**: a session is attributed *wholly* to its last-activity local day, so by-agent daily totals can drift slightly from the authoritative daily totals near day boundaries. This is intentional — by-model/cost-over-time stay authoritative. — [derive.ts:93-95](../../src/derive.ts#L93-L95), [adr/007](../adr/007-keep-richest-merge.md)
- Model and agent labels are **sorted** for stable stacking order. — [derive.ts:73-75,118](../../src/derive.ts#L73-L75)

## Extension Points

- **New breakdown dimension**: add a `SeriesDimension` value, a `costBy…` builder returning `SeriesDataset[]` (populating both `data` and `tokens`), and a branch in `deriveSeries`. — [derive.ts:143-150](../../src/derive.ts#L143-L150)
- **New range**: add to `SeriesRange` + `RANGE_DAYS` (or special-case in `rangeStart`). — [derive.ts:16-38](../../src/derive.ts#L16-L38)
- **More per-point detail** in the tooltip: add a parallel array to `SeriesDataset` and populate it in each builder alongside `data`/`tokens`. — [types.ts:143-148](../../src/types.ts#L143-L148)

## Related Files

- [types.ts](../../src/types.ts) — the source and series contracts ([types doc](./types.md)).
- [time.ts](../../src/time.ts) — `localDateString`, the tz day-bucketing primitive.
- [store.ts](../../src/store.ts) — produces the merged records this module reads.
- [usage-dashboard.md](../features/usage-dashboard.md) — the feature this powers; [usage-archive.md](../features/usage-archive.md) — the upstream archive.
- [adr/007-keep-richest-merge.md](../adr/007-keep-richest-merge.md) — the by-agent approximation rationale; [adr/006-durable-usage-archive.md](../adr/006-durable-usage-archive.md), [adr/008-dashboard-window-bundle.md](../adr/008-dashboard-window-bundle.md).
