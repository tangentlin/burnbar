import { app } from "electron";
import { createRequire } from "node:module";
import type { BurnbarLogger } from "./logger.js";
import type { UpdateState } from "./types.js";

// electron-updater ships CJS; createRequire mirrors capture.ts's interop
// pattern for requiring a CJS package from this ESM module.
const require = createRequire(import.meta.url);

// Fixed cadence for background update checks (minutes). Deliberately NOT tied to
// settings.ts's user-configurable refresh interval — that value can be 0
// (manual), which must never silently disable update checks; the two concerns
// (usage-data freshness vs. app-update freshness) are unrelated.
const UPDATE_CHECK_INTERVAL_MINUTES = 240;

const IDLE_STATE: UpdateState = { status: "idle", version: null, percent: null, error: null };

/**
 * The subset of electron-updater's `autoUpdater` surface UpdateService actually
 * uses, so it is dependency-injectable and unit-testable without a real
 * electron-updater instance or network — mirrors {@link CcusageRunner}'s DI
 * seam in capture.ts.
 */
export type UpdaterLike = {
  autoDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: (...args: never[]) => void): void;
};

// The slice of electron-updater's UpdateInfo / ProgressInfo payloads this
// service reads (see builder-util-runtime's updateInfo.d.ts / ProgressCallbackTransform.d.ts).
type UpdateInfoLike = { version: string };
type ProgressInfoLike = { percent: number };

export type UpdateServiceOptions = {
  updater?: UpdaterLike;
  intervalMinutes?: number;
  logger?: BurnbarLogger;
  // Injectable so tests (and a future non-darwin build) don't depend on the
  // real Electron `app` singleton's packaged state.
  isPackaged?: () => boolean;
};

/**
 * Tray-only auto-update, driven by electron-updater's GitHub-provider feed
 * (see ADR-011). Owns its own fixed-interval timer (independent of the
 * user-configurable usage-refresh cadence), pushes a serializable
 * {@link UpdateState} to its listener, and never surfaces a failure as
 * anything more than a logged, best-effort error state — mirrors
 * CaptureService's DI/best-effort shape (capture-service.ts).
 *
 * `autoDownload` is forced `false`: a download only starts from the tray's
 * explicit "Download Update" click, and `quitAndInstall` only fires from the
 * explicit "Restart to Update" click (never mid-use).
 */
export class UpdateService {
  private readonly updater: UpdaterLike;
  private readonly intervalMinutes: number;
  private readonly logger: BurnbarLogger | undefined;
  private readonly isPackaged: () => boolean;

  private stateListener: ((state: UpdateState) => void) | null = null;
  private state: UpdateState = IDLE_STATE;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Registered (event, listener) pairs so dispose() can unregister exactly
  // what the constructor attached — the updater instance is often a shared/
  // real singleton (electron-updater's autoUpdater), so leaving these behind
  // would leak listeners across repeated UpdateService construction.
  private readonly boundListeners: Array<[string, (...args: never[]) => void]> = [];

  constructor(options: UpdateServiceOptions = {}) {
    this.updater = options.updater ?? defaultUpdater();
    this.intervalMinutes = options.intervalMinutes ?? UPDATE_CHECK_INTERVAL_MINUTES;
    this.logger = options.logger;
    this.isPackaged = options.isPackaged ?? (() => app.isPackaged);

    // Downloads only ever start from the user's explicit tray click.
    this.updater.autoDownload = false;

    this.addListener("checking-for-update", () => {
      this.setState({ status: "checking", version: null, percent: null, error: null });
    });
    this.addListener("update-available", (info: unknown) => {
      const version = (info as UpdateInfoLike | undefined)?.version ?? null;
      this.setState({ status: "available", version, percent: null, error: null });
    });
    this.addListener("update-not-available", () => {
      this.setState(IDLE_STATE);
    });
    this.addListener("download-progress", (progress: unknown) => {
      const percent = (progress as ProgressInfoLike | undefined)?.percent ?? 0;
      // Preserve the version already known from update-available.
      this.setState({ status: "downloading", version: this.state.version, percent, error: null });
    });
    this.addListener("update-downloaded", (info: unknown) => {
      const version = (info as UpdateInfoLike | undefined)?.version ?? this.state.version;
      this.setState({ status: "downloaded", version, percent: null, error: null });
    });
    this.addListener("error", (error: unknown) => {
      this.reportFailure(error);
    });
  }

  /** Registers a listener and records it so dispose() can remove it. */
  private addListener(event: string, listener: (...args: never[]) => void): void {
    this.updater.on(event, listener);
    this.boundListeners.push([event, listener]);
  }

  onState(listener: (state: UpdateState) => void): void {
    this.stateListener = listener;
  }

  getState(): UpdateState {
    return this.state;
  }

  /** Check once immediately, then repeat on the fixed interval. */
  start(): void {
    void this.checkNow();
    this.scheduleTimer();
  }

  /** Manual "Check for Updates" trigger — also used for the periodic tick. */
  async checkNow(): Promise<void> {
    // electron-updater's own checkForUpdates() no-ops (resolves null) when the
    // app isn't packaged, but it still logs every call; skip the spam in dev.
    if (!this.isPackaged()) {
      return;
    }
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.reportFailure(error);
    }
  }

  /** Start the download; a defensive no-op outside the "available" state. */
  async downloadUpdate(): Promise<void> {
    if (this.state.status !== "available") {
      return;
    }
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.reportFailure(error);
    }
  }

  /**
   * Install + restart — only when a download has actually completed. The
   * "only from the explicit click" guarantee is enforced by main.ts wiring
   * this to the tray's Restart-to-Update row alone; this guard is the
   * service's own defense against a stray/premature call.
   */
  quitAndInstall(): void {
    if (this.state.status !== "downloaded") {
      return;
    }
    this.updater.quitAndInstall();
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const [event, listener] of this.boundListeners) {
      this.updater.off(event, listener);
    }
    this.boundListeners.length = 0;
  }

  private scheduleTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      void this.checkNow();
    }, this.intervalMinutes * 60_000);
  }

  private reportFailure(error: unknown): void {
    this.logger?.log("error", "auto-update check/download failed", error);
    this.setState({
      status: "error",
      version: this.state.version,
      percent: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private setState(state: UpdateState): void {
    this.state = state;
    this.stateListener?.(state);
  }
}

function defaultUpdater(): UpdaterLike {
  // Deferred require (not a static import) so merely importing update-service.ts
  // — e.g. from a test file — never triggers electron-updater's own
  // module-load side effects; only constructing a real UpdateService does.
  const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
  return autoUpdater;
}
