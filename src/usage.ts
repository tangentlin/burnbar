import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type { CcusageDailyReport, UsageData } from "./types.js";

const execFileAsync = promisify(execFile);

// ccusage 20.x ships as a CLI only (no library exports), so Burnbar invokes its
// bundled cli.js and parses the JSON it prints. Running it through the current
// runtime's own binary (Electron in production, Node in tests) via
// ELECTRON_RUN_AS_NODE keeps the app self-contained — no external `node` or
// `ccusage` needs to be on PATH. ccusage prices each model from the local
// ~/.claude logs, so this is backend-agnostic (Anthropic / Vertex AI / Bedrock).
const require = createRequire(import.meta.url);
const CCUSAGE_CLI = require.resolve("ccusage/src/cli.js");

async function loadDailyReport(): Promise<CcusageDailyReport> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [CCUSAGE_CLI, "daily", "--json", "--mode", "calculate"],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as CcusageDailyReport;
}

export async function getUserUsage(): Promise<UsageData> {
  try {
    // One CLI call returns every day plus grand totals; today is derived from
    // it instead of spawning a second scan.
    const report = await loadDailyReport();
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayEntry = report.daily.find((day) => day.period === todayIso);

    return {
      daily: todayEntry
        ? { totalTokens: todayEntry.totalTokens, cost: todayEntry.totalCost }
        : null,
      total: {
        totalTokens: report.totals.totalTokens,
        cost: report.totals.totalCost,
      },
    };
  } catch (error) {
    console.error("Error fetching usage data:", error);
    return {
      daily: null,
      total: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
