# Contributing to Burnbar

## Setup

```bash
pnpm install
pnpm dev      # tsc + renderer build, then launches Electron
```

> If your terminal inherits `ELECTRON_RUN_AS_NODE` (e.g. terminals inside an
> Electron-based IDE), unset it first: `env -u ELECTRON_RUN_AS_NODE pnpm dev`.
> See [docs/adr/002-electron-run-as-node.md](docs/adr/002-electron-run-as-node.md).

## Before opening a PR

```bash
pnpm check      # oxlint + oxfmt --check
pnpm typecheck   # tsc --noEmit for both the main process and dashboard configs
pnpm test        # Vitest — merge/normalize/derive/atomic IO
```

Run `pnpm check:fix` to auto-fix lint/format issues. If you touched
`src/dashboard/` UI, also start the app (`pnpm dev`) and click through the
change — the dashboard is esbuild-bundled and type-checked separately from
`tsc`, so a green `typecheck` doesn't guarantee it renders correctly.

## Conventions

- Node16 module resolution: local imports need explicit `.js` extensions in
  `.ts` files (e.g. `import { foo } from "./bar.js"`).
- **PR titles become your changelog entry.** `CHANGELOG.md` is generated
  automatically from merged PR titles at release time (see
  [.github/workflows/release.yml](.github/workflows/release.yml)) — write a
  title a user would want to read, not `wip` or `fix stuff`.
- Follow the existing module boundaries described in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — e.g. `store.ts` stays pure
  (merge logic + atomic IO), `tray.ts` stays display-only. If a change doesn't
  fit an existing module, say so in the PR description rather than reaching
  for a new abstraction.
- Architecture decisions with real tradeoffs belong in a new
  [docs/adr/](docs/adr/) entry, not just a code comment.

## Reporting bugs / requesting features

Use the issue templates — they ask for the details (Burnbar version, macOS
version, repro steps) that speed up triage.

## Security issues

Please don't open a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md).
