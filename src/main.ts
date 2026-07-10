import { app, shell } from "electron";
import * as path from "node:path";
import { CaptureService } from "./capture-service.js";
import { registerArchiveIpc } from "./ipc.js";
import { BurnbarLogger } from "./logger.js";
import { MenuCardRenderer } from "./menu-card-window.js";
import { SettingsStore } from "./settings.js";
import { ArchiveStore } from "./store.js";
import { systemTimezone } from "./time.js";
import { TrayManager } from "./tray.js";
import { UpdateNotifier } from "./update-notifier.js";
import { UpdateService } from "./update-service.js";
import { DashboardWindow } from "./window.js";

// Bound the final flush so a hung ccusage can never block app shutdown.
const QUIT_FLUSH_TIMEOUT_MS = 5_000;
const GITHUB_URL = "https://github.com/tangentlin/burnbar";

let captureService: CaptureService | null = null;
let trayManager: TrayManager | null = null;
let dashboardWindow: DashboardWindow | null = null;
let menuCardRenderer: MenuCardRenderer | null = null;
let updateService: UpdateService | null = null;

app.whenReady().then(async () => {
  // Hide the dock icon on macOS for menu-bar-only operation.
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  const timezone = systemTimezone();
  const userData = app.getPath("userData");
  const logger = new BurnbarLogger(userData);
  const store = new ArchiveStore(path.join(userData, "archive"));
  const settings = new SettingsStore(path.join(userData, "settings.json"));

  await settings.load();
  await logger.rotateLogs();

  logger.log("info", `app start — timezone: ${timezone}`);

  // Detect an install that happened since the previous launch (the app relaunches
  // itself onto the new version) so we can confirm it once, then record the
  // running version for next time. Best-effort: a persistence failure is logged.
  const currentVersion = app.getVersion();
  const previousVersion = settings.getLastRunVersion();
  settings.setLastRunVersion(currentVersion).catch((error: unknown) => {
    logger.log("error", "Failed to persist last-run version", error);
  });

  const service = new CaptureService({
    store,
    timezone,
    refreshIntervalMinutes: settings.getRefreshIntervalMinutes(),
    logger,
  });
  const updates = new UpdateService({ logger });
  // Clicking the "available" notification consents to the download; "downloaded"
  // is passive (restart stays the tray's sole quitAndInstall click) — see ADR-011.
  const updateNotifier = new UpdateNotifier(() => void updates.downloadUpdate(), { logger });
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
        settings.setRefreshIntervalMinutes(minutes).catch((error: unknown) => {
          logger.log("error", "Failed to persist refresh interval", error);
        });
      },
      onAbout: () => {
        shell.openExternal(GITHUB_URL).catch((error: unknown) => {
          logger.log("error", "Failed to open About link", error);
        });
      },
      onOpenLogFolder: () => {
        shell.openPath(logger.logsDir).catch((error: unknown) => {
          logger.log("error", "Failed to open log folder", error);
        });
      },
      onCopyDiagnostics: () => {
        const destDir = app.getPath("desktop");
        logger
          .zipDiagnostics(destDir)
          .then((zipPath) => shell.showItemInFolder(zipPath))
          .catch((error: unknown) => {
            logger.log("error", "Failed to copy diagnostics to Desktop", error);
          });
      },
      onCheckForUpdates: () => void updates.checkNow(),
      onDownloadUpdate: () => void updates.downloadUpdate(),
      // The only call site for quitAndInstall — the explicit-click guarantee
      // (ADR-011) is enforced here, not just inside UpdateService.
      onRestartToUpdate: () => updates.quitAndInstall(),
    },
    menuCard,
  );

  captureService = service;
  trayManager = tray;
  dashboardWindow = dashboard;
  menuCardRenderer = menuCard;
  updateService = updates;

  registerArchiveIpc(store, timezone);
  tray.initialize();
  service.onState((state) => tray.render(state));
  // Fan the update state out to both the tray (badge + menu row) and the notifier.
  updates.onState((state) => {
    tray.renderUpdate(state);
    updateNotifier.handle(state);
  });

  // A changed version means the previous launch's update was just installed.
  if (previousVersion && previousVersion !== currentVersion) {
    updateNotifier.announceInstalled(currentVersion);
  }

  await service.start();
  updates.start();
});

let quitting = false;

app.on("before-quit", (event) => {
  // First pass: defer the quit once, flush the last interval best-effort, then
  // really quit. Second pass (after our app.quit) tears everything down.
  //
  // Note: UpdateService.quitAndInstall() itself calls the real electron-updater's
  // quitAndInstall(), which internally triggers app.quit()/app.exit() — that
  // re-enters this same handler. It just rides the bounded flush-then-quit
  // dance below like any other quit, delaying the install+relaunch by at most
  // QUIT_FLUSH_TIMEOUT_MS while the last usage capture flushes.
  if (quitting || !captureService) {
    captureService?.dispose();
    trayManager?.dispose();
    dashboardWindow?.dispose();
    menuCardRenderer?.dispose();
    updateService?.dispose();
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
    updateService?.dispose();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  // Tray-only app: closing the dashboard must not quit it on macOS.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
