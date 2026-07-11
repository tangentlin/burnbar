# Burnbar — Product Specification

> Implementation-agnostic. Describes WHAT Burnbar does, not HOW. See [ARCHITECTURE.md](../ARCHITECTURE.md) for HOW.

## Personas & Goals

| Persona | Goal |
|---------|------|
| Claude Code user | Watch today's spend at a glance; check all-time totals occasionally. |
| Privacy-conscious user | Be sure nothing leaves the machine — local files only. |
| Maintainer | Ship signed/notarized macOS builds reproducibly. |

## Functional Requirements

### Live Cost Indicator
- **MUST** display today's cost in the macOS menu bar.
- **MUST** keep it current automatically (no user action).
- **MUST** show nothing (icon only) when there is no usage today or data can't be read.

### Usage Breakdown
- **MUST** show, on click, an at-a-glance card with today's and 30-day spend and token counts, a recent spend-over-time chart, and the top model by cost.
- **MUST** format tokens compactly and cost as USD; the card is a display-only banner (not selectable).
- **MUST** offer an "Open Usage Dashboard…" action directly beneath the card, an "About Burnbar" link (labeled with the app version) to the project page, and a Quit action; the Dashboard and Refresh actions carry icons.
- **MUST** degrade to a plain-text today's-usage row when the card can't be rendered, and to a clear error indication when usage data can't be read.

### Durable Usage Archive
- **MUST** persist usage history locally so it survives the source tools purging their logs.
- **MUST** back fill as far as the source logs still hold on first run, then keep merging.
- **MUST** never shrink or erase what was already recorded when a later read reports less.
- **MUST** store **numbers only** — never conversation content or raw logs.
- **MUST NOT** transmit archived data off the machine; it lives only under the app's data dir.
- **MUST** be best-effort — a capture failure never disrupts the menu bar.

### Usage Dashboard
- **MUST** open an in-app graph of accumulated usage from the archive (not live ccusage).
- **MUST** offer cost over time, plus breakdowns by model and by agent.
- **MUST** offer 30-day / 90-day / all-time range presets.
- **MUST** keep working — showing history — even after the source logs are purged.

### Data Source
- **MUST** compute usage from local agent-CLI logs via ccusage (Claude Code, Codex, …).
- **MUST** compute usage from local Claude Code logs via ccusage.
- **MUST** work regardless of Claude Code's backend (Anthropic / Vertex AI / Bedrock).
- **MUST NOT** make network calls or require accounts/API keys.
- **MUST** be self-contained — no external `node` or `ccusage` install required at runtime.

### Distribution
- **MUST** build macOS artifacts for Apple Silicon (arm64). Intel/x64 is unsupported: ccusage's per-arch native binary is only installed for the build host's arch, so an x64 artifact would ship without a working binary.
- **MUST** support optional signing + notarization without source edits.
- **MUST** still build successfully without any signing credentials (unsigned).

### Auto-Update
- **MUST** make the two actions that need the user — Download and Restart — discoverable without opening the menu: a colored **badge** on the menu-bar icon and an **OS notification** on each of those transitions (plus a one-time post-restart confirmation). No in-app window.
- **MUST NOT** download an update without an explicit user action (clicking the "available" notification counts as that action; it starts only the download).
- **MUST NOT** install/restart without an explicit user action ("Restart to Update") — never automatically, never mid-use, and never from a notification click.
- **MUST** only install signed + notarized payloads (enforced by the OS-level updater, not hand-rolled).
- **MUST** keep checking for updates on a fixed background cadence independent of the user-configurable usage-refresh interval.
- **MUST** be best-effort — a failed check or download never crashes or blocks the tray, and never fires a notification (failures stay logged-and-quiet).

## Non-Functional Requirements

- **Privacy**: read-only access to the source logs; the archive holds numbers only and stays on-device; zero telemetry/network.
- **Footprint**: a tray app plus one on-demand dashboard window; no background services.
- **Platform**: macOS Monterey (12)+ (Electron 42 / Chromium baseline); Ventura (13)+ practically tested. — [README.md](../../README.md)
- **Freshness**: visible cost as fresh as the chosen refresh interval (default 15 min; manual + "Refresh Now" available); the archive captures on the same cadence and on quit.

## Conceptual Data Model

```mermaid
erDiagram
    USAGE ||--|| TODAY : has
    USAGE ||--|| ALL_TIME : has
    ARCHIVE ||--o{ DAY : "per local date"
    ARCHIVE ||--o{ SESSION : "per agent session"
    DAY { number cost; number tokens; string[] agents }
    SESSION { string agent; number cost; number tokens }
    TODAY { number cost; number tokens }
    ALL_TIME { number cost; number tokens }
```

## User Journeys

### Watch today's spend
1. Launch Burnbar (or it auto-runs at login if configured by the user).
2. Glance at the menu bar — today's `$` cost is shown.
3. It updates itself as the day goes on.

**Edge cases:** no usage yet today → blank title; ccusage unreadable → blank title + error row in menu.

### Check recent spend
1. Click the menu-bar icon.
2. Read the stats card — today's and 30-day cost + tokens, the spend chart, and the top model.
3. Choose "Open Usage Dashboard…" (just below the card) for all-time totals and breakdowns, or Quit from the same menu.

### Review usage history
1. Open "Open Usage Dashboard…" from the tray menu.
2. Read cost over time; toggle by-model / by-agent; switch 30d / 90d / All.
3. The graph reflects the durable archive — it still shows history after the source logs are purged.

### Ship a release (maintainer)
1. Set signing + notary env vars (or none for a local unsigned build).
2. Run the macOS dist command.
3. Distribute the signed, notarized `.dmg`/`.zip`.

### Update to the latest release
1. Burnbar checks GitHub Releases in the background every few hours (or the user clicks "Check for Updates" in the tray).
2. When a newer signed release is found, the tray row becomes "Download Update (vX.Y.Z)...", the menu-bar icon gains a **blue dot**, and a notification appears — clicking either the row or the notification downloads.
3. Once downloaded, the row becomes "Restart to Update", the icon dot turns **orange**, and a notification says it's ready — clicking the tray row installs and relaunches. Nothing installs before this click (the notification is informational).
4. After relaunching on the new version, a one-time notification confirms "Burnbar updated".

**Edge cases:** check/download fails → row falls back to "Check for Updates", badge clears, failure logged only (no notification); no newer release → row stays "Check for Updates".

## Out of Scope

- Budgets, alerts, or spend projections.
- Cloud sync, export pipelines, or multi-machine archive merge.
- Windows / Linux builds.
- Reconciling against official provider billing (explicitly a non-goal; figures are estimates). — [README.md](../../README.md)
