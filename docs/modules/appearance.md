# Module: appearance

## Purpose

Detects the macOS menu bar's **real** light/dark appearance — deliberately *not* via `nativeTheme.shouldUseDarkColors`, which tracks only the app's own UI theme and is documented as unreliable for the tray specifically ([electron/electron#25478](https://github.com/electron/electron/issues/25478), [#21899](https://github.com/electron/electron/issues/21899)), especially for a windowless, Dock-hidden (`LSUIElement`) app like Burnbar. Instead it reads the same `NSUserDefaults` key AppKit itself keys menu-bar tinting off of: `defaults read -g AppleInterfaceStyle`. Introduced by [ADR-011's reliable-detection amendment](../adr/011-auto-update-mechanism.md#amendment-reliable-menu-bar-appearance-detection-2026-07) after the `nativeTheme`-driven badge/card color came out wrong (black glyph, illegible text) on a real dark menu bar.

## Public Surface

| Export | Type | File |
|--------|------|------|
| `AppearanceRunner` | `() => Promise<string>` — DI seam for the `defaults` invocation | [appearance.ts](../../src/appearance.ts) |
| `defaultAppearanceRunner` | `AppearanceRunner` — production `execFile("defaults", ["read", "-g", "AppleInterfaceStyle"])` | [appearance.ts](../../src/appearance.ts) |
| `DetectAppearanceOptions` | `{ runner?: AppearanceRunner; fallback?: () => IconAppearance }` | [appearance.ts](../../src/appearance.ts) |
| `detectAppearance(options?)` | `(DetectAppearanceOptions) => Promise<IconAppearance>` | [appearance.ts](../../src/appearance.ts) |

`IconAppearance` (`"light" \| "dark"`) is [tray-icon.ts](./tray-icon.md)'s type — this module reuses it rather than declaring a duplicate.

## Responsibilities

- Run `defaults read -g AppleInterfaceStyle` and resolve `"Dark"` (trimmed stdout) to `"dark"`, anything else to `"light"`.
- Treat a non-zero exit **with the command present** as the normal light-mode signal — `defaults` exits 1 when the key is simply absent (light mode never sets it) — and resolve to `"light"`, not an error path.
- Fall back to an injected `fallback()` only when `defaults` itself can't run (`ENOENT` — non-macOS, a sandboxed test environment). The caller ([tray.ts](./tray.md)) injects `() => (nativeTheme.shouldUseDarkColors ? "dark" : "light")`, keeping this module itself Electron-free.

## Non-Goals

- **No Electron import** — mirrors [tray-icon.ts](./tray-icon.md)'s "Electron-free" contract so it stays unit-testable under plain Node ([vitest.config.ts](../../vitest.config.ts) runs no Electron runtime). The `nativeTheme` fallback is injected by the caller, never imported here.
- **No caching** — [tray.ts](./tray.md) owns the cached `appearance` field and decides when to re-detect; this module is a stateless one-shot check per call.
- **No coverage of wallpaper-driven menu-bar auto-tinting** (macOS Big Sur+, independent of the system-wide Dark Mode toggle) — there's no OS event to trigger a re-detect on for that case; out of scope for the reported bug.

## Invariants & Failure Modes

- **`ENOENT` vs. non-zero exit are handled differently on purpose**: only a missing `defaults` binary falls back to the injected `fallback()`; every other failure (including the expected "key does not exist" light-mode case) resolves to `"light"` directly.
- **Pure aside from the injected `runner`/`fallback`**: given the same runner output, always returns the same appearance — what [test/appearance.test.ts](../../test/appearance.test.ts) asserts.

## Related Files

- [tray.ts](../../src/tray.ts) → [tray.md](./tray.md) — the sole caller; owns the cached `appearance` field, the `refreshAppearance()` re-detect trigger points, and the `nativeTheme` fallback injection.
- [tray-icon.ts](../../src/tray-icon.ts) → [tray-icon.md](./tray-icon.md) — owns the `IconAppearance` type this module reuses, and the pure compositor that consumes the detected value.
- [capture.ts](../../src/capture.ts) — the DI-runner pattern (`CcusageRunner` / `defaultCcusageRunner`) this module mirrors.
- ADR: [adr/011's reliable-detection amendment](../adr/011-auto-update-mechanism.md#amendment-reliable-menu-bar-appearance-detection-2026-07), [adr/009's appearance-source-corrected amendment](../adr/009-menu-stats-card.md#amendment-appearance-source-corrected-2026-07).
