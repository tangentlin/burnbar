# Feature: Auto-Update

## User Story

As a user running an older Burnbar build, I want to be notified a newer signed release exists and install it on my own schedule, entirely from the tray — no window, no forced restart.

## Scope

**Includes:** a background check every 4 hours (fixed, not user-configurable) plus an on-demand "Check for Updates" tray action; a manual "Download Update" step; a manual "Restart to Update" step that installs and relaunches; signed/notarized-only updates (electron-updater/Squirrel.Mac verifies the payload's signature before install).
**Excludes:** any window or native dialog (tray-only, per [ADR-011](../adr/011-auto-update-mechanism.md)); background download without an explicit click; auto-restart; a configurable check interval; telemetry/usage reporting of update activity; updates on any platform other than the signed macOS arm64 build.

## UX Flow (user)

1. **Idle** — the tray shows a "Check for Updates" row (also fires automatically every 4 hours in the background).
2. **Checking** — clicking it (or the background timer firing) shows "Checking for Updates..." (disabled) briefly.
3. **Available** — a newer signed release exists: the row becomes "Download Update (vX.Y.Z)..." (clickable). Nothing downloads until this is clicked.
4. **Downloading** — the row shows "Downloading... NN%" (disabled) while electron-updater fetches and verifies the update.
5. **Downloaded** — the row becomes "Restart to Update" (clickable). The update sits ready, installed on no schedule but the user's own — quitting/relaunching Burnbar any other way does **not** install it.
6. **Restart to Update** — clicking installs and relaunches. This is the *only* action in the app that triggers an install.

If a check or download fails, the row falls back to "Check for Updates" (idle-equivalent); the failure is logged, never shown as an error dialog or a crash.

## Acceptance Criteria

- [ ] A stale local build detects a newer tagged release, downloads it, and offers to install — entirely from the tray menu, no window. — [update-service.ts](../../src/update-service.ts), [tray.ts](../../src/tray.ts)
- [ ] `autoDownload` is always `false` — nothing downloads without the explicit "Download Update" click. — [update-service.ts](../../src/update-service.ts)
- [ ] An update never installs without the user clicking "Restart to Update" — not on download completion, not on a timer, not on an unrelated app quit. — [update-service.ts#quitAndInstall](../../src/update-service.ts), [main.ts](../../src/main.ts)
- [ ] A failed check or download never crashes or blocks the tray. — [update-service.ts](../../src/update-service.ts)
- [ ] The background check cadence (4h) runs independently of the user-configurable usage-refresh interval, including when that interval is `0`/manual. — [update-service.ts](../../src/update-service.ts), [settings.ts](../../src/settings.ts)
- [ ] Only signed + notarized payloads install — enforced by electron-updater/Squirrel.Mac, not hand-rolled verification. — [ADR-011](../adr/011-auto-update-mechanism.md)
- [ ] Exactly one update row is always present in the tray menu; its label reflects the current state (no separate "Up to date" row). — [tray.ts](../../src/tray.ts)

## Data Model (Conceptual)

`UpdateState { status, version, percent, error }`, where `status` is one of `idle | checking | available | downloading | downloaded | error`. Pushed by `UpdateService` to the tray on every transition, mirroring how `TrayState` is pushed by `CaptureService`. — [types.ts](../../src/types.ts), [DOMAIN.md](../DOMAIN.md)

## Known Pitfalls

- The update feed (`latest-mac.yml`) is only produced when the release pipeline actually publishes; a broken CI `publish` config silently breaks update detection without breaking the release itself — see the "Verify assets landed" CI step in [release.yml](../../.github/workflows/release.yml).
- A stable-tag release is a **draft** until manually published on GitHub; electron-updater only ever sees the latest *published* release, so drafting doesn't accidentally push an unfinished build to users.
- electron-updater's `checkForUpdates()` no-ops for an unpackaged (dev) build; `UpdateService` additionally skips calling it at all in dev to avoid log spam.

## Related

- [modules/update-service.md](../modules/update-service.md), [modules/tray.md](../modules/tray.md), [modules/packaging.md](../modules/packaging.md), [features/release-distribution.md](./release-distribution.md), [adr/011-auto-update-mechanism.md](../adr/011-auto-update-mechanism.md).
