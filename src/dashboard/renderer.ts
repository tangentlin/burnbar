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
  HeatmapBreakdownEntry,
  HeatmapCell,
  HeatmapSeries,
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

type View = "chart" | "heatmap";

let chart: Chart | null = null;
let range: SeriesRange = "30d";
let dimension: SeriesDimension = "none";
let view: View = "chart";
// The cells backing the rendered grid, indexed by each cell element's data-index.
let heatmapCells: HeatmapCell[] = [];

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
  for (const button of document.querySelectorAll<HTMLButtonElement>("#view button")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  // The heatmap is keyed to total cost, so the model/agent breakdown toggle
  // doesn't apply — hide it in that view rather than leave a dead control.
  byId("dimension").hidden = view === "heatmap";
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

// --- Heatmap (calendar) ---------------------------------------------------

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** UTC weekday (0=Sun … 6=Sat) of a YYYY-MM-DD — UTC keeps the calendar day exact. */
function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * Build a cost → intensity level (0 = no spend, 1–4 = ascending) from the day
 * costs. Buckets split the *positive* costs by quartile so a single outlier day
 * can't wash the rest of the grid out to near-empty (a linear ramp would).
 */
function levelForCost(costs: number[]): (cost: number) => number {
  const positive = costs.filter((cost) => cost > 0).sort((a, b) => a - b);
  if (positive.length === 0) {
    return () => 0;
  }
  const quantile = (p: number) =>
    positive[Math.min(positive.length - 1, Math.floor(p * positive.length))];
  const q1 = quantile(0.25);
  const q2 = quantile(0.5);
  const q3 = quantile(0.75);
  return (cost) => {
    if (cost <= 0) {
      return 0;
    }
    if (cost <= q1) {
      return 1;
    }
    if (cost <= q2) {
      return 2;
    }
    if (cost <= q3) {
      return 3;
    }
    return 4;
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] as string,
  );
}

function breakdownRows(title: string, entries: HeatmapBreakdownEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  const rows = entries
    .map(
      (entry) =>
        `<div class="tt-row"><span class="tt-name">${escapeHtml(entry.label)}</span>` +
        `<span class="tt-val">${usd.format(entry.cost)} · ${compact.format(entry.tokens)}</span></div>`,
    )
    .join("");
  return `<div class="tt-section">${title}</div>${rows}`;
}

function tooltipHtml(cell: HeatmapCell): string {
  const head = `<div class="tt-date">${friendlyDate(cell.date)}</div>`;
  if (cell.cost <= 0 && cell.tokens <= 0) {
    return `${head}<div class="tt-total tt-empty">No usage</div>`;
  }
  const total = `<div class="tt-total">${usd.format(cell.cost)} · ${compact.format(cell.tokens)} tokens</div>`;
  return (
    head + total + breakdownRows("By model", cell.models) + breakdownRows("By agent", cell.agents)
  );
}

/** Human-readable value for the cell's `aria-label`, so detail isn't color-only. */
function cellAriaLabel(cell: HeatmapCell): string {
  if (cell.cost <= 0 && cell.tokens <= 0) {
    return `${friendlyDate(cell.date)}: no usage`;
  }
  return `${friendlyDate(cell.date)}: ${usd.format(cell.cost)}, ${compact.format(cell.tokens)} tokens`;
}

function showTooltip(cell: HeatmapCell, target: HTMLElement): void {
  const tip = byId<HTMLDivElement>("heatmap-tooltip");
  tip.innerHTML = tooltipHtml(cell);
  tip.hidden = false;
  const anchor = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(
      anchor.left + anchor.width / 2 - tipRect.width / 2,
      window.innerWidth - tipRect.width - 8,
    ),
  );
  const above = anchor.top - tipRect.height - 8;
  const top = above < 8 ? anchor.bottom + 8 : above; // flip below when there's no room above
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTooltip(): void {
  byId<HTMLDivElement>("heatmap-tooltip").hidden = true;
}

function drawHeatmap(series: HeatmapSeries): void {
  heatmapCells = series.cells;
  const grid = byId<HTMLDivElement>("heatmap-grid");
  const months = byId<HTMLDivElement>("heatmap-months");
  grid.replaceChildren();
  months.replaceChildren();
  if (series.cells.length === 0) {
    return;
  }

  const levelOf = levelForCost(series.cells.map((cell) => cell.cost));
  const leading = weekdayOf(series.cells[0].date); // blanks before the first day's weekday row
  const columns = Math.ceil((leading + series.cells.length) / 7);
  months.style.setProperty("--cols", String(columns));

  for (let blank = 0; blank < leading; blank++) {
    const filler = document.createElement("div");
    filler.className = "heatmap-cell is-blank";
    grid.appendChild(filler);
  }

  let priorMonth = "";
  series.cells.forEach((cell, index) => {
    const element = document.createElement("div");
    element.className = "heatmap-cell";
    element.dataset.level = String(levelOf(cell.cost));
    element.dataset.index = String(index);
    element.setAttribute("role", "gridcell");
    element.setAttribute("aria-label", cellAriaLabel(cell));
    element.tabIndex = 0;
    grid.appendChild(element);

    const month = cell.date.slice(0, 7);
    if (month !== priorMonth) {
      priorMonth = month;
      const label = document.createElement("span");
      label.className = "heatmap-month";
      label.textContent = MONTH_NAMES[Number(cell.date.slice(5, 7)) - 1];
      label.style.gridColumnStart = String(Math.floor((leading + index) / 7) + 1);
      months.appendChild(label);
    }
  });
}

function wireHeatmapHover(): void {
  const grid = byId<HTMLDivElement>("heatmap-grid");
  const onEnter = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      ".heatmap-cell:not(.is-blank)",
    );
    if (!target || target.dataset.index === undefined) {
      hideTooltip();
      return;
    }
    showTooltip(heatmapCells[Number(target.dataset.index)], target);
  };
  grid.addEventListener("mouseover", onEnter);
  grid.addEventListener("focusin", onEnter);
  grid.addEventListener("mouseleave", hideTooltip);
  grid.addEventListener("focusout", hideTooltip);
}

async function refresh(): Promise<void> {
  const error = byId<HTMLParagraphElement>("error");
  const empty = byId<HTMLParagraphElement>("empty");
  const canvas = byId<HTMLCanvasElement>("chart");
  const heatmap = byId<HTMLDivElement>("heatmap");
  try {
    if (view === "heatmap") {
      const series = await window.burnbar.getHeatmap({ range });
      byId("total-label").textContent = RANGE_LABELS[series.range];
      byId("total-value").textContent = usd.format(series.totalCost);

      const hasData = series.cells.some((cell) => cell.cost > 0);
      error.hidden = true;
      empty.hidden = hasData;
      canvas.hidden = true;
      heatmap.hidden = !hasData;
      if (hasData) {
        drawHeatmap(series);
      }
      return;
    }

    const series = await window.burnbar.getSeries({ range, dimension });
    byId("total-label").textContent = RANGE_LABELS[series.range];
    byId("total-value").textContent = usd.format(series.totalCost);

    const hasData = series.datasets.some((dataset) => dataset.data.some((value) => value > 0));
    error.hidden = true;
    empty.hidden = hasData;
    heatmap.hidden = true;
    canvas.hidden = !hasData;
    if (hasData) {
      draw(series);
    }
  } catch (cause) {
    error.hidden = false;
    empty.hidden = true;
    canvas.hidden = true;
    heatmap.hidden = true;
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
  byId("view").addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-view]");
    if (!target) {
      return;
    }
    view = target.dataset.view as View;
    setControlState();
    void refresh();
  });
  wireHeatmapHover();
  byId("export-json").addEventListener("click", () => void exportJson());
  byId("export-csv").addEventListener("click", () => void exportCsv());
}

wireControls();
setControlState();
void refresh();
