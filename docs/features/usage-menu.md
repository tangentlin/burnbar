# Feature: Usage Breakdown Menu

## User Story

As a Claude Code user, I want a click to reveal today's and all-time cost and token counts, a 30-day spend glance, when it last updated, and controls to refresh or change the cadence — plus a way to quit.

## Scope

**Includes:** context menu with "Today's Usage" and "All-Time Usage" (cost + tokens); a clickable **30-day spend sparkline** (opens the dashboard); a relative-time "Updated …" row; "Refresh Now"; an "Auto-Refresh" submenu (Manual / 5 / 10 / 15 / 30 / 60 min); "Open Usage Dashboard…"; "Quit"; empty and error fallbacks.
**Excludes:** free-form interval entry (presets only; a non-preset value set in `settings.json` is honored and shown as "Custom"); editing usage rows (every usage row stays `enabled: false`).

The sparkline (a template `NativeImage`), last-updated formatting, and Auto-Refresh submenu are detailed in [modules/tray.md](../modules/tray.md); the cadence/persistence lives in [features/usage-refresh.md](./usage-refresh.md).

## UX Flow

### Success State
Two sections, each with `  Cost: $X.XX` and `  Tokens: N,NNN` (locale-grouped). — [tray.ts:112-120](../../src/tray.ts#L112-L120), [tray.ts:135-143](../../src/tray.ts#L135-L143)

### Empty State
No today entry → "  No usage today". No totals → "  No usage data". — [tray.ts:121-126](../../src/tray.ts#L121-L126), [tray.ts:144-149](../../src/tray.ts#L144-L149)

### Error State
ccusage failed → single disabled row "Error loading usage data" (sections skipped); Quit still present. — [tray.ts:84-101](../../src/tray.ts#L84-L101)

## Acceptance Criteria

- [ ] Menu shows today + all-time cost and tokens when data exists. — [tray.ts:106-150](../../src/tray.ts#L106-L150)
- [ ] Tokens are thousands-separated via `toLocaleString()`. — [tray.ts:118](../../src/tray.ts#L118), [tray.ts:141](../../src/tray.ts#L141)
- [ ] On error, only the error row + Quit appear. — [tray.ts:84-101](../../src/tray.ts#L84-L101)
- [ ] Quit always present and calls `app.quit()`. — [tray.ts#buildMenuItems](../../src/tray.ts)
- [ ] An "Open Usage Dashboard…" item sits above Quit and opens the dashboard. — [tray.ts#buildMenuItems](../../src/tray.ts), [features/usage-dashboard.md](./usage-dashboard.md)
- [ ] Menu rebuilt on every pushed update (no stale rows). — [tray.ts#render](../../src/tray.ts)

## Data Model (Conceptual)

Consumes `UsageData` in full (`daily`, `total`, `error`). — [DOMAIN.md](../DOMAIN.md)

## State Transitions

```mermaid
stateDiagram-v2
    [*] --> Building
    Building --> ErrorMenu: usageData.error
    Building --> DataMenu: no error
    DataMenu --> DataMenu: refresh rebuilds
    ErrorMenu --> DataMenu: data returns
```

## Code Touchpoints

| Concern | File |
|---------|------|
| Menu assembly | [tray.ts#buildMenuItems](../../src/tray.ts) |
| Today rows | [tray.ts#addDailyUsageItems](../../src/tray.ts) |
| All-time rows | [tray.ts#addTotalUsageItems](../../src/tray.ts) |
| Data | [capture.ts#toUsageData](../../src/capture.ts#L124) pushed via [CaptureService](../../src/capture-service.ts) |

## Known Pitfalls

- Rows are intentionally **disabled** (display-only); adding an actionable item means a real `click` handler.
- Row labels carry a leading two-space indent (`  Cost:`) for visual nesting. — [tray.ts:114](../../src/tray.ts#L114)
