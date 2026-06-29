# Module: time

## Purpose

Four tiny, dependency-free helpers (no imports beyond `Intl`/`Date`): two timezone functions that pin local day buckets to ccusage's `-z`, plus two display formatters for the tray's last-updated stamp and auto-refresh interval labels. Extracted so read-time logic and the tray render without dragging in the ccusage runner — and so all four stay trivially unit-tested.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `systemTimezone()` | `() => string` | [time.ts:6](../../src/time.ts#L6) |
| `localDateString(tz, date?)` | `(string, Date?) => string` | [time.ts:11](../../src/time.ts#L11) |
| `formatRelativeTime(iso, now?)` | `(string \| null, Date?) => string` | [time.ts:23](../../src/time.ts#L23) |
| `formatIntervalLabel(minutes)` | `(number) => string` | [time.ts:47](../../src/time.ts#L47) |

No module-private helpers; the file is four pure functions built only on `Intl`/`Date`.

## Responsibilities

- Resolve the host's IANA timezone (e.g. `"America/New_York"`), falling back to `"UTC"`. — [time.ts:6-8](../../src/time.ts#L6-L8)
- Format an instant to its local `YYYY-MM-DD` in a given tz, matching ccusage's `-z` day buckets. — [time.ts:11-20](../../src/time.ts#L11-L20)
- Render a friendly relative stamp (`never` / `just now` / `N minutes/hours/days ago`) for the menu's last-updated line. — [time.ts:23-44](../../src/time.ts#L23-L44)
- Label a refresh interval in minutes as `Manual` (0) / `N min` / `N hours` for the auto-refresh submenu. — [time.ts:47-56](../../src/time.ts#L47-L56)

## Non-Goals

- No tz storage or pinning policy — callers (`main`, `capture-service`) own when a tz is captured and passed to ccusage.
- No ccusage knowledge or process spawning — that lives in [capture](./capture.md).
- No menu construction — the tray decides *where* these strings render (`Updated …`, `Auto-Refresh: …`); these functions only produce the text. — [tray.ts:150](../../src/tray.ts#L150), [tray.ts:185](../../src/tray.ts#L185)
- No cost/token formatting — dollar and `toLocaleString` strings live in [tray](./tray.md).

## How It Works

`systemTimezone()` reads `Intl.DateTimeFormat().resolvedOptions().timeZone`. `localDateString()` uses the `en-CA` locale (whose default date format *is* `YYYY-MM-DD`) with an explicit `timeZone`, then reassembles the `year`/`month`/`day` parts via `formatToParts` rather than trusting the joined string. — [time.ts:11-20](../../src/time.ts#L11-L20)

`formatRelativeTime` works in whole seconds from `now - iso`, snapping anything under 45s (and any negative/future delta) to `"just now"`, then rounding through minute/hour/day thresholds with singular/plural agreement; a `null` stamp is `"never"`. `formatIntervalLabel` mirrors that shape for durations: `0` (or less) is `"Manual"`, sub-hour is `"N min"`, and whole-hour multiples render as `"N hour(s)"` — a non-integer hour count falls back to minutes. Both take their reference (`now` / default `new Date()`) as a parameter so tests pin time. — [time.ts:23-56](../../src/time.ts#L23-L56)

## Key Types

No module-owned types — all four functions traffic in `string`/`number`/`Date`. The tz string flows into [capture](./capture.md) (as ccusage's `-z` argument) and the date string into [derive](./derive.md) when matching today's bucket; the two formatters' outputs flow only into [tray](./tray.md) menu labels.

## Invariants & Failure Modes

- **Bucket parity is load-bearing**: `localDateString` must agree with ccusage's `-z` bucketing, or derived "today" will mismatch the archived day. — [time.ts:10](../../src/time.ts#L10)
- `systemTimezone()` always returns a non-empty string — `|| "UTC"` covers the (rare) empty/undefined `timeZone`. — [time.ts:7](../../src/time.ts#L7)
- All four are pure functions of their inputs (time injected via `date`/`now` defaults), so each input maps to one output and tests are deterministic. — [time.ts:11](../../src/time.ts#L11), [time.ts:23](../../src/time.ts#L23)
- An invalid `tz` makes the underlying `Intl.DateTimeFormat` **throw** a `RangeError`; this is unguarded by design, since the only tz source is `systemTimezone()`. — [time.ts:12-17](../../src/time.ts#L12-L17)
- `formatRelativeTime` clamps clock skew: a stamp in the future (negative delta) reads `"just now"` rather than a negative count. — [time.ts:28-30](../../src/time.ts#L28-L30)
- `formatIntervalLabel` only emits `"N hours"` for exact multiples of 60; any fractional hour degrades to `"N min"` so labels never show `1.5 hours`. — [time.ts:54-55](../../src/time.ts#L54-L55)

## Extension Points

- Need a different granularity (e.g. local week/month bucket)? Add a sibling helper here so derive/tests stay free of the ccusage runner.
- To override the tz globally (testing, fixed-zone deployments), thread a tz down from the call site rather than changing `systemTimezone()`.
- New tray label shapes (different units, abbreviations) belong here next to `formatIntervalLabel`/`formatRelativeTime`, not inlined in `tray.ts`.

## Related Files

- [time.ts](../../src/time.ts) — the source; [test/time.test.ts](../../test/time.test.ts) — covers all four functions.
- Date/tz consumers: [main.ts](../../src/main.ts), [capture-service.ts](../../src/capture-service.ts), [derive.ts](../../src/derive.ts), [ipc.ts](../../src/ipc.ts) — see [capture-service.md](./capture-service.md), [derive.md](./derive.md), [ipc.md](./ipc.md).
- Formatter consumer: [tray.ts](../../src/tray.ts) — see [tray.md](./tray.md).
- [capture.md](./capture.md) — where the tz becomes ccusage's `-z` argument.
