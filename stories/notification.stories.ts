import type { Meta, StoryObj } from "@storybook/html-vite";
import type { NotificationContent } from "../src/update-notification-content";
import {
  installedNotificationContent,
  updateNotificationContent,
} from "../src/update-notification-content";
import type { UpdateStatus } from "../src/types";

const meta: Meta = {
  title: "Update/Notifications",
  parameters: {
    docs: {
      description: {
        component:
          "Mock macOS notification banners built from the **real** copy functions the app ships " +
          "(`updateNotificationContent` / `installedNotificationContent`). A real OS notification can only be " +
          "delivered on macOS; this previews the exact title/body strings and layout without launching the app. " +
          "The 'available' banner is the only one that acts on click in the app (it starts the download).",
      },
    },
  },
};
export default meta;

const APP_ICON_URL = "/icon.png"; // color-ish tray asset, served from assets/

function banner(content: NotificationContent, clickable: boolean): HTMLElement {
  const card = document.createElement("div");
  card.style.cssText =
    "display:flex;gap:12px;align-items:flex-start;width:340px;padding:14px 16px;" +
    "background:rgba(245,245,247,0.92);backdrop-filter:blur(20px);border-radius:16px;" +
    "box-shadow:0 8px 24px rgba(0,0,0,0.18);font-family:-apple-system,system-ui,sans-serif";

  const icon = document.createElement("img");
  icon.src = APP_ICON_URL;
  icon.width = 38;
  icon.height = 38;
  icon.style.cssText = "border-radius:8px;flex:0 0 auto;background:#1d1d1f;padding:4px";
  card.appendChild(icon);

  const text = document.createElement("div");
  text.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0";
  const title = document.createElement("div");
  title.textContent = content.title;
  title.style.cssText = "font:600 13px/1.3 -apple-system,system-ui,sans-serif;color:#1d1d1f";
  const body = document.createElement("div");
  body.textContent = content.body;
  body.style.cssText = "font:13px/1.35 -apple-system,system-ui,sans-serif;color:#3a3a3c";
  text.appendChild(title);
  text.appendChild(body);

  if (clickable) {
    const hint = document.createElement("div");
    hint.textContent = "▸ clicking starts the download";
    hint.style.cssText =
      "margin-top:4px;font:11px -apple-system,system-ui,sans-serif;color:#0a84ff";
    text.appendChild(hint);
  }
  card.appendChild(text);
  return card;
}

const VERSION = "1.4.0";

function contentFor(status: UpdateStatus): NotificationContent | null {
  return updateNotificationContent({ status, version: VERSION, percent: null, error: null });
}

function renderBanners(): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;gap:18px;padding:32px;background:#c8c8cc;min-height:100vh";

  const available = contentFor("available");
  if (available) {
    root.appendChild(labeled("Update detected (available)", banner(available, true)));
  }
  const downloaded = contentFor("downloaded");
  if (downloaded) {
    root.appendChild(labeled("Downloaded — ready to restart (passive)", banner(downloaded, false)));
  }
  root.appendChild(
    labeled(
      "After relaunch (post-update confirmation)",
      banner(installedNotificationContent(VERSION), false),
    ),
  );
  return root;
}

function labeled(label: string, node: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:8px";
  const tag = document.createElement("div");
  tag.textContent = label;
  tag.style.cssText = "font:600 12px -apple-system,system-ui,sans-serif;color:#3a3a3c";
  wrap.appendChild(tag);
  wrap.appendChild(node);
  return wrap;
}

export const AllBanners: StoryObj = {
  name: "All notifications",
  render: () => renderBanners(),
};
