# Burnbar — Documentation Index

> Burnbar is a macOS menu-bar app showing Claude Code (and other agent CLIs') token burn and cost, powered by the ccusage CLI. It also keeps a durable, numbers-only usage archive and an in-app dashboard. Backend-agnostic (Anthropic / Vertex AI / Bedrock).

| Document | Description |
|----------|-------------|
| [AGENTS.md](./AGENTS.md) | Agent playbook — **read first**; routing, run/build, conventions |
| [DOMAIN.md](./DOMAIN.md) | Vocabulary, entities, invariants, business rules, edge cases |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Structure, composition, data flow, design decisions |
| [functional-spec/PRODUCT.md](./functional-spec/PRODUCT.md) | Implementation-agnostic product spec |
| [storybook.md](./storybook.md) | Preview the update badge / notification states in isolation (no app launch) |

## Modules

| Module | Description |
|--------|-------------|
| [main](./modules/main.md) | Electron lifecycle; wires capture + tray + dashboard, quit flush |
| [tray](./modules/tray.md) | `TrayManager` — display-only icon/title/menu + "Open Usage Dashboard…" + update badge |
| [tray-icon](./modules/tray-icon.md) | Pure compositor for the update badge (recolor glyph + colored dot) |
| [appearance](./modules/appearance.md) | Reliable macOS menu-bar light/dark detection (`defaults read`, not `nativeTheme`) |
| [capture](./modules/capture.md) | ccusage spawn (DI runner) + normalizers + `toUsageData` |
| [capture-service](./modules/capture-service.md) | `CaptureService` — one ccusage call feeding tray **and** archive |
| [store](./modules/store.md) | `ArchiveStore` — keep-richest merge, atomic IO, manifest |
| [derive](./modules/derive.md) | `deriveSeries` — archive → chart series (cost + tokens, pure) |
| [settings](./modules/settings.md) | `SettingsStore` — persisted refresh interval + last-run version |
| [time](./modules/time.md) | tz helpers + relative-time / interval formatting |
| [ipc](./modules/ipc.md) | `registerArchiveIpc` — read-only `archive:get-series` |
| [preload](./modules/preload.md) | contextBridge → `window.burnbar.getSeries` |
| [window](./modules/window.md) | `DashboardWindow` — lazy BrowserWindow + security |
| [dashboard](./modules/dashboard.md) | Chart.js renderer (esbuild bundle) |
| [about-window](./modules/about-window.md) | `AboutWindow` — static credits/links window, no preload/IPC |
| [menu-card-window](./modules/menu-card-window.md) | `MenuCardRenderer` — hidden window rasterizing the tray stats card |
| [menu-card](./modules/menu-card.md) | Canvas 2D card renderer (esbuild bundle) |
| [update-service](./modules/update-service.md) | `UpdateService` — electron-updater lifecycle feeding the tray's update row |
| [update-notifier](./modules/update-notifier.md) | `UpdateNotifier` — OS notifications on actionable update transitions (injectable presenter) |
| update-notification-content | Pure, browser-safe notification copy shared by the notifier + Storybook — [update-notifier.md](./modules/update-notifier.md) |
| [types](./modules/types.md) | Shared contracts: usage, ccusage raw, archive records, series |
| [icon-pipeline](./modules/icon-pipeline.md) | SVG → PNG icon generation (`pnpm icon`) |
| [packaging](./modules/packaging.md) | electron-builder config, signing, notarization, entitlements |

## Features

| Feature | Description |
|---------|-------------|
| [menu-bar-cost](./features/menu-bar-cost.md) | Live today's-cost title in the menu bar |
| [usage-menu](./features/usage-menu.md) | Context menu: stats card, Open Dashboard, About, Quit |
| [about](./features/about.md) | About/credits window: ccusage, forked-from app, icon artist, GitHub + social links |
| [usage-archive](./features/usage-archive.md) | Durable, numbers-only capture that survives source-log purges |
| [usage-dashboard](./features/usage-dashboard.md) | Chart.js window: cost over time, by model, by agent |
| [usage-refresh](./features/usage-refresh.md) | Configurable cadence (15 min default), manual mode, Refresh Now |
| [release-distribution](./features/release-distribution.md) | Building signed/notarized macOS artifacts |
| [auto-update](./features/auto-update.md) | Tray update check/download/install via electron-updater + icon badge + notifications |

## ADRs

| ADR | Decision |
|-----|----------|
| [001](./adr/001-ccusage-cli-shell-out.md) | Consume ccusage via its CLI, not as a library |
| [002](./adr/002-electron-run-as-node.md) | Run ccusage through the app's runtime via `ELECTRON_RUN_AS_NODE` |
| [003](./adr/003-single-call-derive-today.md) | One CLI call; derive "today" from the daily report |
| [004](./adr/004-template-tray-icon.md) | Use a macOS template image for the tray icon |
| [005](./adr/005-env-driven-signing-notarization.md) | Drive signing & notarization from env vars |
| [006](./adr/006-durable-usage-archive.md) | A durable, numbers-only usage archive in `userData` |
| [007](./adr/007-keep-richest-merge.md) | "Keep richest, never shrink" merge (anti-purge) |
| [008](./adr/008-dashboard-window-bundle.md) | Dashboard: ESM preload, sandbox, separate renderer bundle |
| [009](./adr/009-menu-stats-card.md) | Menu stats card via a hidden-window canvas, replacing the template sparkline |
| [010](./adr/010-production-entitlements.md) | Remove debugger entitlements from production builds |
| [011](./adr/011-auto-update-mechanism.md) | Tray-only auto-update via electron-updater + GitHub Releases |
