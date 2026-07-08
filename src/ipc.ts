import { ipcMain } from "electron";
import { deriveHeatmap, deriveSeries } from "./derive.js";
import { localDateString } from "./time.js";
import type { ArchiveStore } from "./store.js";
import type {
  DashboardSeries,
  ExportData,
  HeatmapRequest,
  HeatmapSeries,
  SeriesDimension,
  SeriesRange,
  SeriesRequest,
} from "./types.js";

export const SERIES_CHANNEL = "archive:get-series";
export const HEATMAP_CHANNEL = "archive:get-heatmap";
export const EXPORT_CHANNEL = "archive:export";

const RANGES = new Set<string>(["30d", "90d", "all"]);
const DIMENSIONS = new Set<string>(["none", "model", "agent"]);

/**
 * Wire the read-only archive queries the dashboard renderer calls through the
 * preload bridge. The renderer never touches the store directly.
 */
export function registerArchiveIpc(store: ArchiveStore, timezone: string): void {
  ipcMain.handle(SERIES_CHANNEL, async (_event, raw: unknown): Promise<DashboardSeries> => {
    const request = (raw ?? {}) as Partial<SeriesRequest>;
    const range: SeriesRange = request.range && RANGES.has(request.range) ? request.range : "all";
    const dimension: SeriesDimension =
      request.dimension && DIMENSIONS.has(request.dimension) ? request.dimension : "none";

    const [daily, sessions] = await Promise.all([store.readAllDaily(), store.readAllSessions()]);
    const today = localDateString(timezone);
    return deriveSeries(daily, sessions, { range, dimension, timezone, today });
  });

  ipcMain.handle(HEATMAP_CHANNEL, async (_event, raw: unknown): Promise<HeatmapSeries> => {
    const request = (raw ?? {}) as Partial<HeatmapRequest>;
    const range: SeriesRange = request.range && RANGES.has(request.range) ? request.range : "all";

    const [daily, sessions] = await Promise.all([store.readAllDaily(), store.readAllSessions()]);
    const today = localDateString(timezone);
    return deriveHeatmap(daily, sessions, { range, timezone, today });
  });

  ipcMain.handle(EXPORT_CHANNEL, async (): Promise<ExportData> => {
    const [daily, sessions] = await Promise.all([store.readAllDaily(), store.readAllSessions()]);
    return { daily, sessions };
  });
}
