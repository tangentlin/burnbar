# ADR-003: One CLI call; derive "today" from the daily report

## Status

Accepted

## Context

Burnbar shows both today's usage and all-time totals. ccusage's `daily --json` already returns every day's entry **and** grand `totals` in one response. — [types.ts:17-27](../../src/types.ts#L17-L27)

## Decision

Make a single ccusage call per refresh. Read all-time from `report.totals`; derive today by finding the `daily[]` entry whose `period` equals the current local ISO date. — [usage.ts:31-45](../../src/usage.ts#L31-L45)

## Consequences

- (+) Half the spawns vs. a separate "today" query; lower latency and CPU per refresh.
- (+) Today and all-time are always from the same snapshot (internally consistent).
- (−) "Today" is matched on a UTC-derived date string (`toISOString().slice(0,10)`), so it can disagree with the user's local day near midnight. [inferred] — [usage.ts:34](../../src/usage.ts#L34)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Two calls (today with `--since`, plus all-time) | Doubles spawns for data already present in one report. |
| Cache report across refreshes | Adds state/invalidation complexity; refresh is already cheap. |
