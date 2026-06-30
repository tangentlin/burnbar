import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  ts: string;
  level: LogLevel;
  msg: string;
  payload?: Record<string, unknown>;
};

// Keep this many daily log files at the top of logs/ before archiving to month folders.
const PROMINENT_DAYS = 7;
// Zip this many days' logs for the diagnostics bundle.
const DIAGNOSTICS_DAYS = 3;

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  return { value: String(error) };
}

/**
 * Writes one NDJSON line per log event into `logs/YYYY-MM-DD.log` under the
 * app's userData directory. On startup, call `rotateLogs()` to move files
 * older than {@link PROMINENT_DAYS} into monthly subfolders.
 */
export class BurnbarLogger {
  readonly logsDir: string;
  // Injectable for tests so rotation/filename logic is exercised without sleeping.
  private readonly now: () => Date;

  constructor(userDataDir: string, now: () => Date = () => new Date()) {
    this.logsDir = path.join(userDataDir, "logs");
    this.now = now;
  }

  private currentLogPath(): string {
    const date = this.now().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.logsDir, `${date}.log`);
  }

  log(level: LogLevel, msg: string, error?: unknown): void {
    const entry: LogEntry = { ts: this.now().toISOString(), level, msg };
    if (error !== undefined) {
      entry.payload = serializeError(error);
    }
    const line = JSON.stringify(entry) + "\n";
    // Best-effort fire-and-forget: a log write failure must never disturb the caller.
    void fs
      .mkdir(this.logsDir, { recursive: true })
      .then(() => fs.appendFile(this.currentLogPath(), line, "utf8"));
  }

  /**
   * Move daily log files older than {@link PROMINENT_DAYS} into
   * `logs/YYYY-MM/` subfolders. Call once on app start and whenever a new day
   * opens (the per-day file is created lazily so there's no need to guard it).
   */
  async rotateLogs(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.logsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return; // No logs dir yet — nothing to rotate.
      }
      throw error;
    }

    // Collect YYYY-MM-DD.log filenames, sorted ascending.
    const daily = entries.filter((e) => /^\d{4}-\d{2}-\d{2}\.log$/.test(e)).sort();

    // The newest PROMINENT_DAYS files stay at the top level.
    const toArchive = daily.slice(0, Math.max(0, daily.length - PROMINENT_DAYS));

    await Promise.all(
      toArchive.map(async (filename) => {
        const month = filename.slice(0, 7); // YYYY-MM
        const monthDir = path.join(this.logsDir, month);
        await fs.mkdir(monthDir, { recursive: true });
        await fs.rename(path.join(this.logsDir, filename), path.join(monthDir, filename));
      }),
    );
  }

  /**
   * Zip the current day and up to {@link DIAGNOSTICS_DAYS}-1 prior days' logs
   * into `Burnbar-diagnostics-YYYY-MM-DD.zip` at `destDir`, then return the
   * full path of the created zip.
   *
   * Uses macOS's built-in `zip` CLI. Missing log files are silently skipped so
   * the zip is created even if only one of the three days exists.
   */
  async zipDiagnostics(destDir: string): Promise<string> {
    const today = this.now();
    const candidates: string[] = [];
    for (let i = 0; i < DIAGNOSTICS_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      candidates.push(path.join(this.logsDir, `${dateStr}.log`));
      // Also check the archived month subfolder.
      const month = dateStr.slice(0, 7);
      candidates.push(path.join(this.logsDir, month, `${dateStr}.log`));
    }

    // Verify which candidates exist and deduplicate by basename.
    const seen = new Set<string>();
    const existing: string[] = [];
    for (const p of candidates) {
      const base = path.basename(p);
      if (seen.has(base)) {
        continue;
      }
      try {
        await fs.access(p);
        existing.push(p);
        seen.add(base);
      } catch {
        // Missing — skip.
      }
    }

    const dateStr = today.toISOString().slice(0, 10);
    const zipPath = path.join(destDir, `Burnbar-diagnostics-${dateStr}.zip`);

    if (existing.length === 0) {
      // Create a zip containing a stub note so the file always exists.
      const stub = path.join(this.logsDir, "no-logs.txt");
      await fs.mkdir(this.logsDir, { recursive: true });
      await fs.writeFile(stub, "No log files found for the diagnostics window.\n", "utf8");
      await execFileAsync("zip", ["-j", zipPath, stub]);
      await fs.rm(stub, { force: true });
    } else {
      await execFileAsync("zip", ["-j", zipPath, ...existing]);
    }

    return zipPath;
  }
}
