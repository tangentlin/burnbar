import { Notification } from "electron";
import type { BurnbarLogger } from "./logger.js";
import type { UpdateState, UpdateStatus } from "./types.js";

/**
 * Surfaces the update states that need a user action as macOS notifications, so
 * the required next step isn't buried in a closed tray menu. Complements the
 * tray-icon badge (tray-icon.ts) — together they close the discoverability gap
 * recorded in ADR-011's attention-cues amendment.
 *
 * Fires only on the *transition into* a state (tracked via `lastStatus`), so a
 * repeated push of the same state never re-notifies. Per the "download auto,
 * restart passive" decision, clicking the "available" notification starts the
 * download; the "downloaded" notification is informational only — restart stays
 * the tray's single `quitAndInstall()` call site (ADR-011).
 *
 * Best-effort throughout: a notification failure is logged, never thrown — the
 * same never-interrupt posture as the rest of the update path.
 */
export class UpdateNotifier {
  private lastStatus: UpdateStatus | null = null;

  constructor(
    private readonly onDownload: () => void,
    private readonly logger?: BurnbarLogger,
  ) {}

  /** React to a pushed {@link UpdateState}, notifying once on entering a state. */
  handle(state: UpdateState): void {
    const previous = this.lastStatus;
    this.lastStatus = state.status;
    if (state.status === previous) {
      return;
    }

    const version = state.version ?? "";
    if (state.status === "available") {
      this.show({
        title: "Burnbar update available",
        body: version
          ? `Version ${version} is ready to download. Click to download.`
          : "A new version is ready to download. Click to download.",
        onClick: this.onDownload,
      });
    } else if (state.status === "downloaded") {
      this.show({
        title: "Burnbar update ready to install",
        body: `${version ? `Version ${version} is` : "An update is"} ready — open Burnbar in the menu bar and choose “Restart to Update.”`,
      });
    }
  }

  /** One-time confirmation shown after relaunching onto a newly installed version. */
  announceInstalled(version: string): void {
    this.show({
      title: "Burnbar updated",
      body: `You’re now running version ${version}.`,
    });
  }

  private show(options: { title: string; body: string; onClick?: () => void }): void {
    try {
      if (!Notification.isSupported()) {
        return;
      }
      const notification = new Notification({ title: options.title, body: options.body });
      if (options.onClick) {
        notification.on("click", options.onClick);
      }
      notification.show();
    } catch (error) {
      this.logger?.log("error", "Failed to show update notification", error);
    }
  }
}
