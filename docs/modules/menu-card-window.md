# Module: menu-card-window

## Purpose

Rasterizes the tray's stats-card bitmap — one animation frame at a time since [ADR-013](../adr/013-menu-card-animation-framework.md) — by driving a hidden, never-shown `BrowserWindow`. The main process can't draw text/gradients into a PNG on its own, so this owns a tiny offscreen renderer page ([menu-card](./menu-card.md)) and turns `MenuCardData` into a retina `NativeImage` the [tray](./tray.md) attaches as its hero menu item. It answers "what does frame `nowMs` look like"; *when* to ask for another frame is [card-animator.ts](./card-animator.md)'s job.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `MenuCardRenderer` | class (`renderFrame`, `setEmbersActive`, `renderIcon`, `dispose`) | [menu-card-window.ts](../../src/menu-card-window.ts) |

`renderFrame(data: MenuCardData, nowMs: number): Promise<{ image: NativeImage | null; animating: boolean }>` — one frame of the stats card as of `nowMs` (embers resolve for that instant); `animating` tells the caller whether to schedule another frame. `setEmbersActive(active: boolean, nowMs: number): Promise<void>` — start or stop the ember-particle loop; `renderIcon(name: "refresh" | "dashboard"): Promise<NativeImage | null>` — a menu-row glyph returned as a **template** image (`setTemplateImage(true)`, so macOS tints it). `renderFrame`/`renderIcon` return `null` on any failure (the tray falls back gracefully). `dispose()` destroys the hidden window. Module-private: `rasterize()` (the shared eval-and-decode step, used by `renderIcon`), `ensureWindow()` (lazy, once), and the `SCALE` / data-URL-prefix constants.

## Responsibilities

- Lazily create one hidden `BrowserWindow` (`show: false`, `contextIsolation: true`, `nodeIntegration: false`, `backgroundThrottling: false`) and resolve when its page has loaded; reuse it across every later render. — [ensureWindow](../../src/menu-card-window.ts)
- Drive the page's draw globals via `webContents.executeJavaScript`: `renderFrame` calls `__burnbarRenderCardFrame(data, nowMs)` and decodes its `{ png, animating }` result into a `NativeImage` tagged `scaleFactor: SCALE` (crisp on retina menus) plus the passthrough `animating` flag; `setEmbersActive` calls `__burnbarSetEmbersActive(active, nowMs)` (fire-and-forget, no return value); `renderIcon` uses the shared `rasterize` helper to call `__burnbarDrawIcon(name)` and flags the result a **template** image. — [renderFrame](../../src/menu-card-window.ts), [setEmbersActive](../../src/menu-card-window.ts), [renderIcon](../../src/menu-card-window.ts)
- Be best-effort: guard a destroyed window, validate the returned payload shape, and swallow errors into a `null`/no-op (logged) so a render failure never crashes the tray. — [renderFrame](../../src/menu-card-window.ts), [rasterize](../../src/menu-card-window.ts)
- Destroy the window on `dispose` (called by `main` at quit). — [dispose](../../src/menu-card-window.ts)

## Non-Goals

- **No drawing, no animation timing** — the canvas layout, fonts, colors, number formatting, and the tween/particle math live in the browser-context [menu-card](./menu-card.md) page. This module only shuttles one `(data, nowMs)` request per call and decodes the result.
- **No frame scheduling** — *whether* to call `renderFrame` again, the bounded-run safety cap, and the ember on/off lifecycle are [card-animator.ts](./card-animator.md)'s job, composed by the [tray](./tray.md).
- **No `capturePage`** — output is read off the canvas (`toDataURL`), not the compositor, so it's deterministic regardless of window visibility/GPU state. See [adr/009](../adr/009-menu-stats-card.md).
- No data derivation — `MenuCardData` is assembled by the [tray](./tray.md) from `TrayState` (the derived `MenuCard` + today's numbers).
- No caching — the **tray**/`CardAnimator` decide when to call `renderFrame`; this module renders every time it's asked.

## How It Works

The first call (the tray's startup `loadIcons`, or the first card frame) creates the hidden window and `loadFile`s `dist/menu-card/index.html`; `ensureWindow` memoizes the load promise so subsequent renders reuse the same window (cold render ≈ window-create + page-load, ~0.5s; warm renders are a few ms). `renderFrame` evaluates `window.__burnbarRenderCardFrame(${JSON.stringify(data)}, ${nowMs})` in the page's main world (reachable by `executeJavaScript` even with `contextIsolation` on, because that option isolates the *preload*, not injected evaluations) — Electron serializes the returned plain object across the CDP boundary, so no manual `JSON.stringify`/`parse` is needed for the `{ png, animating }` result. The base64 PNG payload is decoded and wrapped via `nativeImage.createFromBuffer(png, { scaleFactor: SCALE })`. `setEmbersActive` is the same shape without a payload to decode. `renderIcon` goes through the older single-string `rasterize` helper (a PNG data-URL string, not an object) and additionally calls `setTemplateImage(true)` so the glyph tints to the menu foreground.

## Key Types

| Type | Purpose | File |
|------|---------|------|
| `MenuCardData` | the figures + today's numbers the card draws | [types.ts#MenuCardData](../../src/types.ts) |
| `CardFrame` | the `{ png, animating }` shape `renderFrame` decodes | [types.ts#CardFrame](../../src/types.ts) |

## Invariants & Failure Modes

- **Single reused window**: created once, never shown, destroyed only on `dispose`; it intentionally keeps a window alive so macOS (tray-only) doesn't quit on dashboard close. — [ensureWindow](../../src/menu-card-window.ts)
- **Null-on-failure contract**: a destroyed window, a malformed/missing payload, or a thrown error all yield `{ image: null, animating: false }` (or a swallowed no-op for `setEmbersActive`); the [tray](./tray.md) renders a plain-text fallback the first time `image` is null. — [renderFrame](../../src/menu-card-window.ts)
- **Retina contract**: the page draws at `SCALE`× device pixels and the image is tagged `scaleFactor: SCALE`, so the logical size matches the design (270×212). Changing one without the other distorts the menu image. — [menu-card-window.ts](../../src/menu-card-window.ts), [menu-card](./menu-card.md)

## Extension Points

- Resize/restyle the card or tune an animation: edit [menu-card](./menu-card.md)/[animation-config.ts](../../src/menu-card/animation-config.ts); if the logical size or device scale changes, keep `SCALE` in sync.
- Warm the window earlier (avoid the first-render latency) by calling `renderFrame` once at startup, or add an explicit prewarm that runs `ensureWindow`.

## Related Files

- [menu-card/](../../src/menu-card/) → [menu-card.md](./menu-card.md) — the browser page this drives, and the animation math it calls.
- [card-animator.ts](../../src/card-animator.ts) — the main-process frame-poll driver; the sole caller of `renderFrame`/`setEmbersActive`.
- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — owns the `CardAnimator`, caches the resulting `NativeImage`, and attaches it (or mutates a live `MenuItem.icon`).
- [main.ts](../../src/main.ts) → [main.md](./main.md) — constructs and disposes the renderer.
- [window.ts](../../src/window.ts) → [window.md](./window.md) — the sibling (visible) dashboard `BrowserWindow`.
- [adr/009-menu-stats-card.md](../adr/009-menu-stats-card.md) — why a hidden-window canvas instead of a template sparkline or a native renderer. [adr/013-menu-card-animation-framework.md](../adr/013-menu-card-animation-framework.md) — the frame/animation contract.
