# Burnbar — Documentation Index

> Burnbar is a macOS menu-bar app showing Claude Code token burn and cost, powered by the ccusage CLI. Backend-agnostic (Anthropic / Vertex AI / Bedrock).

| Document | Description |
|----------|-------------|
| [AGENTS.md](./AGENTS.md) | Agent playbook — **read first**; routing, run/build, conventions |
| [DOMAIN.md](./DOMAIN.md) | Vocabulary, entities, invariants, business rules, edge cases |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Structure, composition, data flow, design decisions |
| [functional-spec/PRODUCT.md](./functional-spec/PRODUCT.md) | Implementation-agnostic product spec |

## Modules

| Module | Description |
|--------|-------------|
| [main](./modules/main.md) | Electron lifecycle; boots the tray, hides the Dock |
| [tray](./modules/tray.md) | `TrayManager` — icon, title, context menu, 60s refresh |
| [usage](./modules/usage.md) | `getUserUsage()` — spawns ccusage CLI, parses to `UsageData` |
| [types](./modules/types.md) | Shared contracts: `UsageStats`, `UsageData`, `CcusageDailyReport` |
| [icon-pipeline](./modules/icon-pipeline.md) | SVG → PNG icon generation (`pnpm icon`) |
| [packaging](./modules/packaging.md) | electron-builder config, signing, notarization, entitlements |

## Features

| Feature | Description |
|---------|-------------|
| [menu-bar-cost](./features/menu-bar-cost.md) | Live today's-cost title in the menu bar |
| [usage-menu](./features/usage-menu.md) | Context menu: today + all-time cost & tokens, Quit |
| [release-distribution](./features/release-distribution.md) | Building signed/notarized macOS artifacts |

## ADRs

| ADR | Decision |
|-----|----------|
| [001](./adr/001-ccusage-cli-shell-out.md) | Consume ccusage via its CLI, not as a library |
| [002](./adr/002-electron-run-as-node.md) | Run ccusage through the app's runtime via `ELECTRON_RUN_AS_NODE` |
| [003](./adr/003-single-call-derive-today.md) | One CLI call; derive "today" from the daily report |
| [004](./adr/004-template-tray-icon.md) | Use a macOS template image for the tray icon |
| [005](./adr/005-env-driven-signing-notarization.md) | Drive signing & notarization from env vars |
