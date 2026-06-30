# Burnbar — Agent Playbook

> Read this first. It routes you to the right doc/file for any task. Code is the source of truth; these docs are a fast index.

## Quick Start

1. [INDEX.md](./INDEX.md) — full doc map.
2. [DOMAIN.md](./DOMAIN.md) — vocabulary, entities, invariants.
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — structure + data flow.
4. The relevant [features/](./features/) or [modules/](./modules/) doc for your task.

## Quick Lookup

| If you need to... | Start here |
|--------------------|------------|
| Understand vocabulary / data shapes | [DOMAIN.md](./DOMAIN.md) |
| See end-to-end data flow | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Change how ccusage is spawned/parsed | [modules/capture.md](./modules/capture.md) → [src/capture.ts](../src/capture.ts) |
| Change capture cadence / quit flush / rollover | [modules/capture-service.md](./modules/capture-service.md) → [src/capture-service.ts](../src/capture-service.ts) |
| Change the archive format / merge rule | [modules/store.md](./modules/store.md) → [src/store.ts](../src/store.ts) + [adr/007](./adr/007-keep-richest-merge.md) |
| Change a dashboard chart / view | [features/usage-dashboard.md](./features/usage-dashboard.md) → [src/derive.ts](../src/derive.ts) + [src/dashboard/](../src/dashboard/) |
| Change the menu-bar title | [features/menu-bar-cost.md](./features/menu-bar-cost.md) → [src/tray.ts](../src/tray.ts) |
| Change the context menu rows / stats card / Refresh Now | [features/usage-menu.md](./features/usage-menu.md) → [src/tray.ts](../src/tray.ts), [src/menu-card-window.ts](../src/menu-card-window.ts), [src/menu-card/](../src/menu-card/) |
| Change refresh cadence / manual mode / persistence | [features/usage-refresh.md](./features/usage-refresh.md) → [src/settings.ts](../src/settings.ts) + [src/capture-service.ts](../src/capture-service.ts) |
| Add/modify shared types | [modules/types.md](./modules/types.md) → [src/types.ts](../src/types.ts) |
| App lifecycle / wiring / quit flush | [modules/main.md](./modules/main.md) → [src/main.ts](../src/main.ts) |
| Window security / IPC / preload | [modules/window.md](./modules/window.md), [modules/ipc.md](./modules/ipc.md), [modules/preload.md](./modules/preload.md) + [adr/008](./adr/008-dashboard-window-bundle.md) |
| Change icons | [modules/icon-pipeline.md](./modules/icon-pipeline.md) → [scripts/generate-icons.mjs](../scripts/generate-icons.mjs) + the SVGs |
| Package / sign / notarize | [modules/packaging.md](./modules/packaging.md), [features/release-distribution.md](./features/release-distribution.md) |
| Know WHY a non-obvious choice was made | [adr/](./adr/) |

## Fresh Repo Tree

Do NOT trust a static listing. Regenerate:

```bash
bash /Users/tangent/.claude/skills/doc-gen/repo-tree.sh /Users/tangent/programming/os/burnbar/src
```

## Run / Build

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Dev (build + launch) | `pnpm dev` |
| Build (`tsc` + renderer bundle → `dist/`) | `pnpm build` |
| Build renderer only (esbuild) | `pnpm build:renderer` |
| Launch built app | `pnpm start` |
| Typecheck (main + dashboard configs) | `pnpm typecheck` |
| Unit tests (Vitest) | `pnpm test` |
| Tests (watch / coverage) | `pnpm test:watch` / `pnpm test:coverage` |
| Lint + format check | `pnpm check` |
| Auto-fix lint + format | `pnpm check:fix` |
| Regenerate icons | `pnpm icon` |
| Package macOS (arm64) | `pnpm dist:mac` |

⚠️ **Launch gotcha:** if you launch from a terminal spawned inside an Electron-based IDE (VSCode, Claude Code host), `ELECTRON_RUN_AS_NODE=1` is inherited and breaks Burnbar's own launch (`electron` resolves to the npm shim → `does not provide an export named 'Menu'`). Launch with the var stripped:

```bash
env -u ELECTRON_RUN_AS_NODE pnpm start
```

This is unrelated to the `ELECTRON_RUN_AS_NODE` that [src/capture.ts](../src/capture.ts#L33-L41) sets for the ccusage child (that one is correct). See [adr/002-electron-run-as-node.md](./adr/002-electron-run-as-node.md). First-ever launch also lazily downloads the Electron 42 binary.

## Conventions

### Directory Structure

| Directory | Purpose | Conventions |
|-----------|---------|-------------|
| `src/` | Main-process TypeScript (ESM) | Local imports use explicit `.js` extensions (Node16). No barrel files. |
| `src/dashboard/` | Browser-context renderer (Chart.js dashboard) | Bundled by **esbuild** (not `tsc`); type-checked via `tsconfig.dashboard.json`. |
| `src/menu-card/` | Browser-context renderer (Canvas 2D stats card) | Bundled by **esbuild** (not `tsc`); type-checked via `tsconfig.dashboard.json`. Painted by the hidden [menu-card-window.ts](../src/menu-card-window.ts). |
| `src/preload.mts` | ESM preload | `.mts` → `dist/preload.mjs` (Electron 42 ESM-preload requirement). |
| `test/` | Vitest unit tests + JSON fixtures | Pure logic only (merge/normalize/derive/atomic IO); ccusage mocked via the injected runner. |
| `scripts/` | Build-time Node scripts (`.mjs`) | ESM; resolve paths via `import.meta.url`. |
| `assets/` | Icon sources + generated PNGs | SVGs are source of truth; PNGs generated, committed. |
| `build/` | Packaging inputs | `entitlements.mac.plist`, `icons/icon.png`. |
| `dist/` | `tsc` + esbuild output | Git-ignored. Includes `dist/dashboard/**`, `dist/menu-card/**`, and `dist/preload.mjs`. |
| `release/` | electron-builder output | Git-ignored. |
| `docs/` | This documentation set | — |

### Naming & Patterns

- ES modules throughout (`"type": "module"`); `fileURLToPath(import.meta.url)` for `__dirname`.
- Local imports MUST carry `.js` extensions even in `.ts` source.
- Comments explain **why**, not what.
- ccusage's `totalCost` is renamed to `cost` only at the tray boundary (`UsageStats`); keep that mapping in [capture.ts](../src/capture.ts). Archive records mirror ccusage field names.
- The ccusage runner is **dependency-injected** into [capture.ts](../src/capture.ts) so capture/normalize is testable without spawning; [store.ts](../src/store.ts) merge and [derive.ts](../src/derive.ts) are **pure**.

### Tooling

- Lint: **oxlint** (`correctness` = error). Format: **oxfmt** (markdown ignored).
- Tests: **Vitest** (node env). Renderer bundle: **esbuild**. Charts: **chart.js** (devDep, bundled).
- Run `pnpm check` after every code change; run `pnpm test` for logic changes.
- Package manager: **pnpm** (pinned via `packageManager`); `save-exact=true`.
- CI lints + typechecks (+ should run `test`). — [.github/workflows/ci.yml](../.github/workflows/ci.yml)

## Change Workflows

### Add a menu row / change displayed data
1. Edit `buildMenuItems` / `addFallbackUsageItems` in [tray.ts](../src/tray.ts); to change what the stats card draws, edit `computeCard` in [capture-service.ts](../src/capture-service.ts) (the derived `MenuCard`) and the canvas drawing in [src/menu-card/card.ts](../src/menu-card/card.ts).
2. If it needs a new figure, extend the `CcusageRow` subset + `toUsageData` in [capture.ts](../src/capture.ts) and the types in [types.ts](../src/types.ts) (`MenuCard`/`MenuCardData` for card figures).
3. `pnpm check && pnpm typecheck` (and `pnpm build:renderer` if you touched the card renderer). Update [features/usage-menu.md](./features/usage-menu.md) + [modules/tray.md](./modules/tray.md).

### Change the archive shape or merge rule
1. Edit the pure merge in [store.ts](../src/store.ts) and the records in [types.ts](../src/types.ts).
2. **Bump `ARCHIVE_SCHEMA_VERSION` and add a migration** if the on-disk shape changes (see [adr/007](./adr/007-keep-richest-merge.md), [boundaries below](#boundaries)).
3. Update/extend the Vitest merge tests; run `pnpm test`. Update [modules/store.md](./modules/store.md) + [DOMAIN.md](./DOMAIN.md).

### Add or change a dashboard view
1. Add the derivation to [derive.ts](../src/derive.ts) (keep it pure; carry `data` + `tokens`) + a test in [test/derive.test.ts](../test/derive.test.ts).
2. Wire it through [ipc.ts](../src/ipc.ts) / [types.ts](../src/types.ts) and render in [src/dashboard/renderer.ts](../src/dashboard/renderer.ts).
3. `pnpm build && pnpm check && pnpm test`. Update [features/usage-dashboard.md](./features/usage-dashboard.md).

### Change the refresh cadence / a setting
1. The cadence lives in [settings.ts](../src/settings.ts) (`refreshIntervalMinutes`, `0` = manual; presets in `REFRESH_PRESETS_MINUTES`); the timer + state push live in [capture-service.ts](../src/capture-service.ts); the submenu in [tray.ts](../src/tray.ts).
2. For a new persisted setting, extend `AppSettings` in [types.ts](../src/types.ts) + [settings.ts](../src/settings.ts), thread it through `main.ts`, and add a `settings.test.ts` case.
3. `pnpm check && pnpm test`. Update [features/usage-refresh.md](./features/usage-refresh.md) + [modules/settings.md](./modules/settings.md).

### Change the ccusage query
1. Edit the args/flags in [capture.ts](../src/capture.ts) (`runDailyReport` / `runSessionReport`).
2. Adjust the `CcusageRow` subset in [types.ts](../src/types.ts) if the shape changes.
3. Update [modules/capture.md](./modules/capture.md); add an ADR if consequential.

### Change icons / Ship a release
- Icons: edit the SVGs, `pnpm icon`, keep the tray asset monochrome.
- Release: bump `version`, `pnpm check && pnpm typecheck && pnpm test`, set signing/notary env vars, `pnpm dist:mac`. See [features/release-distribution.md](./features/release-distribution.md).

## Boundaries

The archive feature has hard rules (from the spec). **Never**: store conversation content or raw logs (numbers only); transmit archive data off-device; modify the source tools' logs; overwrite a richer record with a poorer one. **Ask first**: adding any dependency beyond chart.js/esbuild/vitest (and any native dep); changing the stored schema (bump `schemaVersion` + migration); changing tray click behavior or the displayed numbers. See [ADR-006](./adr/006-durable-usage-archive.md) / [ADR-007](./adr/007-keep-richest-merge.md).

## Documentation Update Rules

| When you change... | Update... |
|---------------------|-----------|
| A domain type / record ([types.ts](../src/types.ts)) | [DOMAIN.md](./DOMAIN.md) glossary + ER, [modules/types.md](./modules/types.md), consuming module docs |
| A module's public surface | That [modules/*.md](./modules/) |
| Merge / capture / derive behavior | [modules/store.md](./modules/store.md) / [capture-service.md](./modules/capture-service.md) / [derive.md](./modules/derive.md) |
| User-visible behavior | The relevant [features/*.md](./features/) + [functional-spec/PRODUCT.md](./functional-spec/PRODUCT.md) |
| File/folder structure | The Conventions table above (and re-run `repo-tree.sh`) |
| A consequential design decision | A new/updated [adr/*.md](./adr/) |
| Packaging/signing behavior | [modules/packaging.md](./modules/packaging.md), [features/release-distribution.md](./features/release-distribution.md) |

## Context-Minimizing Guidance

- **Behavior bug in the menu/title:** [modules/tray.md](./modules/tray.md) → [src/tray.ts](../src/tray.ts).
- **Wrong/missing numbers:** [modules/capture.md](./modules/capture.md) + [modules/capture-service.md](./modules/capture-service.md).
- **Archive not filling / shrinking / corrupt:** [modules/store.md](./modules/store.md) → [src/store.ts](../src/store.ts) + [adr/007](./adr/007-keep-richest-merge.md).
- **Dashboard wrong/blank:** [modules/derive.md](./modules/derive.md) → [src/derive.ts](../src/derive.ts), then [modules/ipc.md](./modules/ipc.md) / [modules/window.md](./modules/window.md).
- **Build/ship issue:** [modules/packaging.md](./modules/packaging.md) + [features/release-distribution.md](./features/release-distribution.md).
- **"Why is it done this way?":** [adr/](./adr/) before changing anything.
