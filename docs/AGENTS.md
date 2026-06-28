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
| Change how usage is fetched/parsed | [modules/usage.md](./modules/usage.md) → [src/usage.ts](../src/usage.ts) |
| Change the menu-bar title | [features/menu-bar-cost.md](./features/menu-bar-cost.md) → [src/tray.ts](../src/tray.ts) |
| Change the context menu rows | [features/usage-menu.md](./features/usage-menu.md) → [src/tray.ts](../src/tray.ts) |
| Change refresh cadence | [src/tray.ts:7](../src/tray.ts#L7) (`REFRESH_INTERVAL_MS`) |
| Add/modify shared types | [modules/types.md](./modules/types.md) → [src/types.ts](../src/types.ts) |
| App lifecycle / startup | [modules/main.md](./modules/main.md) → [src/main.ts](../src/main.ts) |
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
| Build only (`tsc` → `dist/`) | `pnpm build` |
| Launch built app | `pnpm start` |
| Typecheck | `pnpm typecheck` |
| Lint + format check | `pnpm check` |
| Auto-fix lint + format | `pnpm check:fix` |
| Regenerate icons | `pnpm icon` |
| Package macOS (x64+arm64) | `pnpm dist:mac` |

⚠️ **Launch gotcha:** if you launch from a terminal spawned inside an Electron-based IDE (VSCode, Claude Code host), `ELECTRON_RUN_AS_NODE=1` is inherited and breaks Burnbar's own launch (`electron` resolves to the npm shim → `does not provide an export named 'Menu'`). Launch with the var stripped:

```bash
env -u ELECTRON_RUN_AS_NODE pnpm start
```

This is unrelated to the `ELECTRON_RUN_AS_NODE` that [src/usage.ts](../src/usage.ts#L22) sets for the ccusage child (that one is correct). See [adr/002-electron-run-as-node.md](./adr/002-electron-run-as-node.md). First-ever launch also lazily downloads the Electron 42 binary.

## Conventions

### Directory Structure

| Directory | Purpose | Conventions |
|-----------|---------|-------------|
| `src/` | Runtime TypeScript (ESM) | Local imports use explicit `.js` extensions (Node16 module resolution). No barrel files. |
| `scripts/` | Build-time Node scripts (`.mjs`) | ESM; resolve paths via `import.meta.url`. |
| `assets/` | Icon sources + generated PNGs | SVGs are source of truth; PNGs are generated, committed. |
| `build/` | Packaging inputs | `entitlements.mac.plist`, `icons/icon.png` (generated). |
| `dist/` | `tsc` output | Git-ignored. Never hand-edit. |
| `release/` | electron-builder output | Git-ignored. |
| `docs/` | This documentation set | — |

### Naming & Patterns

- ES modules throughout (`"type": "module"`); use `fileURLToPath(import.meta.url)` for `__dirname`. — [tray.ts:14-15](../src/tray.ts#L14-L15)
- Local imports MUST carry `.js` extensions even in `.ts` source. — [main.ts:2](../src/main.ts#L2)
- Comments explain **why**, not what (see the dense rationale comment in [usage.ts:8-13](../src/usage.ts#L8-L13)).
- ccusage's `totalCost` is renamed to `cost` at the mapping boundary; keep that boundary in [usage.ts](../src/usage.ts).

### Tooling

- Lint: **oxlint** (`correctness` = error). — [.oxlintrc.json](../.oxlintrc.json)
- Format: **oxfmt** (markdown ignored). — [.oxfmtrc.json](../.oxfmtrc.json)
- Run lint + format after every code change (project rule). — [CLAUDE.md](../CLAUDE.md)
- Package manager: **pnpm** (pinned via `packageManager`). — [package.json:47](../package.json#L47)
- CI lints + typechecks on every push (no release build in CI). — [.github/workflows/ci.yml](../.github/workflows/ci.yml)

## Change Workflows

### Add a menu row / change displayed data
1. Edit `buildMenuItems` / `addDailyUsageItems` / `addTotalUsageItems` in [tray.ts](../src/tray.ts).
2. If it needs a new figure, extend `CcusageDailyReport` + the mapping in [usage.ts](../src/usage.ts) and the types in [types.ts](../src/types.ts).
3. Run `pnpm check && pnpm typecheck`.
4. Update [features/usage-menu.md](./features/usage-menu.md) and [modules/tray.md](./modules/tray.md).

### Change the ccusage query
1. Edit the args/flags in [usage.ts:19-20](../src/usage.ts#L19-L20).
2. Adjust `CcusageDailyReport` in [types.ts](../src/types.ts) if the shape changes.
3. Update [modules/usage.md](./modules/usage.md); add an ADR if it's a consequential change.

### Change icons
1. Edit `assets/burnbar.svg` and/or `assets/burnbar-tray.svg`.
2. `pnpm icon` to regenerate PNGs. Never hand-edit PNGs.
3. Verify the tray asset stays monochrome (template image).

### Ship a release
1. Bump `version` in [package.json](../package.json).
2. `pnpm check && pnpm typecheck`.
3. Set signing/notary env vars (or none for unsigned), then `pnpm dist:mac`.
4. Artifacts appear in `release/`. See [features/release-distribution.md](./features/release-distribution.md).

## Documentation Update Rules

| When you change... | Update... |
|---------------------|-----------|
| A domain type / DTO ([types.ts](../src/types.ts)) | [DOMAIN.md](./DOMAIN.md) glossary + ER, [modules/types.md](./modules/types.md), consuming module docs |
| A module's public surface | That [modules/*.md](./modules/) |
| User-visible behavior | The relevant [features/*.md](./features/) + [functional-spec/PRODUCT.md](./functional-spec/PRODUCT.md) |
| File/folder structure | The Conventions table above (and re-run `repo-tree.sh`) |
| A consequential design decision | A new/updated [adr/*.md](./adr/) |
| Packaging/signing behavior | [modules/packaging.md](./modules/packaging.md), [features/release-distribution.md](./features/release-distribution.md) |

## Context-Minimizing Guidance

- **Behavior bug in the menu/title:** [modules/tray.md](./modules/tray.md) → [src/tray.ts](../src/tray.ts). No need to read packaging/icons.
- **Wrong/missing numbers:** [modules/usage.md](./modules/usage.md) → [src/usage.ts](../src/usage.ts) + [src/types.ts](../src/types.ts).
- **Build/ship issue:** [modules/packaging.md](./modules/packaging.md) + [features/release-distribution.md](./features/release-distribution.md). Skip `src/`.
- **"Why is it done this way?":** [adr/](./adr/) before changing anything.
