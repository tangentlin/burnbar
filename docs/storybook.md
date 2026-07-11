# Storybook — previewing UI states in isolation

Burnbar is a tray-only macOS app, so most visual states normally require launching the whole app on a Mac. Storybook renders the **browser-representable** states on their own — no Electron, no menu bar — for fast iteration and review. It exists to see the [auto-update](./features/auto-update.md) attention cues (the tray-icon **badge** and the **notifications**) and the [menu card's animations](./adr/013-menu-card-animation-framework.md) without a build-and-launch cycle.

## Run

| Action | Command |
|--------|---------|
| Dev server (hot reload) | `pnpm storybook` → http://localhost:6006 |
| Static build | `pnpm build-storybook` → `storybook-static/` (git-ignored) |

Framework: **HTML + Vite** (`@storybook/html-vite`) — no React/Vue, matching the repo's no-framework stance. Telemetry is disabled. Config lives in [`.storybook/`](../.storybook/); stories in [`stories/`](../stories/).

## Layout & conventions

- Stories live in top-level `stories/`, **outside `src/`**, so the Node16 `tsc` build/typecheck never touches them — Vite bundles them and type errors surface via `pnpm build-storybook`, not `pnpm typecheck`.
- Stories import the **real** app modules (not copies), extension-less (`../src/tray-icon`) so Vite resolves the `.ts`; those modules' own imports are type-only, so nothing needs runtime `.js`→`.ts` resolution.
- `assets/` is served at the web root (`staticDirs`), so a story can load the committed tray template at `/icon@2x.png`.

## The stories

- **Update/Tray icon badge** ([badge.stories.ts](../stories/badge.stories.ts)) — runs the actual [`composeBadgedIconBitmap`](./modules/tray-icon.md) against the committed template and paints every `badge × appearance` permutation to a canvas on light/dark menu-bar backgrounds. Because it's the shipped function (now `Uint8Array`-based so it runs in the browser), it faithfully validates dot geometry, contrast, and the glyph recolor. **Caveat:** the story interprets the output as premultiplied **BGRA** consistently, so it can't by itself confirm the macOS channel order — a blue/orange swap can only be ruled out on a real Mac.
- **Update/Notifications** ([notification.stories.ts](../stories/notification.stories.ts)) — mock macOS banners built from the **real** copy in [update-notification-content.ts](../src/update-notification-content.ts), so the exact title/body strings are previewed without an OS notification. A real notification can only be delivered on macOS.
- **Menu Card** ([menu-card.stories.ts](../stories/menu-card.stories.ts)) — drives the **real** `renderCardFrame`/`setEmbersActive`/`drawCard` functions from [src/menu-card/card.ts](./modules/menu-card.md) with a browser `requestAnimationFrame` loop (no Electron, no hidden window): `SettledReference` (the fully static paint), `OdometerDigitRoll` (issue #52 — a "Bump values" button + autoplay), `BarGrowthReveal` (issue #54 — new 30-day data vs. a theme-only toggle that must *not* replay), `EmberParticles` (issue #53 — an "Open menu" toggle), and `FullCardLive` (all three together). Because the engine is a pure function of time (see [ADR-013](./adr/013-menu-card-animation-framework.md)), this is also the frame-rate/flicker **spike** issues #52-#54 asked for before committing to the full build — the ember loop runs at the same ~24fps cadence as the real main-process poller ([card-animator.ts](./modules/card-animator.md)). **Caveat:** it can't confirm whether Electron reflects a live `MenuItem.icon` swap on an *already-open* native macOS menu — that's only verifiable on a real Mac.

## What Storybook can't show

The real `Tray` image on the menu bar and a real OS `Notification` are Electron/OS-native — Storybook previews their *content* (the composited bitmap, the copy), not their live delivery. Those still need `pnpm dev` on a Mac. The delivery **logic** (which transitions fire, click wiring) is covered separately by [test/update-notifier.test.ts](../test/update-notifier.test.ts) via the notifier's injectable presenter. Likewise, the menu card's *animation math* is unit-tested directly ([test/menu-card-animation.test.ts](../test/menu-card-animation.test.ts), [test/card-animator.test.ts](../test/card-animator.test.ts)); Storybook covers what those tests can't — how it actually looks.

## Adding a story

Drop a `*.stories.ts` in `stories/`, import the real pure module you want to exercise, and export one or more `StoryObj`s with a `render` returning a DOM node. Keep any Electron/Node-only code out of the import graph (the browser bundle has neither) — extract the pure part into a shared module first, as `tray-icon.ts` and `update-notification-content.ts` already are.

## Related

- [modules/tray-icon.md](./modules/tray-icon.md), [modules/update-notifier.md](./modules/update-notifier.md), [features/auto-update.md](./features/auto-update.md), [adr/011](./adr/011-auto-update-mechanism.md).
- [modules/menu-card.md](./modules/menu-card.md), [modules/card-animator.md](./modules/card-animator.md), [adr/013](./adr/013-menu-card-animation-framework.md).
