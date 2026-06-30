import { app, shell } from "electron";
import * as path from "node:path";
import { CaptureService } from "./capture-service.js";
import { registerArchiveIpc } from "./ipc.js";
import { MenuCardRenderer } from "./menu-card-window.js";
import { SettingsStore } from "./settings.js";
import { ArchiveStore } from "./store.js";
import { systemTimezone } from "./time.js";
import { TrayManager } from "./tray.js";
import { DashboardWindow } from "./window.js";

// Bound the final flush so a hung ccusage can never block app shutdown.
const QUIT_FLUSH_TIMEOUT_MS = 5_000;
const GITHUB_URL = "https://github.com/tangentlin/burnbar";

let captureService: CaptureService | null = null;
let trayManager: TrayManager | null = null;
let dashboardWindow: DashboardWindow | null = null;
let menuCardRenderer: MenuCardRenderer | null = null;
let quitting = false;

app.whenReady().then(async () => {
  // Hide the dock icon on macOS for menu-bar-only operation.
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  const timezone = systemTimezone();
  const userData = app.getPath("userData");
  const store = new ArchiveStore(path.join(userData, "archive"));
  const settings = new SettingsStore(path.join(userData, "settings.json"));
  await settings.load();

  const service = new CaptureService({
    store,
    timezone,
    refreshIntervalMinutes: settings.getRefreshIntervalMinutes(),
  });
  const dashboard = new DashboardWindow();
  const menuCard = new MenuCardRenderer();
  const tray = new TrayManager(
    {
      onOpenDashboard: () => dashboard.open(),
      onRefreshNow: () => void service.refreshNow(),
      onSetRefreshInterval: (minutes) => {
        // Update the live timer/menu immediately, then persist; a write failure is
        // logged rather than left as an unhandled rejection.
        service.setRefreshIntervalMinutes(minutes);
        settings.setRefreshIntervalMinutes(minutes).catch((error) => {
          console.error("Failed to persist refresh interval:", error);
        });
      },
      onAbout: () => {
        shell.openExternal(GITHUB_URL).catch((error) => {
          console.error("Failed to open About link:", error);
        });
      },
    },
    menuCard,
  );

  captureService = service;
  trayManager = tray;
  dashboardWindow = dashboard;
  menuCardRenderer = menuCard;

  registerArchiveIpc(store, timezone);
  tray.initialize();
  service.onState((state) => tray.render(state));
  await service.start();
});

app.on("before-quit", (event) => {
  // First pass: defer the quit once, flush the last interval best-effort, then
  // really quit. Second pass (after our app.quit) tears everything down.
  if (quitting || !captureService) {
    captureService?.dispose();
    trayManager?.dispose();
    dashboardWindow?.dispose();
    menuCardRenderer?.dispose();
    return;
  }

  event.preventDefault();
  quitting = true;
  const flush = captureService.flush();
  const bounded = Promise.race([
    flush,
    new Promise<void>((resolve) => setTimeout(resolve, QUIT_FLUSH_TIMEOUT_MS)),
  ]);
  void bounded.finally(() => {
    captureService?.dispose();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  // Tray-only app: closing the dashboard must not quit it on macOS.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
