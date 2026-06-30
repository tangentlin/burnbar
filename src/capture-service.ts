import {
  ccusageVersion,
  defaultCcusageRunner,
  normalizeDailyReport,
  normalizeSessionReport,
  runDailyReport,
  runSessionReport,
  toUsageData,
} from "./capture.js";
import { deriveSeries } from "./derive.js";
import type { BurnbarLogger } from "./logger.js";
import { type ArchiveStore, dailyContentEqual } from "./store.js";
import { localDateString, systemTimezone } from "./time.js";
import type { CcusageRunner } from "./capture.js";
import type { DailyRecord, MenuCard, SeriesDataset, TrayState, UsageData } from "./types.js";

const DEFAULT_REFRESH_INTERVAL_MINUTES = 15;
const CARD_DAYS = 30;
const EMPTY_CARD: MenuCard = { cost30d: 0, tokens30d: 0, topModel: null, spark: [] };

export type CaptureServiceOptions = {
  store: ArchiveStore;
  runner?: CcusageRunner;
  timezone?: string;
  refreshIntervalMinutes?: number; // 0 = manual (never auto-refresh)
  // Injectable clock keeps capture stamps and day-rollover detection testable.
  now?: () => Date;
  logger?: BurnbarLogger;
};

/**
 * Single owner of the recurring ccusage call that drives both the tray and the
 * archive (SRP — the tray is a pure display consumer). The display refresh fires
 * on the user-configurable interval (or never, in manual mode) and on demand via
 * {@link refreshNow}; the heavier `session` capture runs on launch, on local-day
 * rollover, and on quit. Capture is best-effort: a ccusage fetch failure surfaces
 * to the tray, but an archive-write failure is logged without disturbing the
 * freshly-fetched numbers.
 */
export class CaptureService {
  private readonly store: ArchiveStore;
  private readonly runner: CcusageRunner;
  private readonly timezone: string;
  private readonly now: () => Date;
  private readonly logger: BurnbarLogger | undefined;

  private refreshIntervalMinutes: number;
  private stateListener: ((state: TrayState) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentDay: string;
  private latestUsage: UsageData = { daily: null, total: null };
  private lastUpdatedAt: string | null = null; // last *successful* fetch
  private card: MenuCard = EMPTY_CARD; // derived 30-day figures for the menu card
  private readonly dailyCache = new Map<string, DailyRecord>();
  private archiveWritable = true;
  private flushed = false;

  constructor(options: CaptureServiceOptions) {
    this.store = options.store;
    this.runner = options.runner ?? defaultCcusageRunner;
    this.timezone = options.timezone ?? systemTimezone();
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger;
    this.refreshIntervalMinutes = normalizeMinutes(
      options.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES,
    );
    this.currentDay = localDateString(this.timezone, this.now());
  }

  onState(listener: (state: TrayState) => void): void {
    this.stateListener = listener;
  }

  getState(): TrayState {
    return this.buildState();
  }

  getUsage(): UsageData {
    return this.latestUsage;
  }

  getTimezone(): string {
    return this.timezone;
  }

  getRefreshIntervalMinutes(): number {
    return this.refreshIntervalMinutes;
  }

  /** Initial capture (daily + sessions) then start the refresh timer (if any). */
  async start(): Promise<void> {
    // Refuse to write into an archive a newer Burnbar wrote; the tray still works.
    this.archiveWritable = await this.store.isSchemaCompatible();
    if (!this.archiveWritable) {
      this.logger?.log(
        "warn",
        "archive schema is newer than this build; writes disabled this session",
      );
    }
    await this.captureDaily();
    await this.captureSessions();
    this.scheduleTimer();
  }

  /** Change the auto-refresh cadence live (minutes; 0 = manual) and re-push state. */
  setRefreshIntervalMinutes(minutes: number): void {
    this.refreshIntervalMinutes = normalizeMinutes(minutes);
    this.scheduleTimer();
    this.pushState();
  }

  /** Force an immediate refresh (the tray's "Refresh Now"). */
  async refreshNow(): Promise<void> {
    await this.captureDaily();
    await this.captureSessions();
  }

  private scheduleTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.refreshIntervalMinutes > 0) {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.refreshIntervalMinutes * 60_000);
    }
  }

  private async tick(): Promise<void> {
    const today = localDateString(this.timezone, this.now());
    const rolledOver = today !== this.currentDay;
    this.currentDay = today;
    await this.captureDaily();
    if (rolledOver) {
      await this.captureSessions();
    }
  }

  private async captureDaily(): Promise<void> {
    let report;
    try {
      report = await runDailyReport(this.runner, this.timezone);
    } catch (error) {
      // Fetch failed → surface to the tray; do not advance "last updated".
      this.reportDailyFailure(error);
      return;
    }

    const nowDate = this.now();
    const today = localDateString(this.timezone, nowDate);
    this.latestUsage = toUsageData(report, today);
    this.lastUpdatedAt = nowDate.toISOString();

    // The archive write + card derivation are best-effort: a failure here
    // must never erase the numbers we already fetched and displayed.
    try {
      if (this.archiveWritable) {
        const records = normalizeDailyReport(report, this.timezone, this.lastUpdatedAt);
        let changedAny = false;
        for (const record of records) {
          const cached = this.dailyCache.get(record.date);
          if (cached && dailyContentEqual(cached, record)) {
            continue;
          }
          // Cache the authoritative merged record so the dirty check mirrors disk.
          const { changed, record: merged } = await this.store.mergeDaily(record);
          this.dailyCache.set(record.date, merged);
          changedAny = changedAny || changed;
        }
        if (changedAny) {
          await this.touchManifest(this.lastUpdatedAt);
        }
      }
      this.card = await this.computeCard(today);
    } catch (error) {
      this.logger?.log("error", "archive write/derive failed (display unaffected)", error);
    }

    this.pushState();
  }

  private async captureSessions(): Promise<void> {
    if (!this.archiveWritable) {
      return;
    }
    try {
      const report = await runSessionReport(this.runner, this.timezone);
      const capturedAt = this.now().toISOString();
      const records = normalizeSessionReport(report, capturedAt);
      const changed = await this.store.mergeSessions(records);
      if (changed > 0) {
        await this.touchManifest(capturedAt);
      }
    } catch (error) {
      // Sessions feed only the by-agent view; a failure stays silent beyond the log.
      this.logger?.log("error", "ccusage session capture failed", error);
    }
  }

  /**
   * Derive the menu card's 30-day figures from the archive: total spend/tokens,
   * the highest-cost model, and the zero-filled daily-cost bars — all on the same
   * range the dashboard's 30d view uses, so the two stay consistent.
   */
  private async computeCard(today: string): Promise<MenuCard> {
    const daily = await this.store.readAllDaily();
    const base = { range: "30d" as const, timezone: this.timezone, today };
    const total = deriveSeries(daily, [], { ...base, dimension: "none" });
    const costs = total.datasets[0]?.data ?? [];
    const tokens = total.datasets[0]?.tokens ?? [];
    const byModel = deriveSeries(daily, [], { ...base, dimension: "model" });
    return {
      cost30d: total.totalCost,
      tokens30d: tokens.reduce((sum, value) => sum + value, 0),
      topModel: topModelLabel(byModel.datasets),
      spark: costs.slice(-CARD_DAYS),
    };
  }

  private async touchManifest(capturedAt: string): Promise<void> {
    await this.store.updateManifest({
      timezone: this.timezone,
      ccusageVersion: ccusageVersion(),
      capturedAt,
    });
  }

  private reportDailyFailure(error: unknown): void {
    this.logger?.log("error", "ccusage daily capture failed", error);
    // Preserve the prior menu behavior: a failed fetch surfaces as an error row
    // and a cleared title. `lastUpdatedAt`/`card` keep their last-good values.
    this.latestUsage = {
      daily: null,
      total: null,
      error: error instanceof Error ? error.message : String(error),
    };
    this.pushState();
  }

  private buildState(): TrayState {
    return {
      usage: this.latestUsage,
      lastUpdatedAt: this.lastUpdatedAt,
      card: this.card,
      refreshIntervalMinutes: this.refreshIntervalMinutes,
    };
  }

  private pushState(): void {
    this.stateListener?.(this.buildState());
  }

  /** Final best-effort flush so the last interval's data is persisted on quit. */
  async flush(): Promise<void> {
    if (this.flushed) {
      return;
    }
    this.flushed = true;
    await this.captureDaily();
    await this.captureSessions();
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function normalizeMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return 0;
  }
  return Math.floor(minutes);
}

/** Label of the highest-cost model across the derived per-model datasets (null when none spent). */
function topModelLabel(datasets: SeriesDataset[]): string | null {
  let best: { label: string; cost: number } | null = null;
  for (const dataset of datasets) {
    const cost = dataset.data.reduce((sum, value) => sum + value, 0);
    if (cost > 0 && (best === null || cost > best.cost)) {
      best = { label: dataset.label, cost };
    }
  }
  return best?.label ?? null;
}
