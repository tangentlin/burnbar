import { ipcMain } from "electron";
import { deriveSeries } from "./derive.js";
import { localDateString } from "./time.js";
import type { ArchiveStore } from "./store.js";
import type { DashboardSeries, SeriesDimension, SeriesRange, SeriesRequest } from "./types.js";

export const SERIES_CHANNEL = "archive:get-series";

const RANGES = new Set<string>(["30d", "90d", "all"]);
const DIMENSIONS = new Set<string>(["none", "model", "agent"]);

/**
 * Wire the read-only archive query the dashboard renderer calls through the
 * preload bridge. The renderer never touches the store directly; it asks for a
 * derived series and the main process reads + derives. Inputs are validated and
 * defaulted defensively even though the only caller is our own renderer.
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
}
