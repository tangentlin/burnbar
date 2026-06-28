# Module: usage

## Purpose

The only data-ingestion module: spawns the bundled ccusage CLI, parses its JSON, and maps it to the `UsageData` the tray renders.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `getUserUsage()` | `() => Promise<UsageData>` | [usage.ts:29](../../src/usage.ts#L29) |

`loadDailyReport()` is module-private. — [usage.ts:17-27](../../src/usage.ts#L17-L27)

## Responsibilities

- Resolve the ccusage CLI entry via `createRequire(...).resolve("ccusage/src/cli.js")`. — [usage.ts:14-15](../../src/usage.ts#L14-L15)
- Spawn it through the current runtime (`process.execPath`) with `ELECTRON_RUN_AS_NODE=1`. — [usage.ts:18-25](../../src/usage.ts#L18-L25)
- Parse the JSON into `CcusageDailyReport`. — [usage.ts:26](../../src/usage.ts#L26)
- Derive today (local ISO date) from `daily[]` and read grand `totals`. — [usage.ts:33-45](../../src/usage.ts#L33-L45)
- Convert any failure into `UsageData.error`. — [usage.ts:46-53](../../src/usage.ts#L46-L53)

## Non-Goals

- No formatting (dollar strings, `toLocaleString`) — that lives in [tray](./tray.md).
- No caching/persistence — every call is a fresh spawn.

## How It Works

`loadDailyReport()` runs `<runtime> <ccusage cli> daily --json --mode calculate` with `ELECTRON_RUN_AS_NODE=1` and a 64 MiB stdout buffer, then `JSON.parse`s stdout. `getUserUsage()` finds the `daily[]` entry whose `period` equals today's `YYYY-MM-DD`, and returns `{daily, total}` (or `{daily:null,total:null,error}` on throw). — [usage.ts:17-54](../../src/usage.ts#L17-L54)

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `CcusageDailyReport` | Parsed CLI output (consumed subset) | [types.ts#CcusageDailyReport](../../src/types.ts#L17-L27) |
| `UsageData` | Mapped result for the tray | [types.ts#UsageData](../../src/types.ts#L6-L10) |

## Invariants & Failure Modes

- Returns a `UsageData` in **all** paths — never throws to the caller. — [usage.ts:46-53](../../src/usage.ts#L46-L53)
- `daily` is `null` when no entry matches today. — [usage.ts:38-40](../../src/usage.ts#L38-L40)
- Backend-agnostic via `--mode calculate` (prices from local logs). — [usage.ts:11-13](../../src/usage.ts#L11-L13)
- **UTC date skew** [inferred]: `period` uses `toISOString()` (UTC), so "today" may differ from the user's local day near midnight. — [usage.ts:34](../../src/usage.ts#L34)
- **Launch gotcha**: `ELECTRON_RUN_AS_NODE` here is intentional and scoped to the child; an *inherited* one (e.g. IDE terminals) breaks Burnbar's own launch — see [AGENTS.md](../AGENTS.md#run--build).

## Extension Points

- To consume more ccusage fields (e.g. input/output token split), extend `CcusageDailyReport` and the mapping. — [usage.ts:36-45](../../src/usage.ts#L36-L45)
- To change the ccusage subcommand/flags, edit the args array. — [usage.ts:19-20](../../src/usage.ts#L19-L20)

## Related Files

- [types.ts](../../src/types.ts) — the contract types.
- See [adr/001-ccusage-cli-shell-out.md](../adr/001-ccusage-cli-shell-out.md), [adr/002-electron-run-as-node.md](../adr/002-electron-run-as-node.md), [adr/003-single-call-derive-today.md](../adr/003-single-call-derive-today.md) for the rationale.
