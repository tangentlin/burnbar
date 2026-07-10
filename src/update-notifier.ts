import { createRequire } from "node:module";
import type { BurnbarLogger } from "./logger.js";
import {
  installedNotificationContent,
  updateNotificationContent,
} from "./update-notification-content.js";
import type { UpdateState, UpdateStatus } from "./types.js";

// electron ships as a native module; createRequire defers loading it (mirrors
// update-service.ts's electron-updater interop) so merely importing this module
// — e.g. from a unit test or a browser story that only wants the copy — never
// pulls Electron in. Only the default presenter, when actually shown, requires it.
const require = createRequire(import.meta.url);

/** One notification to present: its copy plus an optional click action. */
export type NotificationSpec = {
  title: string;
  body: string;
  onClick?: () => void;
};

/**
 * The seam that actually surfaces a notification. Defaults to the macOS
 * `Notification`; a test injects a fake to assert the notifier's logic (which
 * transitions fire, click wiring) without the OS.
 */
export type NotificationPresenter = (spec: NotificationSpec) => void;

export type UpdateNotifierOptions = {
  logger?: BurnbarLogger;
  present?: NotificationPresenter;
};

/**
 * Surfaces the update states that need a user action as macOS notifications, so
 * the required next step isn't buried in a closed tray menu. Complements the
 * tray-icon badge (tray-icon.ts) — together they close the discoverability gap
 * recorded in ADR-011's attention-cues amendment.
 *
 * Fires only on the *transition into* a state (tracked via `lastStatus`), so a
 * repeated push of the same state never re-notifies. Per the "download auto,
 * restart passive" decision, the "available" notification is clickable (starts
 * the download); the "downloaded" one is informational only — restart stays the
 * tray's single `quitAndInstall()` call site (ADR-011).
 *
 * Best-effort throughout: a notification failure is logged, never thrown — the
 * same never-interrupt posture as the rest of the update path.
 */
export class UpdateNotifier {
  private lastStatus: UpdateStatus | null = null;
  private readonly logger: BurnbarLogger | undefined;
  private readonly present: NotificationPresenter;

  constructor(
    private readonly onDownload: () => void,
    options: UpdateNotifierOptions = {},
  ) {
    this.logger = options.logger;
    this.present = options.present ?? ((spec) => this.presentViaElectron(spec));
  }

  /** React to a pushed {@link UpdateState}, notifying once on entering a state. */
  handle(state: UpdateState): void {
    const previous = this.lastStatus;
    this.lastStatus = state.status;
    if (state.status === previous) {
      return;
    }
    const content = updateNotificationContent(state);
    if (!content) {
      return;
    }
    // Only the "available" notification acts on click — it consents to the
    // download; "downloaded" is passive so a restart stays the tray's job.
    const onClick = state.status === "available" ? this.onDownload : undefined;
    this.present({ ...content, onClick });
  }

  /** One-time confirmation shown after relaunching onto a newly installed version. */
  announceInstalled(version: string): void {
    this.present(installedNotificationContent(version));
  }

  private presentViaElectron(spec: NotificationSpec): void {
    try {
      const { Notification } = require("electron") as typeof import("electron");
      if (!Notification.isSupported()) {
        return;
      }
      const notification = new Notification({ title: spec.title, body: spec.body });
      if (spec.onClick) {
        notification.on("click", spec.onClick);
      }
      notification.show();
    } catch (error) {
      this.logger?.log("error", "Failed to show update notification", error);
    }
  }
}
