import { BrowserWindow, app, shell } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lazily-created "About Burnbar" window: a static credits/links page. Unlike
 * {@link DashboardWindow} it needs no preload/IPC — the app version is its only
 * dynamic value, passed via the `loadFile` query string and read client-side
 * (src/about/about.ts). Every link opens in the system browser, never inside
 * this window.
 */
export class AboutWindow {
  private window: BrowserWindow | null = null;

  open(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    const win = new BrowserWindow({
      width: 440,
      height: 640,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: "About Burnbar",
      backgroundColor: "#101014",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window = win;

    // The page's links carry target="_blank"; route those through the system
    // browser instead of opening a second Electron window. will-navigate is a
    // defense-in-depth backstop for any link/script navigation that isn't —
    // it never fires for our own loadFile call below (Electron only emits it
    // for user/page-initiated navigation).
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      void shell.openExternal(url);
    });

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
    win.on("closed", () => {
      this.window = null;
    });

    void win.loadFile(path.join(__dirname, "about", "index.html"), {
      query: { version: app.getVersion() },
    });
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
