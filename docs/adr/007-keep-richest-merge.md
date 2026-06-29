# ADR-007: "Keep richest, never shrink" merge

## Status

Accepted

## Context

The archive ([ADR-006](./006-durable-usage-archive.md)) is fed by repeated ccusage snapshots. A later snapshot can legitimately report **fewer** tokens than an earlier one — because the source tool purged some history between captures. Persisting that smaller number would erase data the archive had already secured, defeating the whole point. We also need backfill (a full-range capture seeding an empty store) to be the *same* operation as an incremental update, not a special case.

## Decision

Merge every record and every per-model line by a single rule (the pure functions in [store.ts](../../src/store.ts)):

1. For each token field, keep `max(existing, incoming)` — a purge can never reduce a stored count.
2. A model's `cost` follows the snapshot with the larger token total; ties break to the later capture (prices can change retroactively, but counts are ground truth).
3. Record totals are always the rollup of the merged model lines (`totals = Σ models`).
4. `firstCapturedAt` is preserved; `lastCapturedAt` advances. New date / model / session keys are added; existing ones are merged, never replaced wholesale.

Because the rule is monotonic, a full-range backfill merged under it simply fills gaps — no special-casing. The store writes only when this merge changes a record's numbers (the dirty check), so the 60s tick is a no-op on quiet days.

## Consequences

- (+) A source purge can never shrink or erase archived history (the core anti-purge guarantee).
- (+) Backfill and incremental update are one code path; re-running is idempotent.
- (+) Pure (data-in → data-out), so the guarantee is exhaustively unit-tested without IO — see [test/store.merge.test.ts](../../test/store.merge.test.ts).
- (−) Per-field `max()` can, in pathological cases, combine fields from two different snapshots; cost then follows whichever snapshot had the larger total. Acceptable: a model's fields move together in practice, and the rule never loses counts.
- (−) The by-agent view derives from sessions bucketed to their last-activity local day, so it can drift slightly from the authoritative daily totals near day boundaries (documented approximation).

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Last-write-wins | A purge would shrink/erase the archive — exactly what we must prevent. |
| Sum every snapshot | Double-counts overlapping captures; ccusage already reports cumulative period totals. |
| Normalize per-agent subcommands | `ccusage codex daily` uses `costUSD` + a `models` object while `claude` uses `totalCost` + `modelBreakdowns[]`; normalizing across agents/versions is fragile. We derive per-agent figures from the consistent top-level `session` stream instead. |
