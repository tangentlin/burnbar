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
| Change the stats card's animations (odometer roll / bar growth / embers) | [modules/menu-card.md](./modules/menu-card.md), [modules/card-animator.md](./modules/card-animator.md) → [src/menu-card/animation.ts](../src/menu-card/animation.ts), [src/menu-card/animation-config.ts](../src/menu-card/animation-config.ts), [src/card-animator.ts](../src/card-animator.ts) + [adr/013](./adr/013-menu-card-animation-framework.md) |
| Change refresh cadence / manual mode / persistence | [features/usage-refresh.md](./features/usage-refresh.md) → [src/settings.ts](../src/settings.ts) + [src/capture-service.ts](../src/capture-service.ts) |
| Add/modify shared types | [modules/types.md](./modules/types.md) → [src/types.ts](../src/types.ts) |
| App lifecycle / wiring / quit flush | [modules/main.md](./modules/main.md) → [src/main.ts](../src/main.ts) |
| Window security / IPC / preload | [modules/window.md](./modules/window.md), [modules/ipc.md](./modules/ipc.md), [modules/preload.md](./modules/preload.md) + [adr/008](./adr/008-dashboard-window-bundle.md) |
| Change icons | [modules/icon-pipeline.md](./modules/icon-pipeline.md) → [scripts/generate-icons.mjs](../scripts/generate-icons.mjs) + the SVGs |
| Package / sign / notarize / publish | [modules/packaging.md](./modules/packaging.md), [features/release-distribution.md](./features/release-distribution.md) |
| Change update check/download/install behavior | [features/auto-update.md](./features/auto-update.md) → [src/update-service.ts](../src/update-service.ts) + [adr/011](./adr/011-auto-update-mechanism.md) |
| Change the update attention cues (icon badge / notifications) | [features/auto-update.md](./features/auto-update.md) → [src/tray-icon.ts](../src/tray-icon.ts) (badge) + [src/update-notifier.ts](../src/update-notifier.ts) (notifications) + [adr/011 amendment](./adr/011-auto-update-mechanism.md#amendment-attention-cues-2026-07) |
| Preview the badge / notification / menu-card-animation states without launching the app | [storybook.md](./storybook.md) → [stories/](../stories/) + `pnpm storybook` |
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
| Preview UI states (Storybook) | `pnpm storybook` (dev) / `pnpm build-storybook` (static) — see [storybook.md](./storybook.md) |
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
| `src/menu-card/` | Browser-context renderer (Canvas 2D stats card + its animation engine) | Bundled by **esbuild** (not `tsc`); type-checked via `tsconfig.dashboard.json`. `animation.ts` is DOM-free and pure (also imported directly by Vitest tests). Painted by the hidden [menu-card-window.ts](../src/menu-card-window.ts), scheduled by [card-animator.ts](../src/card-animator.ts). |
| `src/preload.mts` | ESM preload | `.mts` → `dist/preload.mjs` (Electron 42 ESM-preload requirement). |
| `test/` | Vitest unit tests + JSON fixtures | Pure logic only (merge/normalize/derive/atomic IO); ccusage mocked via the injected runner. |
| `scripts/` | Build-time Node scripts (`.mjs`) | ESM; resolve paths via `import.meta.url`. |
| `.storybook/` | Storybook config (HTML + Vite) | Framework-free; telemetry off. — [storybook.md](./storybook.md) |
| `stories/` | Storybook stories (`*.stories.ts`) | Outside `src/` so `tsc` ignores them; import the **real** pure modules, extension-less. |
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

### Change or add a menu-card animation
1. Tune an existing one (duration/stagger/easing/particle count) in [animation-config.ts](../src/menu-card/animation-config.ts) — no drawing-code changes needed.
2. Add a new animated element: extend the DOM-free primitives in [animation.ts](../src/menu-card/animation.ts) if needed (a new `Tween` usage or particle-field shape), thread its start/state through `session` in `renderCardFrame` (`card.ts`), and paint it in `paintCard`. [card-animator.ts](../src/card-animator.ts) already polls generically while `animating` is true — a new *bounded* animation needs no driver changes; a new *ambient* (menu-open-lifetime) one should ride `setMenuOpen` like embers do.
3. Preview it live without Electron: `pnpm storybook` → the `Menu Card` stories ([storybook.md](./storybook.md)) drive the real functions with a browser `requestAnimationFrame` loop.
4. Add/extend a Vitest case in [test/menu-card-animation.test.ts](../test/menu-card-animation.test.ts) (pure math) and/or [test/card-animator.test.ts](../test/card-animator.test.ts) (loop lifecycle) for anything with new timing logic.
5. `pnpm check && pnpm typecheck && pnpm test && pnpm build:renderer && pnpm build-storybook`. Update [modules/menu-card.md](./modules/menu-card.md) / [modules/card-animator.md](./modules/card-animator.md) / [storybook.md](./storybook.md); add/amend an ADR if the framework shape itself changes (see [adr/013](./adr/013-menu-card-animation-framework.md)).

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

### Change the auto-update behavior
1. The lifecycle (check/download/install, error handling) lives in [update-service.ts](../src/update-service.ts); the fixed check cadence is `UPDATE_CHECK_INTERVAL_MINUTES` there — **not** `settings.ts`'s usage-refresh interval, which is a separate, user-configurable, manual-capable concern.
2. The tray's single state-driven row lives in `buildUpdateItem` in [tray.ts](../src/tray.ts); wiring (`onCheckForUpdates`/`onDownloadUpdate`/`onRestartToUpdate`) is in [main.ts](../src/main.ts) — `quitAndInstall()` must only ever be reachable from the tray's explicit "Restart to Update" click.
3. The attention cues (per [adr/011 amendment](./adr/011-auto-update-mechanism.md#amendment-attention-cues-2026-07)): the icon **badge** is composited by the pure [tray-icon.ts](../src/tray-icon.ts) and driven by `refreshTrayIcon` in [tray.ts](../src/tray.ts); the **notifications** are [update-notifier.ts](../src/update-notifier.ts) (copy in the pure [update-notification-content.ts](../src/update-notification-content.ts)), fanned out alongside the tray in [main.ts](../src/main.ts). Keep the invariant: a notification must never call `quitAndInstall()` (the "downloaded" notification is passive). Light/dark for the badge glyph (and the stats card's value text) comes from [appearance.ts](../src/appearance.ts)'s `detectAppearance()`, not `nativeTheme.shouldUseDarkColors` — see [adr/011's reliable-detection amendment](./adr/011-auto-update-mechanism.md#amendment-reliable-menu-bar-appearance-detection-2026-07) for why. Preview both without launching the app via `pnpm storybook` — [storybook.md](./storybook.md).
4. `pnpm check && pnpm typecheck && pnpm test`. Update [features/auto-update.md](./features/auto-update.md) + [modules/update-service.md](./modules/update-service.md) + [modules/update-notifier.md](./modules/update-notifier.md) + [modules/tray.md](./modules/tray.md); add/update an ADR if the mechanism itself changes (see [adr/011](./adr/011-auto-update-mechanism.md)).

## Boundaries

The archive feature has hard rules (from the spec). **Never**: store conversation content or raw logs (numbers only); transmit archive data off-device; modify the source tools' logs; overwrite a richer record with a poorer one. **Ask first**: adding any dependency beyond chart.js/esbuild/vitest (and any native dep); changing the stored schema (bump `schemaVersion` + migration); changing tray click behavior or the displayed numbers. See [ADR-006](./adr/006-durable-usage-archive.md) / [ADR-007](./adr/007-keep-richest-merge.md).

Auto-update has its own hard rules (see [ADR-011](./adr/011-auto-update-mechanism.md)). **Always**: only apply signed + notarized updates (enforced by electron-updater/Squirrel.Mac, not hand-rolled); let the user defer indefinitely. **Never**: ship unsigned update payloads; silently force-quit/restart during active use; skip signature verification; call `quitAndInstall()` from anywhere but the tray's explicit "Restart to Update" click. **Ask first**: any telemetry/usage reporting of update activity; auto-restart behavior beyond the explicit click; background download over metered networks; making the check cadence user-configurable.

## Documentation Update Rules

| When you change... | Update... |
|---------------------|-----------|
| A domain type / record ([types.ts](../src/types.ts)) | [DOMAIN.md](./DOMAIN.md) glossary + ER, [modules/types.md](./modules/types.md), consuming module docs |
| A module's public surface | That [modules/*.md](./modules/) |
| Merge / capture / derive behavior | [modules/store.md](./modules/store.md) / [capture-service.md](./modules/capture-service.md) / [derive.md](./modules/derive.md) |
| User-visible behavior | The relevant [features/*.md](./features/) + [functional-spec/PRODUCT.md](./functional-spec/PRODUCT.md) |
| File/folder structure | The Conventions table above (and re-run `repo-tree.sh`) |
| A consequential design decision | A new/updated [adr/*.md](./adr/) |
| Packaging/signing/publish behavior | [modules/packaging.md](./modules/packaging.md), [features/release-distribution.md](./features/release-distribution.md) |
| Auto-update check/download/install behavior | [modules/update-service.md](./modules/update-service.md), [features/auto-update.md](./features/auto-update.md) |
| Auto-update attention cues (icon badge / notifications) | [modules/tray-icon.md](./modules/tray-icon.md), [modules/update-notifier.md](./modules/update-notifier.md), [modules/tray.md](./modules/tray.md), [features/auto-update.md](./features/auto-update.md) |
| Menu-bar light/dark appearance detection | [modules/appearance.md](./modules/appearance.md), [modules/tray.md](./modules/tray.md) |

## Context-Minimizing Guidance

- **Behavior bug in the menu/title:** [modules/tray.md](./modules/tray.md) → [src/tray.ts](../src/tray.ts).
- **Wrong/missing numbers:** [modules/capture.md](./modules/capture.md) + [modules/capture-service.md](./modules/capture-service.md).
- **Archive not filling / shrinking / corrupt:** [modules/store.md](./modules/store.md) → [src/store.ts](../src/store.ts) + [adr/007](./adr/007-keep-richest-merge.md).
- **Dashboard wrong/blank:** [modules/derive.md](./modules/derive.md) → [src/derive.ts](../src/derive.ts), then [modules/ipc.md](./modules/ipc.md) / [modules/window.md](./modules/window.md).
- **Build/ship issue:** [modules/packaging.md](./modules/packaging.md) + [features/release-distribution.md](./features/release-distribution.md).
- **Update row stuck / not detecting a new release:** [modules/update-service.md](./modules/update-service.md) → [src/update-service.ts](../src/update-service.ts); check that CI actually published `latest-mac.yml` — [modules/packaging.md](./modules/packaging.md).
- **"Why is it done this way?":** [adr/](./adr/) before changing anything.
