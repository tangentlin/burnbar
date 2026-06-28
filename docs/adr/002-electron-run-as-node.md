# ADR-002: Run ccusage through the app's own runtime via ELECTRON_RUN_AS_NODE

## Status

Accepted

## Context

The ccusage CLI needs a Node runtime. Requiring users to have `node` (and `ccusage`) on `PATH` would break the "self-contained app" goal, and a packaged Electron app can't assume a system Node exists. — [usage.ts:8-13](../../src/usage.ts#L8-L13)

## Decision

Spawn ccusage using `process.execPath` (the current runtime — Electron in production, Node in tests) with `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary behave as plain Node. No external `node`/`ccusage` is needed. — [usage.ts:18-25](../../src/usage.ts#L18-L25)

## Consequences

- (+) Fully self-contained; ships with everything it needs.
- (+) Same code path works under Node (tests) and Electron (production).
- (−) **Launch gotcha**: if `ELECTRON_RUN_AS_NODE` is *inherited* (e.g. a terminal spawned inside an Electron-based IDE), Burnbar's *own* launch breaks — `electron` resolves to the shim, not the module. Mitigation: launch with `env -u ELECTRON_RUN_AS_NODE`. The var Burnbar sets here is scoped to the child and is unrelated/correct. — [usage.ts:9-13](../../src/usage.ts#L9-L13)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Require system `node` on PATH | Breaks self-containment; fragile across user setups. |
| Bundle a separate Node binary | Larger artifact; duplicates the runtime Electron already provides. |
| In-process import of ccusage | Not possible — see [ADR-001](./001-ccusage-cli-shell-out.md). |
