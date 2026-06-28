# ADR-005: Drive signing & notarization from environment variables

## Status

Accepted

## Context

The same `dist` command must serve two audiences: a contributor building locally (no Apple credentials) and a release build that must pass Gatekeeper on other Macs (signed + notarized). Hard-coding identities would break local builds and leak secrets. — [electron-builder.config.cjs:1-15](../../electron-builder.config.cjs#L1-L15)

## Decision

Detect credentials from the environment and switch behavior accordingly: `identity` is auto-discovered when `CSC_LINK`/`CSC_NAME` is present (else `null` to skip signing); `notarize` is true only when `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` are all set. No config edits needed to switch modes. — [electron-builder.config.cjs:17-36](../../electron-builder.config.cjs#L17-L36)

## Consequences

- (+) One command works for both local (unsigned) and release (signed + notarized) builds.
- (+) No secrets in the repo; CI/release can inject them as env.
- (−) An unsigned local artifact is Gatekeeper-blocked on other Macs — expected, documented. — [README.md](../../README.md)
- (−) Silent mode switch: forgetting to set vars yields an unsigned build with no error. — [electron-builder.config.cjs:14-15](../../electron-builder.config.cjs#L14-L15)

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Hard-code Developer ID identity | Breaks credential-less local builds; couples config to one machine. |
| Separate signed/unsigned configs | Duplication; easy to drift. |
| Always require credentials | Blocks contributors without an Apple Developer account. |
