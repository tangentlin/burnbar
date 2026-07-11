# ADR-004: Use a macOS template image for the tray icon

## Status

Accepted

## Context

The menu bar can be light or dark, and users switch between them. A fixed-color icon looks wrong in one mode. macOS supports "template images" that the OS tints automatically. — [tray.ts:19-21](../../src/tray.ts#L19-L21)

## Decision

Load a monochrome PNG and call `icon.setTemplateImage(true)` so macOS renders it correctly in both appearances. The icon is generated at 44px from a dedicated monochrome SVG source, separate from the full-color app icon. — [tray.ts:19-22](../../src/tray.ts#L19-L22), [scripts/generate-icons.mjs:31-32](../../scripts/generate-icons.mjs#L31-L32)

## Consequences

- (+) Correct appearance in light/dark menu bars with no runtime logic.
- (+) Two distinct sources of truth: monochrome tray mark vs. color app icon — each optimized for its use.
- (−) The tray asset **must** stay monochrome; a colored PNG would render as a flat silhouette.
- (~) The update **badge** ([ADR-011 amendment](./011-auto-update-mechanism.md#amendment-attention-cues-2026-07)) is the one exception to "no runtime logic": while an update is pending, [tray-icon.ts](../../src/tray-icon.ts) composites a *non-template* variant from this template (recolored for the current appearance in code + a colored dot). The committed asset stays a template; only the transient badged image opts out of auto-tinting.

## Alternatives Considered

| Alternative | Why not chosen |
|-------------|----------------|
| Detect appearance, swap icons | Reinvents what `setTemplateImage` does for free. |
| Single color icon | Looks wrong in one of the two menu-bar modes. |
