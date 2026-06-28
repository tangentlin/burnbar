# Module: packaging

## Purpose

Turns the compiled app into distributable macOS artifacts (`.dmg` + `.zip`, x64 + arm64), with optional signing and notarization driven entirely by environment variables.

## Public Surface

| Artifact | Type | File |
|----------|------|------|
| electron-builder config | CJS module (`Configuration`) | [electron-builder.config.cjs](../../electron-builder.config.cjs) |
| hardened-runtime entitlements | plist | [build/entitlements.mac.plist](../../build/entitlements.mac.plist) |
| `dist` / `dist:mac` / `dist:mac:universal` | npm scripts | [package.json:31-33](../../package.json#L31-L33) |

## Responsibilities

- Define app identity: `appId` `com.tangentlin.burnbar`, `productName` `Burnbar`. — [electron-builder.config.cjs:24-25](../../electron-builder.config.cjs#L24-L25)
- Bundle `dist/`, `assets/`, `node_modules/`, `package.json` into the app. — [electron-builder.config.cjs:27](../../electron-builder.config.cjs#L27)
- Mark the app agent-only via `LSUIElement` (no Dock). — [electron-builder.config.cjs:37](../../electron-builder.config.cjs#L37)
- Build dmg + zip for both x64 and arm64. — [electron-builder.config.cjs:38-41](../../electron-builder.config.cjs#L38-L41)
- Conditionally sign/notarize from env presence. — [electron-builder.config.cjs:17-36](../../electron-builder.config.cjs#L17-L36)

## Non-Goals

- No auto-update / Sparkle channel.
- No Windows/Linux targets (config is `mac`-only). — [electron-builder.config.cjs:28-42](../../electron-builder.config.cjs#L28-L42)

## How It Works

`hasSigningCreds` is true if `CSC_LINK` or `CSC_NAME` is set; `hasNotaryCreds` if `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` are all set. `identity` is `undefined` (auto-discover) when signing creds exist, else `null` (explicitly skip). `notarize` mirrors `hasNotaryCreds`. With nothing set, artifacts are produced **unsigned** — fine locally, Gatekeeper-blocked elsewhere. — [electron-builder.config.cjs:17-36](../../electron-builder.config.cjs#L17-L36)

```mermaid
flowchart TD
    build["pnpm build (tsc → dist/)"] --> eb["electron-builder"]
    eb --> sign{"CSC_LINK / CSC_NAME?"}
    sign -- yes --> signed["sign (auto-discover identity)"]
    sign -- no --> unsigned["identity = null (skip)"]
    signed --> notar{"APPLE_ID + PASSWORD + TEAM_ID?"}
    unsigned --> notar
    notar -- yes --> stapled["notarize + staple"]
    notar -- no --> done["dmg + zip (x64, arm64) → release/"]
    stapled --> done
```

The hardened-runtime entitlements grant JIT / unsigned-executable-memory / library-validation-disable etc. — required for Electron under hardened runtime. — [build/entitlements.mac.plist](../../build/entitlements.mac.plist)

## Invariants & Failure Modes

- A credential-less build **never fails** for lack of signing — it just ships unsigned. — [electron-builder.config.cjs:14-15](../../electron-builder.config.cjs#L14-L15), [electron-builder.config.cjs:35-36](../../electron-builder.config.cjs#L35-L36)
- Output lands in `release/` (git-ignored). — [electron-builder.config.cjs:26](../../electron-builder.config.cjs#L26)
- The app icon comes from `build/icons/icon.png` (generated; see [icon-pipeline](./icon-pipeline.md)). — [electron-builder.config.cjs:30](../../electron-builder.config.cjs#L30)

## Extension Points

- Add a target OS by extending the config with `win`/`linux` blocks.
- Tune signing behavior via the env contract above — no code edits needed.

## Related Files

- [icon-pipeline](./icon-pipeline.md) — produces the packaging icon.
- [features/release-distribution.md](../features/release-distribution.md) — the operator-facing release flow.
- [adr/005-env-driven-signing-notarization.md](../adr/005-env-driven-signing-notarization.md) — rationale.
