import {
  ccusageVersion,
  defaultCcusageRunner,
  normalizeDailyReport,
  normalizeSessionReport,
  runDailyReport,
  runSessionReport,
  toUsageData,
} from "./capture.js";
import { type ArchiveStore, dailyContentEqual } from "./store.js";
import { localDateString, systemTimezone } from "./time.js";
import type { CcusageRunner } from "./capture.js";
import type { DailyRecord, UsageData } from "./types.js";

const REFRESH_INTERVAL_MS = 60_000;

export type CaptureServiceOptions = {
  store: ArchiveStore;
  runner?: CcusageRunner;
  timezone?: string;
  intervalMs?: number;
  // Injectable clock keeps capture stamps and day-rollover detection testable.
  now?: () => Date;
};

/**
 * Single owner of the recurring ccusage `daily` call that drives both the tray
 * and the archive (SRP — the tray became a pure display consumer). Daily is
 * captured on the 60s tick and written only when a day's numbers change; the
 * heavier `session` capture runs on launch, on local-day rollover, and on quit.
 * Capture is best-effort: a ccusage failure logs and leaves the archive intact.
 */
export class CaptureService {
  private readonly store: ArchiveStore;
  private readonly runner: CcusageRunner;
  private readonly timezone: string;
  private readonly intervalMs: number;
  private readonly now: () => Date;

  private usageListener: ((usage: UsageData) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentDay: string;
  private latestUsage: UsageData = { daily: null, total: null };
  // Last normalized record seen per date — lets the tick skip disk work on
  // unchanged days without re-reading every daily file every minute.
  private readonly dailyCache = new Map<string, DailyRecord>();
  private archiveWritable = true;
  private flushed = false;

  constructor(options: CaptureServiceOptions) {
    this.store = options.store;
    this.runner = options.runner ?? defaultCcusageRunner;
    this.timezone = options.timezone ?? systemTimezone();
    this.intervalMs = options.intervalMs ?? REFRESH_INTERVAL_MS;
    this.now = options.now ?? (() => new Date());
    this.currentDay = localDateString(this.timezone, this.now());
  }

  onUsage(listener: (usage: UsageData) => void): void {
    this.usageListener = listener;
  }

  getUsage(): UsageData {
    return this.latestUsage;
  }

  getTimezone(): string {
    return this.timezone;
  }

  /** Initial capture (daily + sessions) then start the refresh timer. */
  async start(): Promise<void> {
    // Refuse to write into an archive a newer Burnbar wrote (schemaVersion ahead
    // of this build): a downgrade merging into a future format could corrupt it.
    // The tray still works — it reads ccusage live, not the archive.
    this.archiveWritable = await this.store.isSchemaCompatible();
    if (!this.archiveWritable) {
      console.warn(
        "Burnbar archive schema is newer than this build understands; archive writes are disabled this session.",
      );
    }
    await this.captureDaily();
    await this.captureSessions();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
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
    try {
      const report = await runDailyReport(this.runner, this.timezone);
      const today = localDateString(this.timezone, this.now());
      this.latestUsage = toUsageData(report, today);
      this.usageListener?.(this.latestUsage);
      if (!this.archiveWritable) {
        return;
      }

      const capturedAt = this.now().toISOString();
      const records = normalizeDailyReport(report, this.timezone, capturedAt);
      let changedAny = false;
      for (const record of records) {
        const cached = this.dailyCache.get(record.date);
        if (cached && dailyContentEqual(cached, record)) {
          continue;
        }
        // Cache the authoritative merged record (not the raw incoming): a purged
        // snapshot merges to the richer stored value, and the cache must mirror
        // disk so the dirty check never diverges from it.
        const { changed, record: merged } = await this.store.mergeDaily(record);
        this.dailyCache.set(record.date, merged);
        changedAny = changedAny || changed;
      }
      if (changedAny) {
        await this.touchManifest(capturedAt);
      }
    } catch (error) {
      this.reportDailyFailure(error);
    }
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
      // Sessions feed only the by-agent view; a failure must never disturb the
      // tray, so unlike daily it stays silent beyond the log.
      console.error("ccusage session capture failed:", error);
    }
  }

  private async touchManifest(capturedAt: string): Promise<void> {
    await this.store.updateManifest({
      timezone: this.timezone,
      ccusageVersion: ccusageVersion(),
      capturedAt,
    });
  }

  private reportDailyFailure(error: unknown): void {
    console.error("ccusage daily capture failed:", error);
    // Preserve the prior menu behavior: a failed fetch surfaces as an error row
    // and a cleared title rather than silently keeping stale numbers.
    this.latestUsage = {
      daily: null,
      total: null,
      error: error instanceof Error ? error.message : String(error),
    };
    this.usageListener?.(this.latestUsage);
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
