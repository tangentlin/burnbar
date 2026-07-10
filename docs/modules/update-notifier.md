# Module: update-notifier

## Purpose

Turns the [UpdateService](./update-service.md)'s state transitions into macOS **notifications**, so the two actions that require the user — Download Update and Restart to Update — aren't invisible until they open the tray menu. Complements the [tray](./tray.md)'s icon badge; together they are the "attention cues" added in [ADR-011's amendment](../adr/011-auto-update-mechanism.md#amendment-attention-cues-2026-07). Best-effort and never-interrupt, mirroring the rest of the update path.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `UpdateNotifier` | class — constructed with `(onDownload, logger?)` | [update-notifier.ts](../../src/update-notifier.ts) |
| `UpdateNotifier.handle(state)` | `(UpdateState) => void` — notify once on a transition | [update-notifier.ts](../../src/update-notifier.ts) |
| `UpdateNotifier.announceInstalled(version)` | `(string) => void` — post-restart confirmation | [update-notifier.ts](../../src/update-notifier.ts) |

Module-private: `show()` (the guarded, best-effort `Notification` wrapper) and the `lastStatus` transition latch.

## Responsibilities

- Fire a notification only on the **transition into** `available` / `downloaded` (tracked via `lastStatus`), so a repeated push of the same status never re-notifies.
- Wire the notifications per the "download auto, restart passive" decision: the `available` notification's click calls the injected `onDownload` (consent to download — nothing installs); the `downloaded` notification is informational only.
- Expose `announceInstalled()` for `main.ts`'s one-time post-restart confirmation.
- Stay best-effort: guard on `Notification.isSupported()` and swallow-and-log any failure — never throw.

## Non-Goals

- **No install/restart** — the notifier never calls `quitAndInstall()`; that stays the tray's sole click site (see [main.md](./main.md), [ADR-011](../adr/011-auto-update-mechanism.md)).
- **No badge** — the tray-icon dot is owned by [tray](./tray.md) / [tray-icon](./tray-icon.md).
- **No error surfacing** — failed checks/downloads stay logged-and-quiet; the notifier ignores the `error` state.
- **No version persistence** — `main.ts` reads/writes `lastRunVersion` via [settings](./settings.md) and decides whether to call `announceInstalled()`.

## How It Works

`main.ts` constructs the notifier with `() => void updates.downloadUpdate()` and fans `UpdateService.onState` out to both `tray.renderUpdate(state)` and `updateNotifier.handle(state)`. For the post-restart confirmation, `main.ts` reads the previous `lastRunVersion`, records the running `app.getVersion()`, and calls `announceInstalled()` once when they differ. — [main.ts](../../src/main.ts)

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `UpdateState` / `UpdateStatus` | the lifecycle snapshot the notifier reacts to | [types.ts#UpdateState](../../src/types.ts) |

## Invariants & Failure Modes

- **Once per transition**: `lastStatus` gates every notification, so re-pushing the same state is a no-op.
- **Never installs**: the only click handler wired is the `available` → download path; `downloaded` has none.
- **Best-effort**: unsupported platform or a `Notification` throw degrades to a logged warning, never a crash or an unhandled rejection.

## Related Files

- [update-service.ts](../../src/update-service.ts) → [update-service.md](./update-service.md) — produces the `UpdateState` the notifier reacts to.
- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — the companion icon badge for the same transitions.
- [main.ts](../../src/main.ts) → [main.md](./main.md) — constructs the notifier, fans out `onState`, and drives the post-restart confirmation.
- Feature: [auto-update.md](../features/auto-update.md); decision: [adr/011](../adr/011-auto-update-mechanism.md).
