# ADR-001: Consume ccusage via its CLI, not as a library

## Status

Accepted

## Context

Earlier versions imported ccusage as an ES module (`loadDailyUsageData`, `calculateTotals`, `createTotalsObject`). ccusage 20.x ships **as a CLI only** — it no longer exposes those library entry points. Burnbar pins `ccusage@20.0.14`. — [package.json:36](../../package.json#L36), [usage.ts:8-9](../../src/usage.ts#L8-L9)

## Decision

Invoke the bundled ccusage CLI (`ccusage daily --json --mode calculate`) with `execFile`, resolving its entry via `require.resolve("ccusage/src/cli.js")`, and `JSON.parse` its stdout into a typed subset (`CcusageDailyReport`). — [usage.ts:14-27](../../src/usage.ts#L14-L27)

## Consequences

- (+) Works with current ccusage; no dependency on removed library exports.
- (+) Process isolation — a ccusage crash can't take down the app.
- (−) Output is an untyped JSON contract asserted via `as` (no compile-time guarantee). — [usage.ts:26](../../src/usage.ts#L26)
- (−) Spawn cost + 64 MiB stdout buffer cap per refresh. — [usage.ts:23](../../src/usage.ts#L23)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Library imports | ccusage 20.x removed them. |
| Pin to an old ccusage with library API | Stale pricing/log-format support; security/maintenance debt. |
| Reimplement log parsing | Duplicates ccusage's per-model pricing; high maintenance. |
