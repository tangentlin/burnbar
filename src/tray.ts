import {
  Menu,
  type MenuItemConstructorOptions,
  type NativeImage,
  Tray,
  app,
  nativeImage,
} from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { REFRESH_PRESETS_MINUTES } from "./settings.js";
import { sparklinePng } from "./sparkline.js";
import { formatIntervalLabel, formatRelativeTime } from "./time.js";
import type { TrayState, UsageData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep "Updated X ago" honest between data refreshes (UI-only; no ccusage call).
const LABEL_REFRESH_MS = 60_000;

export type TrayCallbacks = {
  onOpenDashboard: () => void;
  onRefreshNow: () => void;
  onSetRefreshInterval: (minutes: number) => void;
};

/**
 * Display-only consumer of {@link TrayState}. The CaptureService owns the ccusage
 * call and pushes state via {@link render}; the tray formats it into the title,
 * the usage rows, a 30-day spend sparkline (drill-down), a last-updated stamp +
 * Refresh Now, and the Auto-Refresh submenu. See docs/modules/tray.md.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private labelTimer: ReturnType<typeof setInterval> | null = null;
  private state: TrayState = {
    usage: { daily: null, total: null },
    lastUpdatedAt: null,
    sparkline: [],
    refreshIntervalMinutes: 0,
  };
  private sparklineData: number[] = [];
  private sparklineImage: NativeImage | null = null;

  constructor(private readonly callbacks: TrayCallbacks) {}

  initialize(): void {
    const iconPath = path.join(__dirname, "..", "assets", "icon.png");

    try {
      // Template image: macOS tints it automatically for light/dark menu bars.
      const icon = nativeImage.createFromPath(iconPath);
      icon.setTemplateImage(true);
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
  }

  /** Apply the latest state, re-render the sparkline if it changed, rebuild the menu. */
  render(state: TrayState): void {
    this.state = state;
    this.updateSparkline(state.sparkline);
    this.rebuildMenu();
  }

  dispose(): void {
    if (this.labelTimer) {
      clearInterval(this.labelTimer);
      this.labelTimer = null;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  private updateSparkline(costs: number[]): void {
    if (sameNumbers(this.sparklineData, costs)) {
      return;
    }
    this.sparklineData = costs;
    if (!costs.some((cost) => cost > 0)) {
      this.sparklineImage = null;
      return;
    }
    const { png, scaleFactor } = sparklinePng(costs, { width: 150, height: 18, scale: 2 });
    const image = nativeImage.createFromBuffer(png, { scaleFactor });
    image.setTemplateImage(true);
    this.sparklineImage = image;
  }

  private rebuildMenu(): void {
    if (!this.tray) {
      return;
    }
    this.updateTitle(this.state.usage);
    this.tray.setContextMenu(Menu.buildFromTemplate(this.buildMenuItems(this.state)));
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
    const { usage } = state;

    if (usage.error) {
      items.push({ label: "Error loading usage data", enabled: false });
    } else {
      this.addDailyUsageItems(items, usage);
      items.push({ type: "separator" });
      this.addTotalUsageItems(items, usage);
    }

    // 30-day spend sparkline: a quick glance that drills into the dashboard.
    if (this.sparklineImage) {
      items.push({ type: "separator" });
      items.push({
        label: "Last 30 Days · Spend",
        icon: this.sparklineImage,
        click: () => this.callbacks.onOpenDashboard(),
      });
    }

    items.push({ type: "separator" });
    items.push({ label: `Updated ${formatRelativeTime(state.lastUpdatedAt)}`, enabled: false });
    items.push({ label: "Refresh Now", click: () => this.callbacks.onRefreshNow() });
    items.push(this.buildAutoRefreshItem(state.refreshIntervalMinutes));

    items.push({ type: "separator" });
    items.push({
      label: "Open Usage Dashboard…",
      click: () => this.callbacks.onOpenDashboard(),
    });

    items.push({ type: "separator" });
    items.push({ label: "Quit", click: () => app.quit() });

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

  private addDailyUsageItems(items: MenuItemConstructorOptions[], usageData: UsageData): void {
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

  private addTotalUsageItems(items: MenuItemConstructorOptions[], usageData: UsageData): void {
    items.push({ label: "All-Time Usage", enabled: false });
    if (usageData.total) {
      items.push({ label: `  Cost: $${usageData.total.cost.toFixed(2)}`, enabled: false });
      items.push({
        label: `  Tokens: ${usageData.total.totalTokens.toLocaleString()}`,
        enabled: false,
      });
    } else {
      items.push({ label: "  No usage data", enabled: false });
    }
  }
}

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
