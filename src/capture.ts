import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { rollupTotals } from "./store.js";
import type {
  CcusageDailyReport,
  CcusageRow,
  CcusageSessionReport,
  DailyRecord,
  ModelBreakdown,
  SessionRecord,
  UsageData,
} from "./types.js";

const execFileAsync = promisify(execFile);

// ccusage 20.x ships as a CLI only (no library exports), so Burnbar invokes its
// bundled cli.js and parses the JSON it prints. Running it through the current
// runtime's own binary (Electron in production, Node in tests) via
// ELECTRON_RUN_AS_NODE keeps the app self-contained — no external `node` or
// `ccusage` on PATH. `--mode calculate` prices each model from the local logs,
// so this is backend-agnostic (Anthropic / Vertex AI / Bedrock).
const require = createRequire(import.meta.url);
const CCUSAGE_CLI = require.resolve("ccusage/src/cli.js");

/**
 * Dependency-injected ccusage invoker: takes CLI args, returns raw stdout. Unit
 * tests pass a fixture runner so capture/normalize is exercised without spawning
 * a process; production uses {@link defaultCcusageRunner}.
 */
export type CcusageRunner = (args: string[]) => Promise<string>;

export const defaultCcusageRunner: CcusageRunner = async (args) => {
  const { stdout } = await execFileAsync(process.execPath, [CCUSAGE_CLI, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    // All-time, all-agents JSON can be large; give it generous headroom.
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
};

/** The ccusage version whose schema we are parsing — recorded in the manifest. */
export function ccusageVersion(): string {
  try {
    const pkg = require("ccusage/package.json") as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function runDailyReport(
  runner: CcusageRunner,
  tz: string,
): Promise<CcusageDailyReport> {
  const stdout = await runner(["daily", "--json", "--mode", "calculate", "-z", tz]);
  return JSON.parse(stdout) as CcusageDailyReport;
}

export async function runSessionReport(
  runner: CcusageRunner,
  tz: string,
): Promise<CcusageSessionReport> {
  const stdout = await runner(["session", "--json", "--mode", "calculate", "-z", tz]);
  return JSON.parse(stdout) as CcusageSessionReport;
}

// Mirror ccusage's per-model line into an archive ModelBreakdown. totalTokens is
// recomputed from the four components so the totals = Σ models invariant holds
// even if a future ccusage build omits or rounds it.
function normalizeModels(row: CcusageRow): ModelBreakdown[] {
  return row.modelBreakdowns.map((model) => ({
    modelName: model.modelName,
    inputTokens: model.inputTokens,
    outputTokens: model.outputTokens,
    cacheCreationTokens: model.cacheCreationTokens,
    cacheReadTokens: model.cacheReadTokens,
    totalTokens:
      model.inputTokens + model.outputTokens + model.cacheCreationTokens + model.cacheReadTokens,
    cost: model.cost,
  }));
}

/** Normalize a `daily` report into one DailyRecord per local date (all agents). */
export function normalizeDailyReport(
  report: CcusageDailyReport,
  timezone: string,
  capturedAt: string,
): DailyRecord[] {
  return report.daily.map((row) => {
    const models = normalizeModels(row);
    return {
      date: row.period,
      timezone,
      agents: [...(row.metadata?.agents ?? [])].sort(),
      totals: rollupTotals(models),
      models,
      firstCapturedAt: capturedAt,
      lastCapturedAt: capturedAt,
    };
  });
}

/** Normalize a `session` report into one SessionRecord per session UUID. */
export function normalizeSessionReport(
  report: CcusageSessionReport,
  capturedAt: string,
): SessionRecord[] {
  return report.session.map((row) => {
    const models = normalizeModels(row);
    return {
      sessionId: row.period,
      agent: row.agent,
      lastActivity: row.metadata?.lastActivity ?? capturedAt,
      totals: rollupTotals(models),
      models,
      firstCapturedAt: capturedAt,
      lastCapturedAt: capturedAt,
    };
  });
}

/** Tray-facing view derived from the same daily report the archive consumes. */
export function toUsageData(report: CcusageDailyReport, today: string): UsageData {
  const todayRow = report.daily.find((row) => row.period === today);
  return {
    daily: todayRow ? { totalTokens: todayRow.totalTokens, cost: todayRow.totalCost } : null,
    total: { totalTokens: report.totals.totalTokens, cost: report.totals.totalCost },
  };
}
