# Feature: Release & Distribution

## User Story

As the maintainer, I want to produce signed, notarized macOS artifacts (and unsigned ones locally) with a single command and no config edits.

## Scope

**Includes:** building `.dmg` + `.zip` for arm64 (Apple Silicon), optional signing + notarization via env vars, and the icon regeneration that feeds the artifact.
**Excludes:** auto-update, Homebrew cask publishing (lives in a separate repo), CI-built releases (CI only lints + typechecks — see [.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

## UX Flow (operator)

### Unsigned (local)
`pnpm dist:mac` with no env → unsigned `.dmg`/`.zip` in `release/`. Gatekeeper blocks them on other Macs. — [README.md](../../README.md), [electron-builder.config.cjs:14-15](../../electron-builder.config.cjs#L14-L15)

### Signed + notarized (release)
Set signing + notary env vars, then `pnpm dist:mac` → signed, notarized, stapled artifacts that pass Gatekeeper. — [README.md](../../README.md)

## Acceptance Criteria

- [ ] `pnpm dist:mac` succeeds with **no** credentials (unsigned). — [electron-builder.config.cjs:35-36](../../electron-builder.config.cjs#L35-L36)
- [ ] With `CSC_LINK`/`CSC_NAME`, artifacts are signed. — [electron-builder.config.cjs:17](../../electron-builder.config.cjs#L17)
- [ ] With `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, artifacts are notarized. — [electron-builder.config.cjs:18-20](../../electron-builder.config.cjs#L18-L20)
- [ ] An arm64 dmg + zip are produced. — [electron-builder.config.cjs:61-64](../../electron-builder.config.cjs#L61-L64)

## Build Commands

| Goal | Command |
|------|---------|
| Current platform | `pnpm dist` — [package.json:35](../../package.json#L35) |
| macOS arm64 | `pnpm dist:mac` — [package.json:36](../../package.json#L36) |
| Regenerate icons first | `pnpm icon` — [package.json:34](../../package.json#L34) |

## Environment Contract

| Purpose | Vars |
|---------|------|
| Signing | `CSC_LINK` + `CSC_KEY_PASSWORD`, **or** `CSC_NAME` |
| Notarization | `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` |

See [electron-builder.config.cjs:8-15](../../electron-builder.config.cjs#L8-L15).

## State Transitions

See the signing/notarization decision flow in [modules/packaging.md](../modules/packaging.md#how-it-works).

## Known Pitfalls

- Artifacts land in `release/` (git-ignored), not `dist/` (which is `tsc` output). — [electron-builder.config.cjs:26](../../electron-builder.config.cjs#L26)
- First-ever Electron run downloads the binary lazily (Electron 42). — see [AGENTS.md](../AGENTS.md#run--build).
- Build scripts use `pnpm` (the configured package manager); `npm run` works too but `pnpm install` is the supported path. — [package.json:47](../../package.json#L47)

## Code Touchpoints

| Concern | File |
|---------|------|
| Packaging config | [electron-builder.config.cjs](../../electron-builder.config.cjs) |
| Entitlements | [build/entitlements.mac.plist](../../build/entitlements.mac.plist) |
| Icons | [scripts/generate-icons.mjs](../../scripts/generate-icons.mjs) |
| Scripts | [package.json:30-33](../../package.json#L30-L33) |
