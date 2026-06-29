# ADR-003: One CLI call; derive "today" from the daily report

## Status

Accepted

## Context

Burnbar shows both today's usage and all-time totals. ccusage's `daily --json` already returns every day's entry **and** grand `totals` in one response, and the same call now also feeds the durable archive. — [types.ts#CcusageDailyReport](../../src/types.ts#L63-L67), [ADR-006](./006-durable-usage-archive.md)

## Decision

Make a single ccusage `daily` call per refresh. Read all-time from `report.totals`; derive today by finding the `daily[]` entry whose `period` equals the current local date. — [capture.ts#toUsageData](../../src/capture.ts#L124)

## Consequences

- (+) Half the spawns vs. a separate "today" query; lower latency and CPU per refresh.
- (+) Today and all-time are always from the same snapshot (internally consistent), and that snapshot also drives the archive — no duplicate fetch.
- (+) The earlier **UTC date-skew** pitfall is gone: "today" is now computed in the pinned IANA tz via `localDateString`, matching ccusage's `-z` buckets. — [time.ts#localDateString](../../src/time.ts#L11), [ADR-006](./006-durable-usage-archive.md)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Two calls (today with `--since`, plus all-time) | Doubles spawns for data already present in one report. |
| Cache report across refreshes | Adds state/invalidation complexity; refresh is already cheap. |
