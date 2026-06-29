import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import type { BurnbarBridge, DashboardSeries, SeriesDimension, SeriesRange } from "../types.js";

// Register only the Chart.js pieces this view uses so esbuild can tree-shake the
// rest of the library out of the renderer bundle.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

declare global {
  interface Window {
    burnbar: BurnbarBridge;
  }
}

// Distinct, color-blind-friendly hues cycled across stacked model/agent series.
const PALETTE = [
  "#6ea8fe",
  "#ffb86b",
  "#7ee787",
  "#ff7b9c",
  "#c4b5fd",
  "#5ad1c8",
  "#f2c16b",
  "#a3b1c2",
];

const RANGE_LABELS: Record<SeriesRange, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All-time",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

let chart: Chart | null = null;
let range: SeriesRange = "all";
let dimension: SeriesDimension = "none";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function setControlState(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("#range button")) {
    const active = button.dataset.range === range;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("#dimension button")) {
    const active = button.dataset.dim === dimension;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function draw(series: DashboardSeries): void {
  const canvas = byId<HTMLCanvasElement>("chart");
  const datasets = series.datasets.map((dataset, index) => ({
    label: dataset.label,
    data: dataset.data,
    backgroundColor: PALETTE[index % PALETTE.length],
    borderWidth: 0,
    borderRadius: 2,
  }));

  if (chart) {
    chart.data.labels = series.labels;
    chart.data.datasets = datasets;
    chart.update();
    return;
  }

  chart = new Chart(canvas, {
    type: "bar",
    data: { labels: series.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: (value) => usd.format(Number(value)) },
        },
      },
      plugins: {
        legend: { display: series.dimension !== "none", position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${usd.format(Number(item.parsed.y))}`,
          },
        },
      },
    },
  });
}

async function refresh(): Promise<void> {
  const error = byId<HTMLParagraphElement>("error");
  const empty = byId<HTMLParagraphElement>("empty");
  const canvas = byId<HTMLCanvasElement>("chart");
  try {
    const series = await window.burnbar.getSeries({ range, dimension });
    byId("total-label").textContent = RANGE_LABELS[series.range];
    byId("total-value").textContent = usd.format(series.totalCost);

    const hasData = series.datasets.some((dataset) => dataset.data.some((value) => value > 0));
    error.hidden = true;
    empty.hidden = hasData;
    canvas.hidden = !hasData;
    if (hasData) {
      draw(series);
    }
  } catch (cause) {
    error.hidden = false;
    empty.hidden = true;
    canvas.hidden = true;
    error.textContent = `Could not load usage: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

function wireControls(): void {
  byId("range").addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-range]");
    if (!target) {
      return;
    }
    range = target.dataset.range as SeriesRange;
    setControlState();
    void refresh();
  });
  byId("dimension").addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-dim]");
    if (!target) {
      return;
    }
    dimension = target.dataset.dim as SeriesDimension;
    setControlState();
    void refresh();
  });
}

wireControls();
setControlState();
void refresh();
