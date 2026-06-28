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
- **MUST** show, on click, today's and all-time cost and token counts.
- **MUST** format tokens with thousands separators and cost as USD with 2 decimals.
- **MUST** offer a Quit action.
- **MUST** degrade to a clear error indication when usage data can't be read.

### Data Source
- **MUST** compute usage from local Claude Code logs via ccusage.
- **MUST** work regardless of Claude Code's backend (Anthropic / Vertex AI / Bedrock).
- **MUST NOT** make network calls or require accounts/API keys.
- **MUST** be self-contained — no external `node` or `ccusage` install required at runtime.

### Distribution
- **MUST** build macOS artifacts for Intel and Apple Silicon.
- **MUST** support optional signing + notarization without source edits.
- **MUST** still build successfully without any signing credentials (unsigned).

## Non-Functional Requirements

- **Privacy**: read-only access to local files; zero telemetry/network.
- **Footprint**: a thin Electron tray app; no windows/renderer.
- **Platform**: macOS Monterey (12)+ (Electron 42 / Chromium baseline); Ventura (13)+ practically tested. — [README.md](../../README.md)
- **Freshness**: visible cost no more than ~60s stale.

## Conceptual Data Model

```mermaid
erDiagram
    USAGE ||--|| TODAY : has
    USAGE ||--|| ALL_TIME : has
    TODAY { number cost; number tokens }
    ALL_TIME { number cost; number tokens }
```

## User Journeys

### Watch today's spend
1. Launch Burnbar (or it auto-runs at login if configured by the user).
2. Glance at the menu bar — today's `$` cost is shown.
3. It updates itself as the day goes on.

**Edge cases:** no usage yet today → blank title; ccusage unreadable → blank title + error row in menu.

### Check all-time totals
1. Click the menu-bar icon.
2. Read Today's Usage and All-Time Usage (cost + tokens).
3. Quit from the same menu if desired.

### Ship a release (maintainer)
1. Set signing + notary env vars (or none for a local unsigned build).
2. Run the macOS dist command.
3. Distribute the signed, notarized `.dmg`/`.zip`.

## Out of Scope

- Per-model / per-project breakdowns, charts, or history beyond today + all-time.
- Auto-update mechanism.
- Windows / Linux builds.
- Reconciling against official provider billing (explicitly a non-goal; figures are estimates). — [README.md](../../README.md)
