# ADR-006: Durable usage archive in `userData`

## Status

Accepted

## Context

Claude Code, Codex, and other agent CLIs purge their local usage logs over time. ccusage can only report what those logs still contain, so once a tool prunes history it is gone forever and cannot be regenerated. Burnbar previously read ccusage live on every menu refresh and kept nothing — every purge silently erased history Burnbar had already seen.

## Decision

Persist a durable archive the source tools cannot reach, under `app.getPath("userData")/archive`, captured opportunistically from the same ccusage call the tray already makes. The archive stores **numbers only** — per-day combined totals + per-model breakdown (`daily/<date>.json`) and per-session, per-agent breakdown (`sessions/<month>.json`) — never prompt/response content or raw JSONL. A `manifest.json` records `schemaVersion`, the pinned timezone, and the observed ccusage version. See [store.ts](../../src/store.ts), [capture-service.ts](../../src/capture-service.ts).

## Consequences

- (+) Burnbar becomes the system of record for agent usage on the machine; history survives source purges.
- (+) Captures piggyback the existing tray refresh (then a configurable interval, default 15 min) and a quit flush — no extra ccusage spawns on the hot path; sessions captured at lower frequency (launch / day-rollover / quit).
- (+) Numbers-only + `userData`-only + no network keeps the privacy posture identical to before (nothing leaves the machine).
- (−) First run can only reach back as far as the source logs still hold — anything pruned before Burnbar's first launch is already unrecoverable. Mitigation: capture early and often.
- (−) Adds a persistence layer (atomic IO, sharding, a manifest/migration story) the tray-only app did not previously have.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Copy raw JSONL conversation logs | Privacy + scope blowup; we need figures, not content. |
| Single growing JSON file | Rewrites the whole history every change; poor crash-safety. Per-day/per-month shards localize writes. |
| SQLite or another embedded DB | A native dependency complicates macOS notarization for a few hundred small records. |
| Per-agent ccusage subcommands | They emit inconsistent schemas across agents; the normalized top-level `daily`/`session` commands do not — see [ADR-007](./007-keep-richest-merge.md). |
