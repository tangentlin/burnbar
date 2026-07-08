# Module: packaging

## Purpose

Turns the compiled app into distributable macOS artifacts (`.dmg` + `.zip`, arm64), with optional signing and notarization driven entirely by environment variables, and (via the `publish` block) feeds those same artifacts to GitHub Releases — which doubles as [auto-update](../features/auto-update.md)'s electron-updater feed.

## Public Surface

| Artifact | Type | File |
|----------|------|------|
| electron-builder config | CJS module (`Configuration`) | [electron-builder.config.cjs](../../electron-builder.config.cjs) |
| hardened-runtime entitlements | plist | [build/entitlements.mac.plist](../../build/entitlements.mac.plist) |
| `dist` / `dist:mac` | npm scripts | [package.json:35-36](../../package.json#L35-L36) |

## Responsibilities

- Define app identity: `appId` `com.tangentlin.burnbar`, `productName` `Burnbar`. — [electron-builder.config.cjs:80-81](../../electron-builder.config.cjs#L80-L81)
- Bundle `dist/` (incl. `dist/dashboard/**` and `dist/preload.mjs`), `assets/`, `node_modules/`, `package.json` into the app — **excluding `**/*.map`** so source maps never ship in the distributable. — [electron-builder.config.cjs:83-87](../../electron-builder.config.cjs#L83-L87)
- Mark the app agent-only via `LSUIElement` (no Dock). — [electron-builder.config.cjs:108](../../electron-builder.config.cjs#L108)
- Build dmg + zip for arm64 (Apple Silicon only). — [electron-builder.config.cjs:109-115](../../electron-builder.config.cjs#L109-L115)
- Conditionally sign/notarize from env presence. — [electron-builder.config.cjs:24-27](../../electron-builder.config.cjs#L24-L27)
- Publish to GitHub Releases (`publish: { provider: "github", ... }`), which also emits `latest-mac.yml` — the feed manifest [UpdateService](./update-service.md) reads. Only actually publishes when invoked with a publish policy other than `never` (`dist:mac:ci` uses `--publish onTagOrDraft`; local `dist:mac` stays unpublished). — [electron-builder.config.cjs:123-133](../../electron-builder.config.cjs#L123-L133), [ADR-011](../adr/011-auto-update-mechanism.md)
- `afterPack` hook: `chmod +x` the unpacked ccusage native binary before signing — see [How It Works](#how-it-works) and [ADR-012](../adr/012-ccusage-binary-chmod-before-sign.md). — [electron-builder.config.cjs:40-96](../../electron-builder.config.cjs#L40-L96)

## Non-Goals

- No Windows/Linux targets (config is `mac`-only). — [electron-builder.config.cjs:97-116](../../electron-builder.config.cjs#L97-L116)
- No update-check/download/install logic — that's [update-service](./update-service.md); this module only produces the feed it reads.

## How It Works

`hasSigningCreds` is true if `CSC_LINK` or `CSC_NAME` is set; `hasNotaryCreds` if `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` are all set. `identity` is `undefined` (auto-discover) when signing creds exist, else `null` (explicitly skip). `notarize` mirrors `hasNotaryCreds`. With nothing set, artifacts are produced **unsigned** — fine locally, Gatekeeper-blocked elsewhere. — [electron-builder.config.cjs:24-27](../../electron-builder.config.cjs#L24-L27)

```mermaid
flowchart TD
    build["pnpm build (tsc + esbuild → dist/)"] --> eb["electron-builder (files: !**/*.map, asarUnpack ccusage)"]
    eb --> chmod["afterPack: chmod +x unpacked ccusage-darwin-arm64 binary"]
    chmod --> sign{"CSC_LINK / CSC_NAME?"}
    sign -- yes --> signed["sign (auto-discover identity)"]
    sign -- no --> unsigned["identity = null (skip)"]
    signed --> notar{"APPLE_ID + PASSWORD + TEAM_ID?"}
    unsigned --> notar
    notar -- yes --> stapled["notarize + staple"]
    notar -- no --> done["dmg + zip (arm64) → release/"]
    stapled --> done
    done --> pub{"--publish policy?"}
    pub -- never / local --> stop["release/ only, no upload"]
    pub -- onTagOrDraft --> gh["GitHub Releases: dmg + zip + latest-mac.yml"]
```

The hardened-runtime entitlements grant JIT / unsigned-executable-memory / library-validation-disable etc. — required for Electron under hardened runtime. — [build/entitlements.mac.plist](../../build/entitlements.mac.plist)

## Invariants & Failure Modes

- A credential-less build **never fails** for lack of signing — it just ships unsigned. — [electron-builder.config.cjs:18-19](../../electron-builder.config.cjs#L18-L19), [electron-builder.config.cjs:104-105](../../electron-builder.config.cjs#L104-L105)
- Output lands in `release/` (git-ignored). — [electron-builder.config.cjs:82](../../electron-builder.config.cjs#L82)
- The app icon comes from `build/icons/icon.png` (generated; see [icon-pipeline](./icon-pipeline.md)). — [electron-builder.config.cjs:99](../../electron-builder.config.cjs#L99)
- ccusage's native binary ships non-executable in its own npm package and self-chmods at runtime; Hardened Runtime denies that self-chmod inside an already-signed, notarized bundle (`EPERM: operation not permitted, chmod ...`). The `afterPack` hook chmod's it before signing instead — this must keep running strictly before `doSignAfterPack`. If the unpacked binary is missing (e.g. `@ccusage/ccusage-darwin-arm64` wasn't installed), the hook fails the build with a named-cause error rather than shipping a broken app. — [electron-builder.config.cjs:40-76](../../electron-builder.config.cjs#L40-L76), [ADR-012](../adr/012-ccusage-binary-chmod-before-sign.md)

## Extension Points

- Add a target OS by extending the config with `win`/`linux` blocks.
- Tune signing behavior via the env contract above — no code edits needed.

## Related Files

- [icon-pipeline](./icon-pipeline.md) — produces the packaging icon.
- [update-service](./update-service.md) — consumes the `latest-mac.yml` feed this module's publish config produces.
- [features/release-distribution.md](../features/release-distribution.md) — the operator-facing release flow.
- [features/auto-update.md](../features/auto-update.md) — the user-facing feature this feed enables.
- [.github/workflows/release.yml](../../.github/workflows/release.yml) — the CI job that invokes `dist:mac:ci` with a publishing `--publish` policy.
- [adr/005-env-driven-signing-notarization.md](../adr/005-env-driven-signing-notarization.md) — signing/notarization rationale.
- [adr/011-auto-update-mechanism.md](../adr/011-auto-update-mechanism.md) — why/how the publish config feeds electron-updater.
