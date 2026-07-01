import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { localDateString, systemTimezone } from "../time.js";
import type {
  BurnbarBridge,
  DailyRecord,
  DashboardSeries,
  SeriesDimension,
  SeriesRange,
} from "../types.js";

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
// Token counts run to the millions; compact notation keeps tooltips readable.
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "2026-06-28" → "Sun, Jun 28, 2026" (formatted in UTC so the calendar day is exact). */
function friendlyDate(iso: string): string {
  if (!iso) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

let chart: Chart | null = null;
let range: SeriesRange = "30d";
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

// Each Chart dataset carries a parallel `tokens` array (a custom prop Chart.js
// passes through) so the tooltip can report token counts per segment.
type TokenDataset = { tokens: number[] };
const tokensAt = (dataset: unknown, index: number): number =>
  (dataset as TokenDataset).tokens?.[index] ?? 0;

function draw(series: DashboardSeries): void {
  const canvas = byId<HTMLCanvasElement>("chart");
  const datasets = series.datasets.map((dataset, index) => ({
    label: dataset.label,
    data: dataset.data,
    tokens: dataset.tokens,
    backgroundColor: PALETTE[index % PALETTE.length],
    borderWidth: 0,
    borderRadius: 2,
  }));
  // Legend only earns its space when more than one entity is stacked.
  const showLegend = datasets.length > 1;

  if (chart) {
    chart.data.labels = series.labels;
    chart.data.datasets = datasets;
    if (chart.options.plugins?.legend) {
      chart.options.plugins.legend.display = showLegend;
    }
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
        legend: { display: showLegend, position: "bottom" },
        tooltip: {
          callbacks: {
            title: (items) => friendlyDate(items[0]?.label ?? ""),
            label: (item) => {
              const tokens = tokensAt(item.dataset, item.dataIndex);
              return `${item.dataset.label}: ${usd.format(Number(item.parsed.y))} · ${compact.format(tokens)} tokens`;
            },
            // Day total when several entities stack (single series is already its own total).
            footer: (items) => {
              if (items.length <= 1) {
                return "";
              }
              let cost = 0;
              let tokens = 0;
              for (const item of items) {
                cost += Number(item.parsed.y);
                tokens += tokensAt(item.dataset, item.dataIndex);
              }
              return `Total: ${usd.format(cost)} · ${compact.format(tokens)} tokens`;
            },
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

// --- Export helpers -------------------------------------------------------

const CSV_HEADER =
  "date,timezone,agents,totalCost,totalTokens,inputTokens,outputTokens,cacheCreationTokens,cacheReadTokens";

function dailyToCsvRow(record: DailyRecord): string {
  const agents = `"${record.agents.join(",")}"`;
  const t = record.totals;
  return [
    record.date,
    record.timezone,
    agents,
    t.totalCost.toFixed(6),
    t.totalTokens,
    t.inputTokens,
    t.outputTokens,
    t.cacheCreationTokens,
    t.cacheReadTokens,
  ].join(",");
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportJson(): Promise<void> {
  const data = await window.burnbar.exportData();
  const json = JSON.stringify(data, null, 2);
  const date = localDateString(systemTimezone());
  triggerDownload(json, `burnbar-usage-${date}.json`, "application/json");
}

async function exportCsv(): Promise<void> {
  const data = await window.burnbar.exportData();
  const rows = [CSV_HEADER, ...data.daily.map(dailyToCsvRow)];
  const csv = rows.join("\n") + "\n";
  const date = localDateString(systemTimezone());
  triggerDownload(csv, `burnbar-usage-${date}.csv`, "text/csv");
}

// --- Control wiring -------------------------------------------------------

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
  byId("export-json").addEventListener("click", () => void exportJson());
  byId("export-csv").addEventListener("click", () => void exportCsv());
}

wireControls();
setControlState();
void refresh();
