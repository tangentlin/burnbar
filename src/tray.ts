import { Menu, type MenuItemConstructorOptions, Tray, app, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { UsageData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type TrayCallbacks = {
  onOpenDashboard: () => void;
};

/**
 * Display-only consumer of usage data. The CaptureService owns the ccusage call
 * and pushes fresh {@link UsageData} via {@link render}; the tray just formats it
 * into the title and context menu. See docs/modules/tray.md.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private latestUsage: UsageData = { daily: null, total: null };

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

    this.render(this.latestUsage);
  }

  /** Apply the latest usage to the title and rebuild the context menu. */
  render(usageData: UsageData): void {
    this.latestUsage = usageData;
    if (!this.tray) {
      return;
    }
    this.updateTitle(usageData);
    this.tray.setContextMenu(Menu.buildFromTemplate(this.buildMenuItems(usageData)));
  }

  dispose(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  private updateTitle(usageData: UsageData): void {
    if (process.platform !== "darwin" || !this.tray) {
      return;
    }

    // Show today's cost beside the icon; clear it when there's nothing to show.
    if (usageData.error || !usageData.daily) {
      this.tray.setTitle("");
      return;
    }

    this.tray.setTitle(` $${usageData.daily.cost.toFixed(2)}`);
  }

  private buildMenuItems(usageData: UsageData): MenuItemConstructorOptions[] {
    const menuItems: MenuItemConstructorOptions[] = [];

    if (usageData.error) {
      menuItems.push({
        label: "Error loading usage data",
        enabled: false,
      });
    } else {
      this.addDailyUsageItems(menuItems, usageData);
      menuItems.push({ type: "separator" });
      this.addTotalUsageItems(menuItems, usageData);
    }

    menuItems.push({ type: "separator" });
    menuItems.push({
      label: "Open Usage Dashboard…",
      click: () => {
        this.callbacks.onOpenDashboard();
      },
    });

    menuItems.push({ type: "separator" });
    menuItems.push({
      label: "Quit",
      click: () => {
        app.quit();
      },
    });

    return menuItems;
  }

  private addDailyUsageItems(menuItems: MenuItemConstructorOptions[], usageData: UsageData): void {
    menuItems.push({
      label: "Today's Usage",
      enabled: false,
    });

    if (usageData.daily) {
      menuItems.push({
        label: `  Cost: $${usageData.daily.cost.toFixed(2)}`,
        enabled: false,
      });
      menuItems.push({
        label: `  Tokens: ${usageData.daily.totalTokens.toLocaleString()}`,
        enabled: false,
      });
    } else {
      menuItems.push({
        label: "  No usage today",
        enabled: false,
      });
    }
  }

  private addTotalUsageItems(menuItems: MenuItemConstructorOptions[], usageData: UsageData): void {
    menuItems.push({
      label: "All-Time Usage",
      enabled: false,
    });

    if (usageData.total) {
      menuItems.push({
        label: `  Cost: $${usageData.total.cost.toFixed(2)}`,
        enabled: false,
      });
      menuItems.push({
        label: `  Tokens: ${usageData.total.totalTokens.toLocaleString()}`,
        enabled: false,
      });
    } else {
      menuItems.push({
        label: "  No usage data",
        enabled: false,
      });
    }
  }
}
