import type { Meta, StoryObj } from "@storybook/html-vite";
// Extension-less so Vite resolves the .ts — the real production functions, not
// a re-implementation (see badge.stories.ts for the same convention). Because
// `card.ts` keeps its animation session as module-scoped state (by design —
// there's exactly one hidden BrowserWindow instance in production, see
// ADR-009/ADR-013), only one of these stories can drive a *live* animation at
// a time; each `render()` calls `resetCardSession()` so switching stories
// always starts clean.
import { FRAME_INTERVAL_MS } from "../src/card-animator";
import {
  drawCard,
  renderCardFrame,
  resetCardSession,
  setEmbersActive,
} from "../src/menu-card/card";
import type { MenuCardData } from "../src/types";

const meta: Meta = {
  title: "Menu Card",
  parameters: {
    docs: {
      description: {
        component:
          "The tray's stats card, driven by the real animation engine " +
          "(`src/menu-card/animation.ts` + `src/menu-card/card.ts`) — these stories call the exact " +
          "`renderCardFrame`/`setEmbersActive`/`drawCard` functions Electron's hidden renderer window calls, " +
          "not a re-implementation. They also double as the frame-rate/flicker spike issues #52-#54 asked for " +
          "before committing to the full build: the ember loop here runs at the same ~24fps cadence as the real " +
          "main-process poller (`card-animator.ts`'s own `FRAME_INTERVAL_MS`). What they *can't* confirm is " +
          "whether swapping a live `MenuItem.icon` on an already-open native macOS menu is smooth — that's " +
          "Electron/AppKit behavior only verifiable on a real Mac. See ADR-013.",
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

function note(text: string): HTMLElement {
  const el = document.createElement("p");
  el.textContent = text;
  el.style.cssText =
    "max-width:320px;margin-top:10px;font:11px -apple-system,system-ui,sans-serif;color:#999";
  return el;
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

/**
 * Drives a RAF loop against the real `renderCardFrame`, throttled to the same
 * cadence the main-process poller uses (so the "watch for flicker" spike is
 * actually representative, not just running at the browser's native 60Hz+),
 * and skips the `<img src>` write when a frame is byte-identical to the last
 * one painted. Self-stops once the `<img>` leaves the DOM.
 */
function driveLive(img: HTMLImageElement, getData: () => MenuCardData): void {
  let lastPaintMs = 0;
  let lastPng = "";
  const tick = (nowMs: number): void => {
    if (!img.isConnected) {
      return;
    }
    if (nowMs - lastPaintMs >= FRAME_INTERVAL_MS) {
      lastPaintMs = nowMs;
      const frame = renderCardFrame(getData(), nowMs);
      if (frame.png && frame.png !== lastPng) {
        lastPng = frame.png;
        img.src = frame.png;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The "mount a live-driven card" preamble every animated story shares: reset the session, build the panel + image, and start driving it. */
function mountLiveCard(): {
  wrap: HTMLElement;
  img: HTMLImageElement;
  setData: (data: MenuCardData) => void;
  getData: () => MenuCardData;
} {
  resetCardSession();
  const wrap = panel();
  const img = cardImage();
  wrap.appendChild(img);
  let data = BASE_DATA;
  driveLive(img, () => data);
  return {
    wrap,
    img,
    setData: (next) => {
      data = next;
    },
    getData: () => data,
  };
}

/** A button that toggles `setEmbersActive` (simulating menu open/close) and relabels itself. */
function emberToggleButton(openLabel: string, closeLabel: string): HTMLButtonElement {
  let open = false;
  const toggle = button(openLabel, () => {
    open = !open;
    setEmbersActive(open, performance.now());
    toggle.textContent = open ? closeLabel : openLabel;
  });
  return toggle;
}

export const SettledReference: StoryObj = {
  name: "Settled reference (no animation)",
  render: () => {
    const wrap = panel();
    const img = cardImage();
    img.src = drawCard(BASE_DATA);
    wrap.appendChild(img);
    wrap.appendChild(
      note("The fully-static paint — every animated story should end up looking like this."),
    );
    return wrap;
  },
};

export const OdometerDigitRoll: StoryObj = {
  name: "Odometer digit roll (issue #52)",
  render: () => {
    const { wrap, setData, getData } = mountLiveCard();

    wrap.appendChild(
      button("Bump values (roll digits)", () => {
        setData(bumpedData(getData()));
      }),
    );
    let autoplay: ReturnType<typeof setInterval> | null = null;
    const autoplayBtn = button("Start autoplay", () => {
      if (autoplay) {
        clearInterval(autoplay);
        autoplay = null;
        autoplayBtn.textContent = "Start autoplay";
        return;
      }
      autoplayBtn.textContent = "Stop autoplay";
      autoplay = setInterval(() => {
        setData(bumpedData(getData()));
      }, 2200);
    });
    wrap.appendChild(autoplayBtn);
    wrap.appendChild(
      note(
        "First paint never rolls (nothing to roll from); each bump rolls only the digits that changed.",
      ),
    );
    return wrap;
  },
};

export const BarGrowthReveal: StoryObj = {
  name: "Bar-chart grow-from-baseline (issue #54)",
  render: () => {
    const { wrap, setData, getData } = mountLiveCard();

    wrap.appendChild(
      button("New 30-day data (regrow bars)", () => {
        setData({ ...getData(), spark: freshSpark() });
      }),
    );
    wrap.appendChild(
      button("Toggle theme only (must NOT replay)", () => {
        setData({ ...getData(), dark: !getData().dark });
      }),
    );
    wrap.appendChild(
      note("Reload the story to see the initial from-baseline reveal on first paint."),
    );
    return wrap;
  },
};

export const EmberParticles: StoryObj = {
  name: "Ember particles while menu is open (issue #53)",
  render: () => {
    const { wrap, getData } = mountLiveCard();
    // Prime the session with one settled frame before embers can attach — in
    // production the card always has data before the menu can be opened.
    renderCardFrame(getData(), performance.now());

    wrap.appendChild(emberToggleButton("Open menu (start embers)", "Close menu (stop embers)"));
    wrap.appendChild(
      note(
        'Spike check: watch for flicker/stutter with the menu "open" for 30s+ — this loop runs at the same ' +
          "~24fps cadence as the real main-process poller.",
      ),
    );
    return wrap;
  },
};

export const FullCardLive: StoryObj = {
  name: "Full card, live (all three together)",
  render: () => {
    const { wrap, setData, getData } = mountLiveCard();

    wrap.appendChild(
      button("Bump values", () => {
        setData(bumpedData(getData()));
      }),
    );
    wrap.appendChild(
      button("New 30-day data", () => {
        setData({ ...getData(), spark: freshSpark() });
      }),
    );
    wrap.appendChild(emberToggleButton("Open menu", "Close menu"));
    return wrap;
  },
};
