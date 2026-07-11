import { BrowserWindow, type NativeImage, nativeImage } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardFrame, MenuCardData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Draw the card at 2× and tag the resulting NativeImage with the same scale so
// macOS shows it crisp on retina menus (logical size = device pixels ÷ SCALE).
const SCALE = 2;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/**
 * Rasterizes the menu's "stats card" by driving a hidden, never-shown
 * BrowserWindow: the page (src/menu-card) exposes `__burnbarRenderCardFrame(data, nowMs)`,
 * which paints a `<canvas>` for that instant and returns a PNG data URL plus
 * whether the animation (odometer roll / bar growth / embers) needs another
 * frame. We render off the compositor (Canvas 2D, not `capturePage`) so output
 * is deterministic regardless of window visibility. The window is created once
 * and reused across refreshes; the multi-frame polling loop lives in
 * [card-animator.ts](./card-animator.ts).
 */
export class MenuCardRenderer {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;

  /**
   * Render one animation frame of the stats card as of `nowMs` (an odometer
   * roll, bar-chart growth, and/or ember particles all resolve for that
   * instant — see [card.ts#renderCardFrame](./menu-card/card.ts)). Returns
   * `animating: true` when the caller (see [card-animator.ts](./card-animator.ts))
   * should schedule another frame; `image` is null on any render failure.
   */
  async renderFrame(
    data: MenuCardData,
    nowMs: number,
  ): Promise<{ image: NativeImage | null; animating: boolean }> {
    try {
      await this.ensureWindow();
      const contents = this.window?.webContents;
      if (!contents || contents.isDestroyed()) {
        return { image: null, animating: false };
      }
      const result = (await contents.executeJavaScript(
        `window.__burnbarRenderCardFrame(${JSON.stringify(data)}, ${nowMs})`,
      )) as CardFrame | undefined;
      if (
        !result ||
        typeof result.png !== "string" ||
        !result.png.startsWith(PNG_DATA_URL_PREFIX)
      ) {
        return { image: null, animating: false };
      }
      const png = Buffer.from(result.png.slice(PNG_DATA_URL_PREFIX.length), "base64");
      return {
        image: nativeImage.createFromBuffer(png, { scaleFactor: SCALE }),
        animating: result.animating,
      };
    } catch (error) {
      // Best-effort: the caller falls back gracefully when this returns null.
      console.error("menu-card frame render failed:", error);
      return { image: null, animating: false };
    }
  }

  /** Start (`active: true`) or stop the ember-particle loop; `nowMs` re-seeds the pattern on each activation. */
  async setEmbersActive(active: boolean, nowMs: number): Promise<void> {
    try {
      await this.ensureWindow();
      const contents = this.window?.webContents;
      if (!contents || contents.isDestroyed()) {
        return;
      }
      await contents.executeJavaScript(`window.__burnbarSetEmbersActive(${active}, ${nowMs})`);
    } catch (error) {
      console.error("menu-card ember toggle failed:", error);
    }
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
      await this.ensureWindow();
      const contents = this.window?.webContents;
      if (!contents || contents.isDestroyed()) {
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
