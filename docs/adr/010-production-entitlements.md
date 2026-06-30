# ADR-010: Remove cs.debugger and get-task-allow from production entitlements

## Status

Accepted

## Context

`build/entitlements.mac.plist` previously included `com.apple.security.cs.debugger` and `com.apple.security.get-task-allow`. Apple's notary service rejects both in production-signed builds: `get-task-allow` lets any process attach to the app without consent, and `cs.debugger` grants debugging rights inappropriate for a public release. A build containing either entitlement cannot be notarized and therefore cannot pass Gatekeeper on any other Mac. — [build/entitlements.mac.plist](../../build/entitlements.mac.plist)

## Decision

Remove both entitlements from the production plist. Introduce a separate `build/entitlements.mac.debug.plist` that retains them for local debugger-attach workflows (lldb, Instruments), selectable via `DEBUG_ENTITLEMENTS=1` / `pnpm dist:mac:debug`. The production `pnpm dist:mac` path never sees the debug entitlements. — [build/entitlements.mac.debug.plist](../../build/entitlements.mac.debug.plist), [electron-builder.config.cjs](../../electron-builder.config.cjs)

## Consequences

- (+) `pnpm dist:mac` now produces a notarizable build; stapled DMGs pass Gatekeeper on any Mac.
- (+) The two sets of entitlements are explicit and hard to confuse: distinct files, distinct scripts.
- (−) Local debugger attachment requires the separate `pnpm dist:mac:debug` step; a credential-free unsigned dev build (`pnpm start`) is still the lowest-friction option for most development.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Keep both entitlements and skip notarization | DMGs blocked by Gatekeeper on any other Mac — distribution goal fails. |
| Single plist with entitlements gated by an env var | XML doesn't support conditional logic; the gating would live in a build script, not the plist itself. Separate files are clearer. |
| Strip entitlements post-sign via codesign --remove | Non-standard, fragile, and not supported by electron-builder's pipeline. |
