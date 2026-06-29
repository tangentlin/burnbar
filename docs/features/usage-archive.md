# Feature: Durable Usage Archive

## User Story

As a Claude Code / Codex / agent-CLI user, I want my token-usage history preserved on my machine even after the source tools purge their logs, so I never permanently lose the record of what I spent.

## Scope

**Includes:** opportunistic capture of ccusage's numeric usage (per-day combined totals + per-model breakdown; per-session, per-agent breakdown) into a local archive under `userData`; first-run backfill of everything the logs still hold; a merge that never shrinks on a source purge.
**Excludes:** any prompt/response **content** or raw JSONL; cloud sync; off-device transmission; changes to the menu-bar numbers (see [menu-bar-cost](./menu-bar-cost.md)).

## How It Works

The `CaptureService` owns the one ccusage `daily` call the tray already made every 60s, and additionally runs `session` at launch, on local-day rollover, and on quit. Each report is normalized to archive records and merged into the store under the **keep-richest** rule, so a later purge can never reduce stored counts. Writes are atomic (temp-then-rename) and happen only when a day's numbers change. — [capture-service.ts](../../src/capture-service.ts), [capture.ts](../../src/capture.ts), [store.ts](../../src/store.ts)

```
<userData>/archive/
├── manifest.json          # schemaVersion, timezone, ccusageVersion, first/last capture
├── daily/<YYYY-MM-DD>.json # combined totals + per-model breakdown, all agents
└── sessions/<YYYY-MM>.json # { [sessionId]: record }, sharded by last-activity month
```

## Acceptance Criteria

- [ ] First launch backfills every day the source logs still hold (no `since` filter). — [capture-service.ts#start](../../src/capture-service.ts)
- [ ] A later capture with fewer tokens never shrinks a stored record. — [store.ts#mergeDailyRecord](../../src/store.ts), [ADR-007](../adr/007-keep-richest-merge.md)
- [ ] Captures store **numbers only** — never conversation content or raw logs. — [capture.ts](../../src/capture.ts)
- [ ] Nothing is transmitted off-device; the archive lives only under `userData`. — [main.ts](../../src/main.ts)
- [ ] Writes are atomic and survive a crash/force-quit mid-write. — [store.ts#atomicWriteJson](../../src/store.ts)
- [ ] A ccusage failure leaves the archive untouched and never crashes the tray. — [capture-service.ts](../../src/capture-service.ts)
- [ ] The timezone is pinned to the system IANA tz, passed to ccusage (`-z`), and recorded in the manifest. — [time.ts](../../src/time.ts), [store.ts#updateManifest](../../src/store.ts)

## Data Model (Conceptual)

`DailyRecord`, `SessionRecord`, `ArchiveManifest` — see [DOMAIN.md](../DOMAIN.md) and [modules/types.md](../modules/types.md).

## Known Pitfalls

- Backfill can only reach what the source tools have **not** already purged before Burnbar's first run — earlier history is unrecoverable, which is why capturing early matters.
- Session shards are keyed by UTC last-activity month (storage only); the by-agent **view** buckets by local last-activity day — a deliberate, documented approximation. — [ADR-007](../adr/007-keep-richest-merge.md)

## Code Touchpoints

| Concern | File |
|---------|------|
| Capture orchestration (cadence, rollover, quit flush) | [capture-service.ts](../../src/capture-service.ts) |
| ccusage spawn + normalize | [capture.ts](../../src/capture.ts) |
| Merge + atomic IO + manifest | [store.ts](../../src/store.ts) |
| Timezone pinning | [time.ts](../../src/time.ts) |
| Archive location wiring | [main.ts](../../src/main.ts) |

## Related

- [ADR-006](../adr/006-durable-usage-archive.md) (why an archive), [ADR-007](../adr/007-keep-richest-merge.md) (merge rule).
- [usage-dashboard](./usage-dashboard.md) — the view this archive makes possible.
