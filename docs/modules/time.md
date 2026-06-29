# Module: time

## Purpose

Two tiny, dependency-free timezone helpers shared by capture, derivation, and IPC. Extracted so read-time logic and its tests can compute local day buckets without importing the ccusage runner.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `systemTimezone()` | `() => string` | [time.ts:6](../../src/time.ts#L6) |
| `localDateString(tz, date?)` | `(string, Date?) => string` | [time.ts:11](../../src/time.ts#L11) |

No module-private helpers; the file is two pure functions built only on `Intl`.

## Responsibilities

- Resolve the host's IANA timezone (e.g. `"America/New_York"`), falling back to `"UTC"`. — [time.ts:6-8](../../src/time.ts#L6-L8)
- Format an instant to its local `YYYY-MM-DD` in a given tz, matching ccusage's `-z` day buckets. — [time.ts:11-20](../../src/time.ts#L11-L20)

## Non-Goals

- No times, durations, or formatting beyond the date bucket — display strings live in [tray](./tray.md).
- No tz storage or pinning policy — callers (`main`, `capture-service`) own when a tz is captured and passed to ccusage.
- No ccusage knowledge or process spawning — that lives in [capture](./capture.md).

## How It Works

`systemTimezone()` reads `Intl.DateTimeFormat().resolvedOptions().timeZone`. `localDateString()` uses the `en-CA` locale (whose default date format *is* `YYYY-MM-DD`) with an explicit `timeZone`, then reassembles the `year`/`month`/`day` parts via `formatToParts` rather than trusting the joined string. — [time.ts:11-20](../../src/time.ts#L11-L20)

## Key Types

No module-owned types — both functions traffic in `string`/`Date`. The tz string flows into [capture](./capture.md) (as ccusage's `-z` argument) and the date string into [derive](./derive.md) when matching today's bucket.

## Invariants & Failure Modes

- `systemTimezone()` always returns a non-empty string — `|| "UTC"` covers the (rare) empty/undefined `timeZone`. — [time.ts:7](../../src/time.ts#L7)
- `localDateString()` is a pure function of `(tz, date)` — same inputs always yield the same bucket; no `Date.now()` capture except the default-arg `new Date()`. — [time.ts:11](../../src/time.ts#L11)
- An invalid `tz` makes the underlying `Intl.DateTimeFormat` **throw** a `RangeError`; this is unguarded by design, since the only tz source is `systemTimezone()`. — [time.ts:12-17](../../src/time.ts#L12-L17)
- **Bucket parity is load-bearing**: this must agree with ccusage's `-z` bucketing, or derived "today" will mismatch the archived day. — [time.ts:10](../../src/time.ts#L10)

## Extension Points

- Need a different granularity (e.g. local week/month bucket)? Add a sibling helper here so derive/tests stay free of the ccusage runner.
- To override the tz globally (testing, fixed-zone deployments), thread a tz down from the call site rather than changing `systemTimezone()`.

## Related Files

- [time.ts](../../src/time.ts) — the source.
- Consumers: [main.ts](../../src/main.ts), [capture-service.ts](../../src/capture-service.ts), [derive.ts](../../src/derive.ts), [ipc.ts](../../src/ipc.ts) — see [capture-service.md](./capture-service.md), [derive.md](./derive.md), [ipc.md](./ipc.md).
- [capture.md](./capture.md) — where the tz becomes ccusage's `-z` argument.
