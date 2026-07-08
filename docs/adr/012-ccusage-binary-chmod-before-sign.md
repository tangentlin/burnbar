# ADR-012: chmod ccusage's native binary in afterPack, before signing

## Status

Accepted

## Context

`@ccusage/ccusage-darwin-arm64` ships its `bin/ccusage` native binary at mode `644` (verified against the published npm tarball) — the `ccusage` package declares no `bin` field for it, so npm never chmods it at install time. `ccusage/src/cli.js` instead self-heals at runtime: `ensureNativeBinaryExecutable()` stats the binary and, if it isn't executable, `chmodSync`s it to `755` on every invocation.

That self-heal works against a normal, writable `node_modules` checkout. It does not work once the binary is unpacked into a Hardened-Runtime, notarized Burnbar.app: macOS denies the runtime `chmod`, and every capture fails with

```
ccusage native binary is not executable: EPERM: operation not permitted, chmod '.../app.asar.unpacked/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage'
```

The packaging config already unpacks `ccusage` and `@ccusage` from the asar for a related but distinct reason (`chmod`/`exec` need a real on-disk path — see the `asarUnpack` comment in [electron-builder.config.cjs](../../electron-builder.config.cjs) and [ADR-002](./002-electron-run-as-node.md)'s neighborhood); that fix alone doesn't make the binary executable, and Hardened Runtime specifically exists to stop an already-signed bundle from having new executable content materialize post-signature — so the runtime self-heal cannot be made to work no matter where the binary lives on disk.

## Decision

Add an electron-builder `afterPack` hook (`chmodCcusageNativeBinary` in [electron-builder.config.cjs](../../electron-builder.config.cjs)) that `chmod`s the unpacked binary to `755` at packaging time. `afterPack` fires after `asarUnpack` has copied the binary onto disk but strictly before electron-builder code-signs the bundle (`PlatformPackager.doPack` → `emitAfterPack` → `doSignAfterPack`, verified against `app-builder-lib`'s source), so the shipped binary is both executable and covered by the code signature — ccusage's own runtime self-heal then never has to run because the binary is already executable.

The hook hardcodes the `ccusage-darwin-arm64` package name rather than deriving it from `mac.target`/arch: this project builds mac + arm64 only (see `mac.target`'s own comment), and the packaged CLI runner in [capture.ts](../../src/capture.ts) already assumes the same. If the binary is missing (e.g. a build run without the matching optional dependency installed), the hook throws a message naming the expected path and likely cause, rather than a bare `ENOENT`.

## Consequences

- (+) Fixes the production `EPERM` crash: capture works in the signed, notarized release build, not just in dev.
- (+) The fix lives at the correct layer — packaging time, not a runtime workaround — matching Hardened Runtime's actual constraint (no post-signature executable content).
- (−) One more packaging-time assumption to keep in sync with `mac.target`'s arch and ccusage's package-naming convention; if either changes, this hook needs a matching update.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Grant a Hardened Runtime entitlement to permit the runtime chmod | Apple's six hardened-runtime opt-outs (JIT, unsigned-executable-memory, dyld-env-vars, library-validation, executable-page-protection, debugger) don't cover "make a file executable at runtime" — no such entitlement exists. |
| Patch/fork ccusage to ship the binary pre-chmod'd | Burnbar vendors ccusage as a released npm dependency, not a fork; patching would mean maintaining a diff against every future ccusage release. Filing the issue upstream (ccusage should declare `bin` or ship the file `755`) is the better long-term fix but is out of Burnbar's control. |
| Disable Hardened Runtime | Required for notarization — a Gatekeeper-blocked, unnotarized build defeats the entire signed-release goal (see [ADR-010](./010-production-entitlements.md)). |
