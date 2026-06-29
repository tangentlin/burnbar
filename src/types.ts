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
};

export type DashboardSeries = {
  range: SeriesRange;
  dimension: SeriesDimension;
  labels: string[]; // YYYY-MM-DD, ascending
  datasets: SeriesDataset[];
  totalCost: number; // sum over the visible range
};

/** Surface exposed to the renderer via the contextBridge preload. */
export type BurnbarBridge = {
  getSeries: (request: SeriesRequest) => Promise<DashboardSeries>;
};
