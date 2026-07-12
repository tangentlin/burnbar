# ADR-009: Rich menu "stats card" via a hidden-window canvas

## Status

Accepted

## Context

The tray menu showed today/all-time usage as plain native rows plus a monochrome 30-day spend **sparkline** (a hand-rolled template-image PNG, [the former `src/sparkline.ts`]). The goal became a CodexBar-style glance: bigger, formatted figures (today + 30-day spend/tokens), a colored bar chart, and the top model — all in the menu.

Native macOS menus can't express this: `Menu.buildFromTemplate` labels are fixed-size plain text (no large/bold type, no two-column grid, no color). The only rich surface a native menu item offers is its **icon** — a `NativeImage`. So the card has to be a **bitmap** drawn by us. Two sub-questions: (1) keep the native menu and embed a rich image, or replace the whole menu with a custom popover window; and (2) how to rasterize text + gradients into that image, since nothing in the app could draw text to a PNG (the sparkline encoder only drew rectangles).

## Decision

- **Rich PNG in the native menu**, not a custom popover. Keep `Menu.buildFromTemplate`; replace the usage rows + sparkline with one image menu item (the card), and keep Refresh / Auto-Refresh / Open Dashboard / About / Quit as native rows. Far smaller change than rebuilding the menu as a frameless `BrowserWindow` popover, and it keeps native focus/keyboard/positioning behavior.
- **The card is a display-only banner**, rendered `enabled: false` so it doesn't highlight on hover; the drill-down is the native "Open Usage Dashboard…" row placed directly beneath it (which, with Refresh, carries a small template-image glyph drawn by the same canvas).
- **Transparent card background, theme-adaptive text.** The card draws no fill — its content sits directly on the menu surface so it blends in rather than reading as a floating box. Because there's no background to guarantee contrast, the bold value text adapts to the menu appearance (`nativeTheme.shouldUseDarkColors` → light text on dark menus, dark text on light); the muted labels, warm bars, and template-tinted icons read on both. The appearance is part of the card's data signature, and the tray re-renders on `nativeTheme` "updated", so a light/dark switch repaints the card.
- **Draw the card in a hidden `BrowserWindow` via Canvas 2D.** A never-shown window ([menu-card-window.ts](../../src/menu-card-window.ts)) loads a tiny page ([src/menu-card/](../../src/menu-card/)) exposing `window.__burnbarDrawCard(data)`, which paints an off-DOM `<canvas>` and returns a PNG **data URL** via `toDataURL`. The main process decodes it into a `NativeImage` tagged `scaleFactor: 2` (logical 270×212, drawn at 2× for retina). The window is created once and reused.
- **Read off the canvas, not the compositor.** `toDataURL` is deterministic and independent of window visibility/GPU compositing — unlike `webContents.capturePage()` on a hidden window, which depends on the compositor painting. This sidesteps the classic "blank capture from an invisible window" failure.
- **A self-contained dark card, not a template image.** The card draws its own opaque dark background and warm bars, so it reads identically on light and dark menus. It is therefore **not** a macOS template image (those are monochrome alpha masks the OS tints) — the trade is that the card no longer auto-tints, which is fine because it's a deliberate dark "widget." The tray *icon* stays a template image.
- **All-time usage leaves the menu.** The card mirrors CodexBar's today + 30-day figures; all-time remains available in the dashboard.

## Consequences

- (+) Crisp, formatted, colored stats in the menu with full layout control (fonts, gradients, grid) — the look the feature wanted.
- (+) No new runtime/native dependency and no packaging change: rendering reuses Electron's own `BrowserWindow` + esbuild bundling (the same toolchain as the dashboard). The browser page is type-checked via `tsconfig.dashboard.json`.
- (+) Deterministic and cheap after warm-up: the window is reused (cold render ~0.5s incl. creation; warm ~ms). The tray re-rasterizes only when the card data changes (signature cache), so the 60s label tick is free.
- (+) Robust: a render failure returns `null` and the tray falls back to a plain-text "Today's Usage" row — the menu never breaks.
- (−) The card is an image: its text isn't selectable and doesn't honor Dynamic Type / accessibility text scaling, and a tall image menu item is an unusual (though supported) construct.
- (−) Rendering now requires a hidden helper window alive for the app's lifetime (disposed at quit) — a little more lifecycle than the pure-function sparkline encoder it replaced.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Custom frameless popover window (full CodexBar fidelity) | The truest match, but a large rewrite that abandons the native menu and re-implements focus/positioning/keyboard; out of proportion to the ask. |
| `@resvg/resvg-js` at runtime (SVG → PNG) | Synchronous and testable, but it's a **native** module with per-arch binaries; under pnpm only the host arch is installed, so the x64/universal release builds would ship a broken binary without extra packaging work. The hidden-window canvas avoids any native dep. |
| `webContents.capturePage()` on the hidden window | Depends on the compositor painting an invisible window — flaky/blank in practice; `toDataURL` off a canvas is deterministic. |
| Hand-rolled bitmap font in the existing PNG encoder | No deps and pure, but blocky/dated glyphs and a large glyph table — it undermines the "reads bigger & polished" goal. |
| Keep the template-image sparkline, just enlarge it | Template images are monochrome alpha masks — no color, and still no real text; can't reach the CodexBar look. |

## Amendment: appearance source corrected (2026-07)

`MenuCardData.dark` (the theme-adaptive value-text switch, decision bullet above) was originally read straight from `nativeTheme.shouldUseDarkColors`, which is documented as unreliable for the tray/menu-bar specifically and produced illegible text on a real dark menu bar. It now reads from `TrayManager`'s corrected `appearance` field, resolved via [appearance.ts#detectAppearance](../../src/appearance.ts). Same trigger points (cold start, an update-state transition, `nativeTheme` "updated") and the same "appearance is part of the card's data signature" behavior — only the source of truth changed. Full root cause and fix: [ADR-011's reliable-detection amendment](./011-auto-update-mechanism.md#amendment-reliable-menu-bar-appearance-detection-2026-07).
