# Module: menu-card-window

## Purpose

Rasterizes the tray's stats-card bitmap by driving a hidden, never-shown `BrowserWindow`. The main process can't draw text/gradients into a PNG on its own, so this owns a tiny offscreen renderer page ([menu-card](./menu-card.md)) and turns `MenuCardData` into a retina `NativeImage` the [tray](./tray.md) attaches as its hero menu item.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `MenuCardRenderer` | class (`render`, `renderIcon`, `dispose`) | [menu-card-window.ts](../../src/menu-card-window.ts) |

`render(data: MenuCardData): Promise<NativeImage | null>` — the colored stats card. `renderIcon(name: "refresh" | "dashboard"): Promise<NativeImage | null>` — a menu-row glyph returned as a **template** image (`setTemplateImage(true)`, so macOS tints it). Both return `null` on any failure (the tray falls back gracefully). `dispose()` destroys the hidden window. Module-private: `rasterize()` (the shared eval-and-decode step), `ensureWindow()` (lazy, once), and the `SCALE` / data-URL-prefix constants.

## Responsibilities

- Lazily create one hidden `BrowserWindow` (`show: false`, `contextIsolation: true`, `nodeIntegration: false`, `backgroundThrottling: false`) and resolve when its page has loaded; reuse it across every later render. — [ensureWindow](../../src/menu-card-window.ts)
- Drive the page's draw globals via `webContents.executeJavaScript` (shared `rasterize`): `render` calls `__burnbarDrawCard(data)` (colored card); `renderIcon` calls `__burnbarDrawIcon(name)` and flags the result a **template** image. Both decode the returned PNG **data URL** into a `NativeImage` tagged `scaleFactor: SCALE` so it shows crisp on retina menus. — [render](../../src/menu-card-window.ts), [renderIcon](../../src/menu-card-window.ts)
- Be best-effort: guard a destroyed window, validate the returned string is a PNG data URL, and swallow errors into a `null` return (logged) so a render failure never crashes the tray. — [rasterize](../../src/menu-card-window.ts)
- Destroy the window on `dispose` (called by `main` at quit). — [dispose](../../src/menu-card-window.ts)

## Non-Goals

- **No drawing** — the canvas layout, fonts, colors, and number formatting live in the browser-context [menu-card](./menu-card.md) page.
- **No `capturePage`** — output is read off the canvas (`toDataURL`), not the compositor, so it's deterministic regardless of window visibility/GPU state. See [adr/009](../adr/009-menu-stats-card.md).
- No data derivation — `MenuCardData` is assembled by the [tray](./tray.md) from `TrayState` (the derived `MenuCard` + today's numbers).
- No caching — the **tray** decides when to call `render` (only when the card data changed); this module renders every time it's asked.

## How It Works

The first call (the tray's startup `loadIcons`, or the first card `render`) creates the hidden window and `loadFile`s `dist/menu-card/index.html`; `ensureWindow` memoizes the load promise so subsequent renders reuse the same window (cold render ≈ window-create + page-load, ~0.5s; warm renders are a few ms). `rasterize` evaluates a draw expression in the page's main world (reachable by `executeJavaScript` even with `contextIsolation` on, because that option isolates the *preload*, not injected evaluations). The page paints an off-DOM `<canvas>` at 2× and returns `canvas.toDataURL("image/png")`; the base64 payload is decoded and wrapped via `nativeImage.createFromBuffer(png, { scaleFactor: SCALE })`. `renderIcon` additionally calls `setTemplateImage(true)` so the glyph tints to the menu foreground.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `MenuCardData` | the figures + today's numbers the card draws | [types.ts#MenuCardData](../../src/types.ts) |

## Invariants & Failure Modes

- **Single reused window**: created once, never shown, destroyed only on `dispose`; it intentionally keeps a window alive so macOS (tray-only) doesn't quit on dashboard close. — [ensureWindow](../../src/menu-card-window.ts)
- **Null-on-failure contract**: a destroyed window, a non-PNG return, or a thrown error all yield `null`; the [tray](./tray.md) renders a plain-text fallback in that case. — [render](../../src/menu-card-window.ts)
- **Retina contract**: the page draws at `SCALE`× device pixels and the image is tagged `scaleFactor: SCALE`, so the logical size matches the design (270×212). Changing one without the other distorts the menu image. — [menu-card-window.ts](../../src/menu-card-window.ts), [menu-card](./menu-card.md)

## Extension Points

- Resize/restyle the card: edit [menu-card](./menu-card.md); if the logical size or device scale changes, keep `SCALE` in sync.
- Warm the window earlier (avoid the first-render latency) by calling `render` once at startup, or add an explicit prewarm that runs `ensureWindow`.

## Related Files

- [menu-card/](../../src/menu-card/) → [menu-card.md](./menu-card.md) — the browser page this drives.
- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — the sole consumer; caches the `NativeImage` and attaches it.
- [main.ts](../../src/main.ts) → [main.md](./main.md) — constructs and disposes the renderer.
- [window.ts](../../src/window.ts) → [window.md](./window.md) — the sibling (visible) dashboard `BrowserWindow`.
- [adr/009-menu-stats-card.md](../adr/009-menu-stats-card.md) — why a hidden-window canvas instead of a template sparkline or a native renderer.
