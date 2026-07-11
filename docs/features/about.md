# Feature: About / Credits

## User Story

As a Burnbar user, I want a proper "About" window instead of a straight jump to GitHub, so I can see who and what the app is built on and reach the maintainer's other links.

## Scope

**Includes:** a small, non-resizable window showing the app icon, name, and version; a "View Burnbar on GitHub" callout; a credits list (ccusage, the forked-from app + original author, the icon artist), each linking to its source; footer links to the maintainer's GitHub and X profiles. Every link opens in the system browser.
**Excludes:** any dynamic/archived data (this window reads nothing from the archive or ccusage); IPC or a preload bridge (the app version is the only dynamic value, passed via the `loadFile` query string); in-app navigation to any of the linked sites.

## UX Flow

### Success State
Clicking "About Burnbar `<version>`" in the tray menu opens (or focuses) the About window: logo, "Burnbar", "Version X.Y.Z", tagline, GitHub callout button, the credits list, then the footer social links. — [tray.ts:298](../../src/tray.ts#L298), [about-window.ts](../../src/about-window.ts)

### Link Click
Any link (callout, a credit, a footer icon) opens in the system default browser; the About window itself never navigates. — [about-window.ts#setWindowOpenHandler](../../src/about-window.ts)

## Acceptance Criteria

- [ ] "About Burnbar `<version>`" in the tray menu (version from `app.getVersion()`) opens the About window, reusing/focusing an already-open instance rather than duplicating it. — [tray.ts:298](../../src/tray.ts#L298), [about-window.ts](../../src/about-window.ts)
- [ ] The window shows the app icon, "Burnbar", the running version, a "View Burnbar on GitHub" callout linking to the project repo, and three credits (ccusage, the forked-from app + author, the icon artist), each a clickable link. — [src/about/index.html](../../src/about/index.html)
- [ ] Footer links to the maintainer's GitHub and X profiles. — [src/about/index.html](../../src/about/index.html)
- [ ] Every link opens externally (`shell.openExternal`), never inside the window — enforced by both `setWindowOpenHandler` (target="_blank" links) and a `will-navigate` backstop. — [about-window.ts](../../src/about-window.ts)

## Data Model (Conceptual)

None — the page is static markup; the only runtime value is `app.getVersion()`, threaded through as a URL query parameter and rendered client-side. — [about-window.ts](../../src/about-window.ts), [src/about/about.ts](../../src/about/about.ts)

## Code Touchpoints

| Concern | File |
|---------|------|
| Menu row (label + click) | [tray.ts:298](../../src/tray.ts#L298) |
| Window lifecycle + external-link guard | [about-window.ts](../../src/about-window.ts) |
| Content (credits, links, layout) | [src/about/index.html](../../src/about/index.html), [src/about/about.css](../../src/about/about.css) |
| Version injection | [src/about/about.ts](../../src/about/about.ts) |
| Wiring | [main.ts](../../src/main.ts) (`onAbout: () => about.open()`) |

## Known Pitfalls

- This window has **no preload and no IPC** — it's the only Burnbar window that doesn't need one. Don't add a data dependency here; if the page ever needs live data, give it its own read-only channel rather than reaching into the archive directly.
- `will-navigate` never fires for the window's own initial `loadFile()` — only for a user/page-initiated navigation — so the guard can unconditionally `preventDefault()` without racing the page load. — [about-window.ts](../../src/about-window.ts)
- The window is fixed-size and non-resizable by design (an About panel, not a document); if the credits list grows, `about.css`'s `overflow-y: auto` is the safety net, not a reason to skip re-checking the window height.
