import { BrowserWindow } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lazily-created dashboard window. The renderer reads archived usage only through
 * the contextBridge preload — contextIsolation on, nodeIntegration off. sandbox
 * is off because the preload is an ES module (preload.mjs) on Electron 42.
 */
export class DashboardWindow {
  private window: BrowserWindow | null = null;

  open(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 940,
      height: 620,
      minWidth: 640,
      minHeight: 420,
      show: false,
      title: "Burnbar — Usage Dashboard",
      backgroundColor: "#101014",
      webPreferences: {
        preload: path.join(__dirname, "preload.mjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.window.once("ready-to-show", () => {
      this.window?.show();
      this.window?.focus();
    });
    this.window.on("closed", () => {
      this.window = null;
    });

    void this.window.loadFile(path.join(__dirname, "dashboard", "index.html"));
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
