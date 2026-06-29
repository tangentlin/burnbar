import { app } from "electron";
import * as path from "node:path";
import { CaptureService } from "./capture-service.js";
import { registerArchiveIpc } from "./ipc.js";
import { ArchiveStore } from "./store.js";
import { systemTimezone } from "./time.js";
import { TrayManager } from "./tray.js";
import { DashboardWindow } from "./window.js";

// Bound the final flush so a hung ccusage can never block app shutdown.
const QUIT_FLUSH_TIMEOUT_MS = 5_000;

let captureService: CaptureService | null = null;
let trayManager: TrayManager | null = null;
let dashboardWindow: DashboardWindow | null = null;
let quitting = false;

app.whenReady().then(async () => {
  // Hide the dock icon on macOS for menu-bar-only operation.
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  const timezone = systemTimezone();
  const store = new ArchiveStore(path.join(app.getPath("userData"), "archive"));
  const service = new CaptureService({ store, timezone });
  const dashboard = new DashboardWindow();
  const tray = new TrayManager({ onOpenDashboard: () => dashboard.open() });

  captureService = service;
  trayManager = tray;
  dashboardWindow = dashboard;

  registerArchiveIpc(store, timezone);
  tray.initialize();
  service.onUsage((usage) => tray.render(usage));
  await service.start();
});

app.on("before-quit", (event) => {
  // First pass: defer the quit once, flush the last interval best-effort, then
  // really quit. Second pass (after our app.quit) tears everything down.
  if (quitting || !captureService) {
    captureService?.dispose();
    trayManager?.dispose();
    dashboardWindow?.dispose();
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
