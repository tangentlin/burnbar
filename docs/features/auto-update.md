# Feature: Auto-Update

## User Story

As a user running an older Burnbar build, I want to be notified a newer signed release exists and install it on my own schedule, entirely from the tray — no window, no forced restart.

## Scope

**Includes:** a background check every 4 hours (fixed, not user-configurable) plus an on-demand "Check for Updates" tray action; a manual "Download Update" step; a manual "Restart to Update" step that installs and relaunches; signed/notarized-only updates (electron-updater/Squirrel.Mac verifies the payload's signature before install); two **attention cues** so the required actions aren't buried in a closed menu — a colored **tray-icon badge** and **OS notifications** on the actionable transitions plus a post-restart confirmation ([ADR-011 attention-cues amendment](../adr/011-auto-update-mechanism.md#amendment-attention-cues-2026-07)).
**Excludes:** any window or native dialog (notifications aside, still no in-app window); background download without an explicit click; auto-restart; a configurable check interval; telemetry/usage reporting of update activity; notifications on *errors* (failures stay logged-and-quiet) or repeated nagging; updates on any platform other than the signed macOS arm64 build.

## UX Flow (user)

1. **Idle** — the tray shows a "Check for Updates" row (also fires automatically every 4 hours in the background).
2. **Checking** — clicking it (or the background timer firing) shows "Checking for Updates..." (disabled) briefly.
3. **Available** — a newer signed release exists: the row becomes "Download Update (vX.Y.Z)..." (clickable), the **tray icon gains a blue dot with an up-arrow**, and an **"update available" notification** fires (clicking it starts the download). Nothing downloads until the user acts.
4. **Downloading** — the row shows "Downloading... NN%" (disabled) while electron-updater fetches and verifies the update. No badge (nothing is waiting on the user).
5. **Downloaded** — the row becomes "Restart to Update" (clickable), the **tray icon gains an orange dot with a restart arrow**, and a **"ready to install" notification** fires (informational — it does *not* restart on click). The update sits ready, installed on no schedule but the user's own — quitting/relaunching Burnbar any other way does **not** install it.
6. **Restart to Update** — clicking the tray row installs and relaunches. This is the *only* action in the app that triggers an install; the notification never does.
7. **After relaunch** — on the freshly installed version, a one-time **"Burnbar updated" notification** confirms the new version (detected by comparing the running version to the persisted `lastRunVersion`).

If a check or download fails, the row falls back to "Check for Updates" (idle-equivalent) and the badge clears; the failure is logged, never shown as an error dialog, a notification, or a crash.

## Acceptance Criteria

- [ ] A stale local build detects a newer tagged release, downloads it, and offers to install — entirely from the tray menu, no window. — [update-service.ts](../../src/update-service.ts), [tray.ts](../../src/tray.ts)
- [ ] `autoDownload` is always `false` — nothing downloads without the explicit "Download Update" click. — [update-service.ts](../../src/update-service.ts)
- [ ] An update never installs without the user clicking "Restart to Update" — not on download completion, not on a timer, not on an unrelated app quit. — [update-service.ts#quitAndInstall](../../src/update-service.ts), [main.ts](../../src/main.ts)
- [ ] A failed check or download never crashes or blocks the tray. — [update-service.ts](../../src/update-service.ts)
- [ ] The background check cadence (4h) runs independently of the user-configurable usage-refresh interval, including when that interval is `0`/manual. — [update-service.ts](../../src/update-service.ts), [settings.ts](../../src/settings.ts)
- [ ] Only signed + notarized payloads install — enforced by electron-updater/Squirrel.Mac, not hand-rolled verification. — [ADR-011](../adr/011-auto-update-mechanism.md)
- [ ] Exactly one update row is always present in the tray menu; its label reflects the current state (no separate "Up to date" row). — [tray.ts](../../src/tray.ts)
- [ ] The tray icon shows a colored badge with an action glyph (blue + up-arrow = available, orange + restart arrow = downloaded) only while an update needs action, and the default icon stays a macOS template. — [tray-icon.ts](../../src/tray-icon.ts), [tray.ts](../../src/tray.ts), [ADR-004](../adr/004-template-tray-icon.md)
- [ ] Notifications fire once per actionable transition (available → click downloads; downloaded → informational) plus a one-time post-restart confirmation, and never on errors. — [update-notifier.ts](../../src/update-notifier.ts)
- [ ] A notification click never installs — `quitAndInstall()` stays reachable only from the tray's "Restart to Update" click. — [main.ts](../../src/main.ts), [ADR-011](../adr/011-auto-update-mechanism.md)

## Data Model (Conceptual)

`UpdateState { status, version, percent, error }`, where `status` is one of `idle | checking | available | downloading | downloaded | error`. Pushed by `UpdateService` to the tray (badge + row) and the notifier on every transition, mirroring how `TrayState` is pushed by `CaptureService`. The post-restart confirmation uses `AppSettings.lastRunVersion` (persisted in [settings.ts](../../src/settings.ts)) compared to the running `app.getVersion()`. — [types.ts](../../src/types.ts), [DOMAIN.md](../DOMAIN.md)

## Known Pitfalls

- The update feed (`latest-mac.yml`) is only produced when the release pipeline actually publishes; a broken CI `publish` config silently breaks update detection without breaking the release itself — see the "Verify assets landed" CI step in [release.yml](../../.github/workflows/release.yml).
- A stable-tag release is a **draft** until manually published on GitHub; electron-updater only ever sees the latest *published* release, so drafting doesn't accidentally push an unfinished build to users.
- electron-updater's `checkForUpdates()` no-ops for an unpackaged (dev) build; `UpdateService` additionally skips calling it at all in dev to avoid log spam.

## Related

- [modules/update-service.md](../modules/update-service.md), [modules/update-notifier.md](../modules/update-notifier.md), [modules/tray.md](../modules/tray.md), [modules/packaging.md](../modules/packaging.md), [features/release-distribution.md](./release-distribution.md), [adr/011-auto-update-mechanism.md](../adr/011-auto-update-mechanism.md), [adr/004-template-tray-icon.md](../adr/004-template-tray-icon.md).
