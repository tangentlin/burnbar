# ADR-013: A time-based animation framework for the menu card

## Status

Accepted, with one open verification item (see [Consequences](#consequences)).

## Context

Three enhancement issues (#52, #53, #54) each asked for a different animation on the tray's stats card ([ADR-009](./009-menu-stats-card.md)): digits that roll like an odometer when a value changes, the 30-day bar chart growing from its baseline instead of snapping to full height, and a few ember particles drifting over the bars while the menu is open. All three feasibility notes independently converged on the same shape: "kick off a short animation, capture a few interim frames, then hand off a final static PNG" — and #54 explicitly called itself out as "a good candidate to build first/validate the pattern the odometer and ember-particle ideas would also need."

That convergence made three one-off implementations the wrong call. The real problem was: `card.ts` draws one PNG per call ([menu-card.md](../modules/menu-card.md)), driven by `MenuCardRenderer.render()` making one `executeJavaScript` round-trip into a hidden, never-shown `BrowserWindow`. Animating anything means turning that one-shot draw into a **sequence of frames over time**, and doing it three times independently would have meant three different timing models, three different "is it still running" conventions, and three copies of the same edge cases (first paint vs. a real change, a theme toggle that must not replay anything, cleanup when the app quits mid-animation).

Issue #53 (embers) was also explicit that it needed a lifecycle hook Burnbar didn't have yet — Electron's `Menu` `menu-will-show`/`menu-will-close` events — and flagged itself as "the most speculative... worth a small spike to confirm Electron's menu-item icon can be swapped smoothly enough (frame rate, flicker) before committing."

## Decision

- **One shared animation engine, not three effects.** [`src/menu-card/animation.ts`](../../src/menu-card/animation.ts) is a small, DOM-free, pure module: an eased `Tween` (`createTween`/`tweenProgress`/`tweenDone`), a seeded PRNG (`mulberry32`) and a deterministic `EmberField`/`emberInstancesAt`. Every knob (durations, stagger, particle count/life/opacity) lives in one place, [`animation-config.ts`](../../src/menu-card/animation-config.ts), so tuning "feel" never means hunting through drawing code.
- **Animation state is a pure function of an absolute timestamp, not incremental per-frame mutation.** A `Tween` evaluated at any `nowMs` always yields the same progress; an `EmberField` evaluated at any `nowMs` always yields the same particle positions. This is what let the *same* engine drive three different clocks with zero adapter code: the main process's `setTimeout` poller, a Storybook `requestAnimationFrame` loop, and Vitest assertions at arbitrary instants — see [Storybook](#storybook-as-the-spike) below.
- **The render contract became `(data, nowMs) → { png, animating }`.** `card.ts#renderCardFrame` replaced the old one-shot `drawCard` as the production entry point (`drawCard` survives as a static, non-animated escape hatch — the "settled" reference used by Storybook). It keeps a small module-scoped `session` (previous data + each tween's start time + the active ember field) because there is exactly **one** hidden `BrowserWindow` instance for the app's lifetime ([ADR-009](./009-menu-stats-card.md)), so module-scoped state is the same trade-off that page already made.
- **A new main-process collaborator, `CardAnimator` ([card-animator.ts](../../src/card-animator.ts)), owns the polling loop**, decoupled from `MenuCardRenderer` by dependency injection (a `renderFrame` function, a `setEmbersActive` function, an injectable clock/scheduler) so it's unit-testable without a real hidden window or real timers. One self-scheduling loop (not `setInterval`, so a slow render can't cause overlapping requests) serves two triggers: `onData()` (bounded — runs until the browser reports the roll/growth finished, capped by a runaway-safety deadline) and `setMenuOpen(true)` (ambient — runs indefinitely until the menu closes). Whichever reason is currently active keeps the single loop alive.
- **The tray mutates a live `MenuItem.icon` in place, not a full menu rebuild.** `TrayManager` gives the card row a stable `id` and fetches it via `Menu.getMenuItemById` after each `Menu.buildFromTemplate`; `CardAnimator`'s `onFrame` callback sets `cardMenuItem.icon = image` directly. A full `rebuildMenu()`/`setContextMenu()` only fires once, on the very first successful render (swapping the plain-text fallback rows for the real card) — not on every animation frame, which would be wasteful and risks visibly disrupting an open menu.
- **Ember lifecycle hooks into `Menu`'s own `menu-will-show`/`menu-will-close`** (per #53's own feasibility note), attached fresh on every `rebuildMenu()` call.
- **No new setting to disable the animations.** They're bounded (a few hundred ms) or subtle (low-opacity embers) by design; a kill switch was judged premature until real usage says otherwise — see [Alternatives Considered](#alternatives-considered).

### Storybook as the spike

Because the engine is a pure function of time, [`stories/menu-card.stories.ts`](../../stories/menu-card.stories.ts) calls the **real** `renderCardFrame`/`setEmbersActive` functions directly, driven by the browser's own `requestAnimationFrame` — no Electron, no hidden window. This is the "spike/prototype" #53's acceptance criteria asked for: it runs the ember loop at the same ~24fps cadence as the real main-process poller so frame rate and visual flicker can be judged directly in a browser. See [storybook.md](../storybook.md).

## Consequences

- (+) Adding a fourth animation later (a new tween, a new particle behavior) means extending `animation.ts`/`animation-config.ts`, not inventing a new timing/lifecycle model.
- (+) `CardAnimator`'s injected clock/scheduler makes the tricky part — supersession, the safety-cap deadline, the menu-open/close race — fully unit-testable (`test/card-animator.test.ts`) without a real Electron window or real timers.
- (+) The odometer roll only aligns changed digit columns by right-padding to equal length; it does not attempt true mechanical-odometer semantics (carrying/borrowing wheels) when a value's digit count changes. Acceptable for a cosmetic enhancement — the roll still reads as a value change, not a glitch.
- (−) **Open verification item**: whether Electron reflects a `MenuItem.icon` reassignment live on an *already-open* native macOS context menu — the mechanism the ember loop and any mid-open odometer/bar animation depend on for visible motion — is not something this Linux development sandbox can confirm. It's a known, commonly-used Electron pattern (menu-item spinners), and the design degrades safely if it doesn't render live (the menu simply shows whatever frame was current when it opened, no crash/flicker/broken state), but #53's acceptance criteria ("spike/prototype confirms acceptable frame rate and no visible flicker") is only fully satisfied by a run on a real Mac.
- (−) A card animation session lives in one module-scoped variable, so exactly one "live" animated preview can run at a time (in production this is a non-issue — there's only ever one card; in Storybook it means the stories can't animate two panels side by side, only one at a time — see the comment atop `menu-card.stories.ts`).

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Three independent implementations (one per issue) | All three issues converged on the same "animate → hand off a settled PNG" shape; duplicating it would have tripled the edge cases (first-paint vs. change, theme-toggle no-replay, quit-mid-animation cleanup) for no benefit. |
| Push frames from the hidden window via `contextBridge`/IPC instead of the main process polling `executeJavaScript` | The menu only ever shows a static bitmap per open in practice (per #52's own feasibility note); a poll-driven `(data, nowMs) → frame` call is simpler, needs no preload/IPC channel for the card page, and keeps the "pure function of time" property that makes Storybook/tests trivial. |
| A user-facing setting to disable card animations | No evidence yet that anyone wants this; the animations are bounded/subtle by construction. Revisit if real feedback says otherwise — cheap to add later (a flag `CardAnimator` checks before calling `onData`/`setMenuOpen`). |
| Rebuild the whole `Menu` on every animation frame (reuse the existing `rebuildMenu()` path) | Would mean tearing down and re-showing the context menu ~24 times a second while animating — wasteful and the likelier source of real flicker; mutating the live `MenuItem.icon` is the standard lower-risk technique. |

## Related

[ADR-009](./009-menu-stats-card.md) (the card itself), [modules/menu-card.md](../modules/menu-card.md), [modules/menu-card-window.md](../modules/menu-card-window.md), [modules/tray.md](../modules/tray.md), [storybook.md](../storybook.md), issues #52/#53/#54.
