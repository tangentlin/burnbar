import type { Meta, StoryObj } from "@storybook/html-vite";
// Extension-less so Vite resolves the .ts — the real production function, not
// a re-implementation (see badge.stories.ts for the same convention).
import { drawCard } from "../src/menu-card/card";
import type { MenuCardData } from "../src/types";

const meta: Meta = {
  title: "Menu Card",
  parameters: {
    docs: {
      description: {
        component:
          "The tray's stats card, driven by the real `drawCard` function from `src/menu-card/card.ts` — the " +
          "same one-shot render Electron's hidden renderer window calls, not a re-implementation. The card has " +
          "no animation: an odometer-style digit roll, a bar-chart grow-from-baseline reveal, and drifting " +
          "ember particles (issues #52/#53/#54) were all tried and removed — Electron only repaints a " +
          "MenuItem's icon right before a menu opens or once it closes, never while the native tray dropdown " +
          "is already open and idle, so none of the three could ever actually be seen. See ADR-013 and its " +
          "amendments.",
      },
    },
  },
};
export default meta;

const PREVIEW_SCALE = 1.4;

const BASE_DATA: MenuCardData = {
  todayCost: 4.82,
  cost30d: 96.4,
  tokens30d: 8_200_000,
  todayTokens: 412_000,
  topModel: "claude-sonnet-5",
  spark: Array.from({ length: 30 }, (_, i) =>
    Math.max(0, 2 + Math.sin(i / 3) * 2 + (i % 7 === 0 ? 4 : 0)),
  ),
  dark: true,
};

function panel(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "display:inline-block;padding:20px;border-radius:14px;background:#1e1e22;font-family:-apple-system,system-ui,sans-serif";
  return el;
}

function cardImage(): HTMLImageElement {
  const img = document.createElement("img");
  img.width = 270 * PREVIEW_SCALE;
  img.height = 212 * PREVIEW_SCALE;
  img.style.cssText = "display:block;border-radius:8px";
  return img;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText =
    "margin-top:14px;margin-right:8px;padding:6px 12px;border-radius:6px;border:1px solid #555;" +
    "background:#2a2a2e;color:#eee;font:12px -apple-system,system-ui,sans-serif;cursor:pointer";
  btn.addEventListener("click", onClick);
  return btn;
}

function jitter(value: number, pct: number): number {
  return Math.max(0, value * (1 + (Math.random() * 2 - 1) * pct));
}

/** A plausible "new capture landed" update: every stat nudges, nothing drops to zero. */
function bumpedData(base: MenuCardData): MenuCardData {
  return {
    ...base,
    todayCost: Number(jitter(base.todayCost ?? 1, 0.6).toFixed(2)),
    cost30d: Number(jitter(base.cost30d, 0.4).toFixed(2)),
    tokens30d: Math.round(jitter(base.tokens30d, 0.4)),
    todayTokens: Math.round(jitter(base.todayTokens ?? 1000, 0.6)),
  };
}

function freshSpark(): number[] {
  return Array.from({ length: 30 }, () => Math.round(Math.random() * 800) / 100);
}

export const Default: StoryObj = {
  name: "Menu card",
  render: () => {
    const wrap = panel();
    const img = cardImage();
    let data = BASE_DATA;
    const paint = (): void => {
      img.src = drawCard(data);
    };
    paint();
    wrap.appendChild(img);
    wrap.appendChild(
      button("Bump values", () => {
        data = bumpedData(data);
        paint();
      }),
    );
    wrap.appendChild(
      button("New 30-day data", () => {
        data = { ...data, spark: freshSpark() };
        paint();
      }),
    );
    wrap.appendChild(
      button("Toggle theme", () => {
        data = { ...data, dark: !data.dark };
        paint();
      }),
    );
    return wrap;
  },
};
