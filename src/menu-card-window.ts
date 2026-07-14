import { BrowserWindow, type NativeImage, type WebContents, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { MenuCardData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Draw the card at 2× and tag the resulting NativeImage with the same scale so
// macOS shows it crisp on retina menus (logical size = device pixels ÷ SCALE).
const SCALE = 2;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/**
 * Rasterizes the menu's "stats card" by driving a hidden, never-shown
 * BrowserWindow: the page (src/menu-card) exposes `__burnbarDrawCard(data)`,
 * which paints a `<canvas>` and returns a PNG data URL. We render off the
 * compositor (Canvas 2D, not `capturePage`) so output is deterministic
 * regardless of window visibility. The window is created once and reused
 * across refreshes. See [ADR-009](../docs/adr/009-menu-stats-card.md).
 */
export class MenuCardRenderer {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;

  /** Render the stats card for the given data. `null` on any render failure (the tray falls back gracefully). */
  async render(data: MenuCardData): Promise<NativeImage | null> {
    return this.rasterize(`window.__burnbarDrawCard(${JSON.stringify(data)})`);
  }

  /** Render a menu-row glyph as a retina **template** image (macOS tints it). */
  async renderIcon(name: "refresh" | "dashboard"): Promise<NativeImage | null> {
    const image = await this.rasterize(`window.__burnbarDrawIcon(${JSON.stringify(name)})`);
    image?.setTemplateImage(true);
    return image;
  }

  /** Evaluate a draw call in the hidden page and decode its PNG data URL. */
  private async rasterize(expression: string): Promise<NativeImage | null> {
    try {
      const contents = await this.liveContents();
      if (!contents) {
        return null;
      }
      const result = (await contents.executeJavaScript(expression)) as unknown;
      if (typeof result !== "string" || !result.startsWith(PNG_DATA_URL_PREFIX)) {
        return null;
      }
      const png = Buffer.from(result.slice(PNG_DATA_URL_PREFIX.length), "base64");
      return nativeImage.createFromBuffer(png, { scaleFactor: SCALE });
    } catch (error) {
      // Best-effort: the tray falls back gracefully when this returns null.
      console.error("menu-card render failed:", error);
      return null;
    }
  }

  /** Shared "ensure the hidden window is up, then hand back its usable webContents" guard. */
  private async liveContents(): Promise<WebContents | null> {
    await this.ensureWindow();
    const contents = this.window?.webContents;
    return contents && !contents.isDestroyed() ? contents : null;
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = null;
  }

  /** Create the hidden renderer window once and resolve when its page has loaded. */
  private ensureWindow(): Promise<void> {
    if (this.ready) {
      return this.ready;
    }
    const win = new BrowserWindow({
      show: false,
      width: 16,
      height: 16,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    this.window = win;
    this.ready = new Promise<void>((resolve, reject) => {
      win.webContents.once("did-finish-load", () => resolve());
      win.webContents.once("did-fail-load", (_event, code, description) => {
        reject(new Error(`menu-card page failed to load: ${description} (${code})`));
      });
    });
    void win.loadFile(path.join(__dirname, "menu-card", "index.html"));
    return this.ready;
  }
}
