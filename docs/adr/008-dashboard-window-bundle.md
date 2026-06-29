# ADR-008: Dashboard window — ESM preload, sandbox, and a separate renderer bundle

## Status

Accepted

## Context

The archive ([ADR-006](./006-durable-usage-archive.md)) is only useful if the user can see it, so Burnbar grew its first window: a Chart.js dashboard ([window.ts](../../src/window.ts), [src/dashboard/](../../src/dashboard/)). That introduces a renderer (browser context) and a main↔renderer boundary the tray-only app never had. Two build/runtime questions follow: how the renderer imports Chart.js, and how the preload bridges to it safely.

## Decision

- **Separate renderer bundle.** `tsc` keeps compiling the main-process/preload TypeScript to `dist/` (Node16 ESM). esbuild bundles the renderer (`src/dashboard/renderer.ts` + Chart.js) into `dist/dashboard/` and copies the HTML/CSS — Chart.js must be bundled and the renderer needs the DOM lib the Node16 config omits. The renderer is excluded from the main `tsconfig` and type-checked via [tsconfig.dashboard.json](../../tsconfig.dashboard.json). See [scripts/build-renderer.mjs](../../scripts/build-renderer.mjs).
- **ESM preload via `.mts` → `.mjs`.** The preload is authored as [preload.mts](../../src/preload.mts) so `tsc` emits `dist/preload.mjs`; Electron 42 loads an ES-module preload only from a `.mjs` file, and only when `sandbox: false`.
- **Window security.** `contextIsolation: true`, `nodeIntegration: false`, a strict CSP, and a single read-only `burnbar.getSeries` channel. The renderer loads only local bundled code and reaches the archive solely through that channel — no Node access, no remote content, no network.
- **Chart.js as a devDependency.** It is bundled into `dist/dashboard/renderer.js`, so it never needs to ship in the packaged `node_modules`.

## Consequences

- (+) Chart.js is tree-shaken into one renderer bundle; the packaged app stays lean (no double-shipped `node_modules/chart.js`).
- (+) Full type coverage: main config + dashboard config both run under `pnpm typecheck`.
- (+) The renderer's blast radius is small — local code only, one read-only IPC channel, numbers only.
- (−) `sandbox: false` is required for the ESM preload, trading the OS-level renderer sandbox for ESM ergonomics. Low practical risk here (no remote content), but a sandboxed CommonJS preload (`sandbox: true`) is a viable future hardening if the renderer ever loads untrusted content.
- (−) Two build steps (`tsc` + esbuild) and two tsconfigs instead of one.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Sandboxed CommonJS preload (`sandbox: true`) | More secure, but the spec chose an ESM preload; revisit as hardening (see Consequences). |
| Bundle the whole app (main + renderer) with esbuild | Loses `tsc`'s type-checking on the main process; larger change to a working Node16 build. |
| Load Chart.js from a CDN | Violates the no-network / self-contained guarantee and the CSP. |
| Chart.js as a runtime dependency | Redundant — it is bundled into the renderer; shipping it in `node_modules` only bloats the artifact. |
