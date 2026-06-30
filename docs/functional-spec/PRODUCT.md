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
- **MUST** offer an "Open Usage Dashboard…" action directly beneath the card, an "About Burnbar" link to the project page, and a Quit action; the Dashboard and Refresh actions carry icons.
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
- **MUST** build macOS artifacts for Intel and Apple Silicon.
- **MUST** support optional signing + notarization without source edits.
- **MUST** still build successfully without any signing credentials (unsigned).

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

## Out of Scope

- Budgets, alerts, or spend projections.
- Cloud sync, export pipelines, or multi-machine archive merge.
- Auto-update mechanism.
- Windows / Linux builds.
- Reconciling against official provider billing (explicitly a non-goal; figures are estimates). — [README.md](../../README.md)
