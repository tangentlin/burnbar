// Shared types for Burnbar.
//
// Two families live here: the small tray-display DTOs the menu bar renders, and
// the durable *archive* records the capture/store layer persists. Archive
// records mirror ccusage's field names on purpose so the normalizer in
// `capture.ts` stays a thin rename-free mapping — see docs/DOMAIN.md.

export type UsageStats = {
  totalTokens: number;
  cost: number;
};

export type UsageData = {
  daily: UsageStats | null;
  total: UsageStats | null;
  error?: string;
};

// --- ccusage raw output (the subset Burnbar consumes) ---------------------

/** A single per-model line as emitted under a row's `modelBreakdowns[]`. */
export type CcusageModelBreakdown = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
};

/**
 * One row from a normalized top-level ccusage command. `daily` and `session`
 * share this shape; `period` is the ISO date (daily) or session UUID (session),
 * and `metadata` carries `agents` (daily) or `lastActivity` (session).
 */
export type CcusageRow = {
  agent: string;
  period: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelBreakdowns: CcusageModelBreakdown[];
  modelsUsed: string[];
  metadata?: {
    agents?: string[];
    lastActivity?: string;
  };
};

export type CcusageReportTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
};

/** `ccusage daily --json` — per-date rows with all agents combined. */
export type CcusageDailyReport = {
  daily: CcusageRow[];
  totals: CcusageReportTotals;
};

/** `ccusage session --json` — per-session, per-agent rows. */
export type CcusageSessionReport = {
  session: CcusageRow[];
  totals: CcusageReportTotals;
};

// --- Durable archive records ----------------------------------------------

/** The five token counts ccusage reports; `totalTokens` = sum of the other four. */
export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
};

/** A per-model line in an archive record: token counts plus the priced cost. */
export type ModelBreakdown = TokenCounts & {
  modelName: string;
  cost: number;
};

/** Record-level rollup: token counts plus the summed cost across models. */
export type RecordTotals = TokenCounts & {
  totalCost: number;
};

/**
 * One local date's combined usage (all agents). Authoritative for the
 * cost-over-time and by-model dashboard views.
 */
export type DailyRecord = {
  date: string; // YYYY-MM-DD in `timezone`
  timezone: string; // IANA tz the date was bucketed in
  agents: string[]; // source agents that contributed
  totals: RecordTotals;
  models: ModelBreakdown[];
  firstCapturedAt: string; // ISO — earliest capture, preserved across merges
  lastCapturedAt: string; // ISO — latest capture, advances on every merge
};

/**
 * One agent session, keyed by `sessionId` so a session that spans days is never
 * duplicated. Source for the by-agent dashboard view.
 */
export type SessionRecord = {
  sessionId: string;
  agent: string;
  lastActivity: string; // ISO from ccusage `metadata.lastActivity`
  totals: RecordTotals;
  models: ModelBreakdown[];
  firstCapturedAt: string;
  lastCapturedAt: string;
};

/** Archive-wide metadata; `schemaVersion` gates future migrations. */
export type ArchiveManifest = {
  schemaVersion: number;
  timezone: string;
  ccusageVersion: string;
  firstCaptureAt: string;
  lastCaptureAt: string;
};

// --- Dashboard series (read-time, derived from archive) -------------------

export type SeriesRange = "30d" | "90d" | "all";
export type SeriesDimension = "none" | "model" | "agent";

export type SeriesRequest = {
  range: SeriesRange;
  dimension: SeriesDimension;
};

/** One stacked line/area in the chart: a model, an agent, or the lone "Cost". */
export type SeriesDataset = {
  label: string;
  data: number[]; // cost per `labels` index
  tokens: number[]; // total tokens per `labels` index (parallel to `data`)
};

export type DashboardSeries = {
  range: SeriesRange;
  dimension: SeriesDimension;
  labels: string[]; // YYYY-MM-DD, ascending
  datasets: SeriesDataset[];
  totalCost: number; // sum over the visible range
};

// --- Heatmap (calendar) series --------------------------------------------

/** One model's or agent's share of a heatmap cell's day, for the hover detail. */
export type HeatmapBreakdownEntry = {
  label: string; // model name or agent name
  cost: number;
  tokens: number;
};

/**
 * One calendar day in the GitHub-style heatmap. Color intensity is keyed to
 * `cost`; the parallel `models`/`agents` splits (each cost-descending) feed the
 * cell's hover detail. Days with no usage carry `cost`/`tokens` of 0.
 */
export type HeatmapCell = {
  date: string; // YYYY-MM-DD in the pinned tz
  cost: number; // authoritative day total (from the daily record)
  tokens: number;
  models: HeatmapBreakdownEntry[]; // per-model split (authoritative daily source)
  agents: HeatmapBreakdownEntry[]; // per-agent split (sessions; day-boundary approximation)
};

/** Calendar-heatmap payload: a continuous, zero-filled run of daily cells. */
export type HeatmapSeries = {
  range: SeriesRange;
  cells: HeatmapCell[]; // one per day in [start, today], ascending
  totalCost: number; // summed over cells (matches the range's Total-spend headline)
};

/** The heatmap is always keyed to total cost, so only the range is selectable. */
export type HeatmapRequest = {
  range: SeriesRange;
};

/**
 * Raw archive data returned for the export feature (issue #23).
 * The renderer serializes this to JSON or CSV for download.
 */
export type ExportData = {
  daily: DailyRecord[];
  sessions: SessionRecord[];
};

/** Surface exposed to the renderer via the contextBridge preload. */
export type BurnbarBridge = {
  getSeries: (request: SeriesRequest) => Promise<DashboardSeries>;
  getHeatmap: (request: HeatmapRequest) => Promise<HeatmapSeries>;
  exportData: () => Promise<ExportData>;
};

// --- Settings & tray state ------------------------------------------------

/** Persisted user preferences (`settings.json` under userData). */
export type AppSettings = {
  refreshIntervalMinutes: number; // 0 = manual only (never auto-refresh)
  // App version seen at the previous launch. Compared to the running version on
  // startup to fire the one-time "you're now on vX" post-update notification.
  lastRunVersion?: string;
};

/**
 * Derived 30-day figures the menu card renders alongside today's numbers. The
 * CaptureService computes these from the archive on each capture; the tray turns
 * them into the bitmap "stats card" (see menu-card-window / src/menu-card).
 */
export type MenuCard = {
  cost30d: number; // summed spend over the last 30 days
  tokens30d: number; // summed tokens over the last 30 days
  topModel: string | null; // highest-cost model over the range, null when empty
  spark: number[]; // 30-day daily costs, ascending (the card's bar chart)
};

/**
 * Full input the browser-context card renderer draws: the derived {@link MenuCard}
 * plus today's figures lifted from {@link UsageData} (null when there's no row yet).
 */
export type MenuCardData = MenuCard & {
  todayCost: number | null;
  todayTokens: number | null;
  dark: boolean; // menu appearance — picks the value-text color (transparent card)
};

/**
 * Everything the tray renders, pushed by the CaptureService on each capture and
 * on settings/refresh actions. Carries the display numbers plus the menu's
 * "last updated" stamp, the derived 30-day card figures, and the active interval.
 */
export type TrayState = {
  usage: UsageData;
  lastUpdatedAt: string | null; // ISO of the last *successful* capture
  card: MenuCard; // derived 30-day figures for the menu stats card
  refreshIntervalMinutes: number;
};

// --- Auto-update (UpdateService) -------------------------------------------

/**
 * Lifecycle of the electron-updater check/download/install cycle. See
 * ADR-011 for why this is tray-only with no auto-restart.
 */
export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

/**
 * Serializable snapshot the tray renders into its single update menu row.
 * `version` is set once an update is known (available/downloading/downloaded);
 * `percent` is set only while downloading; `error` carries the last failure's
 * message (status "error").
 */
export type UpdateState = {
  status: UpdateStatus;
  version: string | null;
  percent: number | null;
  error: string | null;
};
