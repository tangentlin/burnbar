import { Menu, type MenuItemConstructorOptions, Tray, app, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { UsageData } from "./types.js";
import { getUserUsage } from "./usage.js";

const REFRESH_INTERVAL_MS = 60_000;

export class TrayManager {
  private tray: Tray | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async initializeTray(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
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

    await this.refreshTrayMenu();

    // Keep today's cost in the menu bar live without requiring a click.
    this.refreshTimer = setInterval(() => {
      void this.refreshTrayMenu();
    }, REFRESH_INTERVAL_MS);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refreshTrayMenu(): Promise<void> {
    if (!this.tray) {
      return;
    }

    const usageData = await getUserUsage();
    this.updateTitle(usageData);

    const menuItems = this.buildMenuItems(usageData);
    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
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
