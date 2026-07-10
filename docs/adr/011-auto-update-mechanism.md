# ADR-011: Tray-only auto-update via electron-updater + GitHub Releases

## Status

Accepted

## Context

Burnbar ships signed, notarized macOS artifacts (dmg + zip) via GitHub Releases ([ADR-005](./005-env-driven-signing-notarization.md), [features/release-distribution.md](../features/release-distribution.md)), but a user who downloaded an older build had no in-app way to learn a newer one existed short of re-checking GitHub by hand. The distribution epic (#20) called for closing that loop; a prior spike (issue #19) explored the approach but never landed an ADR recording the decision, leaving the choice implicit in the follow-up implementation issue (#33) instead of documented up front. This ADR captures that decision now, alongside the implementation.

Burnbar is a **tray-only, no-window** app by design ([ARCHITECTURE.md](../ARCHITECTURE.md)) — the only UI surface for anything, including an update prompt, is the context menu. And Burnbar already treats interruption-of-use as a hard constraint: capture is best-effort and never blocks/crashes the tray ([capture-service.md](../modules/capture-service.md)). An update mechanism has to fit both constraints: no dialogs/windows, and no unilateral restart while someone is mid-session.

## Decision

- **electron-updater**, configured with the **GitHub provider**, reading its feed (`latest-mac.yml`) from the same signed/notarized Release artifacts electron-builder already produces — no second hosting surface, no Sparkle/Squirrel server to run. macOS updates go through Squirrel.Mac under the hood, which verifies the new payload's code signature before it will install — an unsigned or tampered payload is rejected before `quitAndInstall()` can act on it.
- **`autoDownload = false`, always.** A background 4-hour timer (`UpdateService`, independent of the user-configurable usage-refresh cadence in `settings.ts` — that cadence can be `0`/manual, which must never silently disable update checks) only *checks*. Nothing downloads until the user clicks "Download Update" in the tray.
- **Tray-only UX, one state-driven menu row** — no window, no native dialog, no OS notification. See [Tray-only UX sketch](#tray-only-ux-sketch) below.
- **`quitAndInstall()` fires from exactly one call site**: the tray's "Restart to Update" click. Nothing else — not the download completing, not a timer, not app quit — triggers it. A user can leave a downloaded update pending indefinitely.
- **Errors are logged and swallowed.** A failed check or download degrades the row back to "Check for Updates" (idle-equivalent) with the failure in the log; it never surfaces as a crash, a blocking dialog, or an interruption.
- **CI publish rework**: `electron-builder.config.cjs` gets a `publish: { provider: "github", owner, repo, releaseType }` block, and `dist:mac:ci` moves from `--publish never` to `--publish onTagOrDraft` so electron-builder's own GitHub publisher runs and emits `latest-mac.yml` alongside the dmg/zip on the Release ([release-distribution.md](../features/release-distribution.md), [packaging.md](../modules/packaging.md)). Stable tags keep publishing as a **draft** (manual review before going live); pre-release tags (a hyphen after the version) keep publishing immediately as a GitHub **prerelease** — same policy the previous `gh release create` step encoded, now driven by `releaseType` instead of shell `if`.

### Tray-only UX sketch

Exactly one menu row is always present (never absent — there is no separate "Up to date" row), placed in the About/Open Log Folder/Copy Diagnostics section just above the final separator + Quit. Its label and click behavior are driven entirely by `UpdateService`'s current state:

```
idle / not-available / error  →  "Check for Updates"        (clickable — manual trigger)
checking                      →  "Checking for Updates..."  (disabled)
available                     →  "Download Update (vX.Y.Z)..." (clickable — starts download)
downloading                   →  "Downloading... NN%"        (disabled)
downloaded                    →  "Restart to Update"         (clickable — quitAndInstall)
```

`idle`, `not-available`, and `error` all fold into the same manual "Check for Updates" label/action — there's no dead-end state that requires waiting for the next 4-hour tick.

## Consequences

- (+) No new hosting/signing infrastructure: the update feed rides the same signed, notarized, GitHub-published artifacts the release pipeline already produces.
- (+) Signature verification is enforced by Squirrel.Mac itself (via electron-updater), not hand-rolled — an unsigned or tampered update payload cannot be installed.
- (+) Update install is 100% user-initiated (`autoDownload = false` + single `quitAndInstall()` call site) — never surprises someone mid-session, consistent with Burnbar's best-effort/never-interrupt posture elsewhere in the app.
- (+) Fits the tray-only shape with no new window or native dialog — one state-driven menu row, matching the existing Refresh Now / Auto-Refresh pattern.
- (−) A user who never opens the tray menu (or ignores "Restart to Update" indefinitely) can run a stale build for a long time — acceptable given the "never interrupt" constraint; there is intentionally no nagging/badging beyond the row's own label.
- (−) The CI publish path is now load-bearing for the update feed, not just the human-facing Release page: a broken `publish` config silently drops `latest-mac.yml`, which breaks update detection (not the release itself) until caught. Mitigated with a post-build "verify assets landed" CI step (see [release.yml](../../.github/workflows/release.yml)).
- (−) Draft stable releases don't feed `latest-mac.yml` to real users until published — expected and matches the existing manual-review draft flow; electron-updater only ever looks at the **latest published, non-prerelease-unless-user-opted-in** release.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Sparkle (native macOS updater framework) | Built for native Cocoa apps; Electron's own ecosystem (electron-updater) already wraps Squirrel.Mac with a JS API and GitHub-provider integration — adopting Sparkle directly would mean hand-rolling the appcast feed and a native bridge for no benefit here. |
| Generic HTTP provider (self-hosted feed JSON) instead of the GitHub provider | Requires standing up and maintaining separate hosting; the GitHub provider reads the feed straight off the Release we already publish to, so it's strictly less infrastructure. |
| `autoDownload: true` (download automatically once available) | Starts a background download over whatever network is present, including metered connections, without asking — the issue's boundaries explicitly call this out as "ask first"; not adopted. |
| Auto-restart after download (no explicit click) | Violates the "never force-quit during active use" boundary — a menu-bar app can be relied on continuously; forcing a restart mid-session is the exact interruption Burnbar's best-effort design avoids everywhere else. |
| Native OS notification instead of / in addition to the tray row | Adds a second UI surface and a permissions prompt for a single-purpose, low-frequency signal; the always-visible tray row already covers it without extra chrome. **Superseded** — see the [attention-cues amendment](#amendment-attention-cues-2026-07). |
| Tie the update-check timer to the user-configurable usage-refresh interval (`settings.ts`) | That interval supports `0` (manual/off) by design for usage-refresh; reusing it would silently disable update checks for anyone in manual mode — an unrelated concern coupled for no reason. `UpdateService` owns its own fixed timer instead. |

## Amendment: attention cues (2026-07)

The original decision put the update state solely on **one menu row inside a closed context menu** and explicitly avoided any badge or OS notification. In practice both actions that require the user — **Download Update** (state `available`) and **Restart to Update** (state `downloaded`) — are invisible until the user happens to open the tray menu, so a stale build or a ready-to-install update can sit unnoticed indefinitely. This amendment adds two low-touch attention cues while preserving every safety invariant above (no auto-download, no auto-restart, signed-only, failures stay quiet). It supersedes the "intentionally no nagging/badging" consequence and the "native OS notification — not chosen" alternative row.

- **Tray-icon badge.** When an update needs attention the menu-bar icon gains a colored dot, distinct per pending action (blue = download available, orange = restart ready); every other state shows the plain icon. The committed asset stays a monochrome **template** ([ADR-004](./004-template-tray-icon.md)); the badged variant is composited at runtime into a **non-template** image (recolor the glyph for the current appearance + stamp the dot), so ADR-004's template contract is unchanged for the default icon. — [tray-icon.ts](../../src/tray-icon.ts), [tray.ts](../../src/tray.ts).
- **OS notifications** on the two transitions that need action, plus a one-time post-restart confirmation — never on errors (failures stay logged-and-quiet, as before). Fired once per transition, best-effort (`Notification.isSupported()` guarded, failures logged). — [update-notifier.ts](../../src/update-notifier.ts).
- **The `quitAndInstall()` single-call-site invariant is untouched.** Per the "download auto, restart passive" choice: clicking the `available` notification starts the **download** (`downloadUpdate()` — a click is consent, and nothing installs), while the `downloaded` notification is **informational only** — the restart still happens exclusively from the tray's "Restart to Update" click. The post-restart confirmation is detected by comparing the running `app.getVersion()` to a `lastRunVersion` persisted in [settings.ts](../../src/settings.ts).

### Amended consequences

- (+) The two required actions are now discoverable without opening the menu — the icon badge is always visible and the notification actively surfaces the transition.
- (−) Notifications are a second UI surface and may trigger a first-run macOS permission prompt (the tradeoff the original ADR declined). Scoped to the two actionable transitions + one post-update confirmation, once each — no repeats, no error noise — to stay within the "never nag" posture.
- (−) The default tray icon stays a template, but the *badged* variant is a runtime-composited non-template image, so its light/dark correctness is handled in code (keyed off `nativeTheme`) rather than by macOS auto-tinting.
