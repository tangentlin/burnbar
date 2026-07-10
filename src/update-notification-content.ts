import type { UpdateState } from "./types.js";

// The user-facing copy for update notifications, extracted as **pure** functions
// with no Electron/Node dependency, so the exact strings are shared by two
// consumers without drift: the main-process UpdateNotifier that shows them, and
// the Storybook notification story that mocks their appearance in the browser.

export type NotificationContent = {
  title: string;
  body: string;
};

/**
 * Copy for the two update transitions that warrant a notification (`available`,
 * `downloaded`), or `null` for every other status — mirrors the badge scope in
 * {@link badgeForStatus}. Whether a notification is *clickable* (only `available`,
 * to start the download) is the notifier's concern, not this content's.
 */
export function updateNotificationContent(state: UpdateState): NotificationContent | null {
  const version = state.version ?? "";
  switch (state.status) {
    case "available":
      return {
        title: "Burnbar update available",
        body: version
          ? `Version ${version} is ready to download. Click to download.`
          : "A new version is ready to download. Click to download.",
      };
    case "downloaded":
      return {
        title: "Burnbar update ready to install",
        body: `${version ? `Version ${version} is` : "An update is"} ready — open Burnbar in the menu bar and choose “Restart to Update.”`,
      };
    default:
      return null;
  }
}

/** Copy for the one-time confirmation shown after relaunching on a new version. */
export function installedNotificationContent(version: string): NotificationContent {
  return {
    title: "Burnbar updated",
    body: `You’re now running version ${version}.`,
  };
}
