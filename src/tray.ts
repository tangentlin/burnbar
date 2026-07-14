import {
  Menu,
  type MenuItemConstructorOptions,
  type NativeImage,
  Tray,
  app,
  nativeImage,
  nativeTheme,
} from "electron";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { detectAppearance } from "./appearance.js";
import type { MenuCardRenderer } from "./menu-card-window.js";
import { REFRESH_PRESETS_MINUTES } from "./settings.js";
import { formatIntervalLabel, formatRelativeTime } from "./time.js";
import { type IconAppearance, badgeForStatus, composeBadgedIconBitmap } from "./tray-icon.js";
import type { MenuCardData, TrayState, UpdateState, UsageData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep "Updated X ago" honest between data refreshes (UI-only; no ccusage call).
const LABEL_REFRESH_MS = 60_000;

// The tray icon is authored @2x (44px); badged variants are composited from that
// representation so they stay crisp on Retina menu bars.
const TRAY_ICON_SCALE = 2;

const IDLE_UPDATE_STATE: UpdateState = {
  status: "idle",
  version: null,
  percent: null,
  error: null,
};

export type TrayCallbacks = {
  onOpenDashboard: () => void;
  onRefreshNow: () => void;
  onSetRefreshInterval: (minutes: number) => void;
  onAbout: () => void;
  onOpenLogFolder: () => void;
  onCopyDiagnostics: () => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onRestartToUpdate: () => void;
};

/**
 * Display-only consumer of {@link TrayState} and {@link UpdateState}. The
 * CaptureService owns the ccusage call and pushes state via {@link render};
 * the UpdateService owns the electron-updater lifecycle and pushes state via
 * {@link renderUpdate}. The tray formats both into the title and the context
 * menu — a rich "stats card" bitmap (today + 30-day spend/tokens, a bar chart,
 * top model), an "Updated …" stamp + Refresh Now, the Auto-Refresh submenu,
 * Open Dashboard, About, the state-driven update row, and Quit. See
 * docs/modules/tray.md.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private labelTimer: ReturnType<typeof setInterval> | null = null;
  private state: TrayState = {
    usage: { daily: null, total: null },
    lastUpdatedAt: null,
    card: { cost30d: 0, tokens30d: 0, topModel: null, spark: [] },
    refreshIntervalMinutes: 0,
  };
  private updateState: UpdateState = IDLE_UPDATE_STATE;
  // Cached card bitmap + the signature of the data it was rendered from, so the
  // 60s label tick and unchanged re-captures reuse it instead of re-rendering.
  private cardImage: NativeImage | null = null;
  private cardSignature: string | null = null;
  // The plain template menu-bar icon (macOS auto-tints it); the base for the
  // badged, non-template variants and the fallback whenever no update is pending.
  private templateIcon: NativeImage | null = null;
  // Badged icon variants keyed by `${badge}:${appearance}` — composited once and
  // reused (the badge only changes on an update transition or a theme switch).
  private readonly badgedIcons = new Map<string, NativeImage>();
  // Static menu-row glyphs, rendered once and cached.
  private refreshIcon: NativeImage | null = null;
  private dashboardIcon: NativeImage | null = null;
  // Transparent gutter filler so text on icon-less rows aligns with icon'd rows.
  private readonly spacerIcon = transparentIcon();
  // The menu bar's actual light/dark appearance — NOT nativeTheme.shouldUseDarkColors,
  // which only tracks the app's own UI theme and is documented as unreliable for
  // the tray itself (electron/electron#25478, #21899), especially for a
  // windowless, Dock-hidden app like Burnbar. Seeded with a best-effort guess and
  // corrected asynchronously by refreshAppearance() (see initialize/renderUpdate/
  // handleThemeChange) before either the card or the badge next paints.
  private appearance: IconAppearance = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  // Re-render the (transparent) card when the menu switches light/dark — its data
  // signature now carries the appearance, so this just re-runs the cached render.
  // The badged icon is appearance-specific too, so refresh it on the same switch.
  private readonly handleThemeChange = (): void => {
    void this.refreshAppearance();
  };

  constructor(
    private readonly callbacks: TrayCallbacks,
    private readonly cardRenderer: MenuCardRenderer,
  ) {}

  initialize(): void {
    const iconPath = path.join(__dirname, "..", "assets", "icon.png");
    const icon2xPath = path.join(__dirname, "..", "assets", "icon@2x.png");

    try {
      // Template image: macOS tints it automatically for light/dark menu bars.
      // Build it from the @2x (44px) asset at scaleFactor 2 so it renders crisp and
      // correctly sized (~22pt, the menu-bar height) on Retina — a lone 44px asset
      // loaded as @1x rendered oversized and blurry. The hand-tuned @1x (22px) is
      // added as a best-effort representation for non-Retina displays.
      const icon = nativeImage.createFromBuffer(readFileSync(icon2xPath), {
        scaleFactor: 2,
      });
      try {
        icon.addRepresentation({ scaleFactor: 1, buffer: readFileSync(iconPath) });
      } catch {
        // 1x rep is best-effort; the 2x rep already covers Retina menu bars.
      }
      icon.setTemplateImage(true);
      this.templateIcon = icon;
      this.tray = new Tray(icon);
      if (process.platform === "darwin") {
        this.tray.setTitle("");
      }
    } catch (error) {
      console.error("Failed to create tray:", error);
      return;
    }

    this.tray.setToolTip("Burnbar");

    if (process.platform !== "darwin") {
      this.tray.on("click", () => {
        this.tray?.popUpContextMenu();
      });
    }

    this.rebuildMenu();
    this.labelTimer = setInterval(() => this.rebuildMenu(), LABEL_REFRESH_MS);
    nativeTheme.on("updated", this.handleThemeChange);
    void this.loadIcons();
    // Correct the startup guess: nativeTheme.shouldUseDarkColors can be stale or
    // wrong for a windowless, Dock-hidden app at cold start (see `appearance`).
    void this.refreshAppearance();
  }

  /**
   * Re-detect the menu bar's real appearance (see `appearance`'s doc comment)
   * and repaint anything that depends on it — the card's value-text color and
   * the update badge's glyph recolor. Cheap and infrequent: only called on
   * cold start, an update-state transition, and a `nativeTheme` "updated" event
   * — never per animation frame.
   */
  private async refreshAppearance(): Promise<void> {
    this.appearance = await detectAppearance({
      fallback: () => (nativeTheme.shouldUseDarkColors ? "dark" : "light"),
    });
    this.refreshCard(this.state);
    this.refreshTrayIcon();
  }

  /** Render the static menu-row icons once and cache them (best-effort). */
  private async loadIcons(): Promise<void> {
    const [refresh, dashboard] = await Promise.all([
      this.cardRenderer.renderIcon("refresh"),
      this.cardRenderer.renderIcon("dashboard"),
    ]);
    this.refreshIcon = refresh;
    this.dashboardIcon = dashboard;
    this.rebuildMenu();
  }

  /** Apply the latest state: rebuild now, then refresh the card bitmap if its data changed. */
  render(state: TrayState): void {
    this.state = state;
    if (state.usage.error) {
      this.cardImage = null;
      this.cardSignature = null;
    }
    this.rebuildMenu();
    if (!state.usage.error) {
      this.refreshCard(state);
    }
  }

  /** Apply the latest {@link UpdateState} from UpdateService and rebuild the menu. */
  renderUpdate(state: UpdateState): void {
    this.updateState = state;
    this.rebuildMenu();
    void this.refreshAppearance();
  }

  /**
   * Swap the tray image between the plain template icon and a badged, non-template
   * variant when an update needs attention (available → blue dot, downloaded →
   * orange dot). Best-effort: any failure falls back to the template icon so the
   * menu bar never goes blank. See ADR-011 (attention cues) / ADR-004 (why the
   * default icon is a template).
   */
  private refreshTrayIcon(): void {
    if (!this.tray || !this.templateIcon) {
      return;
    }
    const badge = badgeForStatus(this.updateState.status);
    if (!badge) {
      this.tray.setImage(this.templateIcon);
      return;
    }
    const appearance = this.appearance;
    const key = `${badge}:${appearance}`;
    let image = this.badgedIcons.get(key);
    if (!image) {
      try {
        const { width, height } = this.templateIcon.getSize();
        const deviceWidth = width * TRAY_ICON_SCALE;
        const deviceHeight = height * TRAY_ICON_SCALE;
        const base = this.templateIcon.toBitmap({ scaleFactor: TRAY_ICON_SCALE });
        const composed = composeBadgedIconBitmap(
          base,
          deviceWidth,
          deviceHeight,
          appearance,
          badge,
        );
        // The compositor works on Uint8Array (so it runs in the browser too);
        // createFromBitmap wants a Buffer — wrap the same memory, no copy.
        const buffer = Buffer.from(composed.buffer, composed.byteOffset, composed.byteLength);
        image = nativeImage.createFromBitmap(buffer, {
          width: deviceWidth,
          height: deviceHeight,
          scaleFactor: TRAY_ICON_SCALE,
        });
        this.badgedIcons.set(key, image);
      } catch (error) {
        console.error("Failed to compose badged tray icon:", error);
        this.tray.setImage(this.templateIcon);
        return;
      }
    }
    this.tray.setImage(image);
  }

  dispose(): void {
    if (this.labelTimer) {
      clearInterval(this.labelTimer);
      this.labelTimer = null;
    }
    nativeTheme.removeListener("updated", this.handleThemeChange);
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /** Re-render the card only when its underlying numbers changed, then rebuild the menu with the new image. */
  private refreshCard(state: TrayState): void {
    const data = toCardData(state, this.appearance);
    const signature = JSON.stringify(data);
    if (signature === this.cardSignature && this.cardImage) {
      return;
    }
    this.cardSignature = signature;
    void this.cardRenderer.render(data).then((image) => {
      // A newer refresh may have already landed and changed the signature again;
      // an older, now-stale render must not clobber it.
      if (signature !== this.cardSignature) {
        return;
      }
      this.cardImage = image;
      this.rebuildMenu();
    });
  }

  private rebuildMenu(): void {
    if (!this.tray) {
      return;
    }
    this.updateTitle(this.state.usage);
    const menu = Menu.buildFromTemplate(this.buildMenuItems(this.state));
    this.tray.setContextMenu(menu);
  }

  private updateTitle(usageData: UsageData): void {
    if (process.platform !== "darwin" || !this.tray) {
      return;
    }
    if (usageData.error || !usageData.daily) {
      this.tray.setTitle("");
      return;
    }
    this.tray.setTitle(` $${usageData.daily.cost.toFixed(2)}`);
  }

  private buildMenuItems(state: TrayState): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = [];

    // Stats card — a display-only banner (not selectable); the dashboard CTA sits
    // directly beneath it.
    if (state.usage.error) {
      items.push({ label: "Error loading usage data", enabled: false });
    } else if (this.cardImage) {
      items.push({ label: "", icon: this.cardImage, enabled: false });
    } else {
      // Brief gap before the first card render (or a render failure): plain text.
      this.addFallbackUsageItems(items, state.usage);
    }

    items.push({
      label: "Open Usage Dashboard…",
      icon: this.dashboardIcon ?? undefined,
      click: () => this.callbacks.onOpenDashboard(),
    });

    items.push({ type: "separator" });
    items.push({ label: `Updated ${formatRelativeTime(state.lastUpdatedAt)}`, enabled: false });
    items.push({
      label: "Refresh Now",
      icon: this.refreshIcon ?? undefined,
      click: () => this.callbacks.onRefreshNow(),
    });
    items.push(this.buildAutoRefreshItem(state.refreshIntervalMinutes));

    items.push({ type: "separator" });
    items.push({
      label: `About Burnbar ${app.getVersion()}`,
      click: () => this.callbacks.onAbout(),
    });
    items.push({
      label: "Troubleshooting",
      submenu: [
        { label: "Open Log Folder", click: () => this.callbacks.onOpenLogFolder() },
        { label: "Copy Diagnostics to Desktop", click: () => this.callbacks.onCopyDiagnostics() },
      ],
    });
    items.push(this.buildUpdateItem(this.updateState));

    items.push({ type: "separator" });
    items.push({ label: "Quit", click: () => app.quit() });

    // Reserve a uniform icon gutter on every text row that lacks a real glyph, so
    // all labels left-align and the Refresh/Dashboard icons stand out.
    for (const item of items) {
      if (item.type !== "separator" && item.label && !item.icon) {
        item.icon = this.spacerIcon;
      }
    }

    return items;
  }

  private buildAutoRefreshItem(current: number): MenuItemConstructorOptions {
    const submenu: MenuItemConstructorOptions[] = REFRESH_PRESETS_MINUTES.map((minutes) => ({
      label: minutes === 0 ? "Manual (off)" : formatIntervalLabel(minutes),
      type: "radio",
      checked: minutes === current,
      click: () => this.callbacks.onSetRefreshInterval(minutes),
    }));

    // Surface a custom (file-edited) value that isn't one of the presets.
    if (!REFRESH_PRESETS_MINUTES.includes(current)) {
      submenu.push({ type: "separator" });
      submenu.push({
        label: `Custom: ${formatIntervalLabel(current)}`,
        type: "radio",
        checked: true,
        enabled: false,
      });
    }

    return { label: `Auto-Refresh: ${formatIntervalLabel(current)}`, submenu };
  }

  /**
   * The single state-driven update row (see ADR-011's tray-only UX sketch):
   * exactly one of these is always present, its label/behavior reflecting
   * {@link UpdateState.status}. idle/not-available/error fold into a manual
   * "Check for Updates" trigger — there is no separate always-visible
   * "Up to date" row.
   */
  private buildUpdateItem(state: UpdateState): MenuItemConstructorOptions {
    switch (state.status) {
      case "checking":
        return { label: "Checking for Updates...", enabled: false };
      case "available":
        return {
          label: `Download Update (v${state.version})...`,
          click: () => this.callbacks.onDownloadUpdate(),
        };
      case "downloading":
        return { label: `Downloading... ${Math.round(state.percent ?? 0)}%`, enabled: false };
      case "downloaded":
        return { label: "Restart to Update", click: () => this.callbacks.onRestartToUpdate() };
      case "idle":
      case "error":
      default:
        return { label: "Check for Updates", click: () => this.callbacks.onCheckForUpdates() };
    }
  }

  private addFallbackUsageItems(items: MenuItemConstructorOptions[], usageData: UsageData): void {
    items.push({ label: "Today's Usage", enabled: false });
    if (usageData.daily) {
      items.push({ label: `  Cost: $${usageData.daily.cost.toFixed(2)}`, enabled: false });
      items.push({
        label: `  Tokens: ${usageData.daily.totalTokens.toLocaleString()}`,
        enabled: false,
      });
    } else {
      items.push({ label: "  No usage today", enabled: false });
    }
  }
}

/**
 * A fully-transparent 16×16 image used to reserve the menu's icon gutter on rows
 * without a real glyph, so every label left-aligns and the real icons stand out.
 */
function transparentIcon(): NativeImage {
  const size = 16;
  return nativeImage.createFromBitmap(Buffer.alloc(size * size * 4), { width: size, height: size });
}

/** Combine the derived card figures with today's numbers into the renderer's input. */
function toCardData(state: TrayState, appearance: IconAppearance): MenuCardData {
  return {
    ...state.card,
    todayCost: state.usage.daily?.cost ?? null,
    todayTokens: state.usage.daily?.totalTokens ?? null,
    // The card is transparent, so its value text must match the menu appearance.
    dark: appearance === "dark",
  };
}
