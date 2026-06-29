# ADR-001: Consume ccusage via its CLI, not as a library

## Status

Accepted

## Context

Earlier versions imported ccusage as an ES module (`loadDailyUsageData`, `calculateTotals`, `createTotalsObject`). ccusage 20.x ships **as a CLI only** — it no longer exposes those library entry points. Burnbar pins `ccusage@20.0.14`. — [package.json:40](../../package.json#L40), [capture.ts:17-30](../../src/capture.ts#L17-L30)

## Decision

Invoke the bundled ccusage CLI (`ccusage daily --json --mode calculate -z <tz>`, plus `session` for per-agent detail) with `execFile`, resolving its entry via `require.resolve("ccusage/src/cli.js")`, and `JSON.parse` its stdout into typed subsets. The spawn is wrapped in a dependency-injected runner so capture/normalize is testable without a process. — [capture.ts:31-83](../../src/capture.ts#L31-L83)

## Consequences

- (+) Works with current ccusage; no dependency on removed library exports.
- (+) Process isolation — a ccusage crash can't take down the app.
- (−) Output is an untyped JSON contract asserted via `as` (no compile-time guarantee). — [capture.ts:52-58](../../src/capture.ts#L52-L58)
- (−) Spawn cost + 256 MiB stdout buffer cap per refresh. — [capture.ts:33-41](../../src/capture.ts#L33-L41)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Library imports | ccusage 20.x removed them. |
| Pin to an old ccusage with library API | Stale pricing/log-format support; security/maintenance debt. |
| Reimplement log parsing | Duplicates ccusage's per-model pricing; high maintenance. |
