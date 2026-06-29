import { describe, expect, it, vi } from "vitest";
import {
  normalizeDailyReport,
  normalizeSessionReport,
  runDailyReport,
  toUsageData,
} from "../src/capture.js";
import type { CcusageDailyReport, CcusageSessionReport } from "../src/types.js";
import dailyFixture from "./fixtures/daily.json";
import sessionFixture from "./fixtures/session.json";

const dailyReport = dailyFixture as CcusageDailyReport;
const sessionReport = sessionFixture as CcusageSessionReport;
const CAPTURED_AT = "2026-06-29T12:00:00.000Z";

describe("normalizeDailyReport", () => {
  const records = normalizeDailyReport(dailyReport, "America/New_York", CAPTURED_AT);

  it("maps each daily row to a record keyed by its local date", () => {
    expect(records.map((r) => r.date)).toEqual(["2026-06-27", "2026-06-28"]);
  });

  it("records the pinned timezone and capture stamps", () => {
    expect(records[0].timezone).toBe("America/New_York");
    expect(records[0].firstCapturedAt).toBe(CAPTURED_AT);
    expect(records[0].lastCapturedAt).toBe(CAPTURED_AT);
  });

  it("sorts the contributing agents", () => {
    expect(records[1].agents).toEqual(["claude", "codex"]);
  });

  it("derives totals as the rollup of model lines (totals = Σ models)", () => {
    expect(records[1].models).toHaveLength(2);
    expect(records[1].totals.totalTokens).toBe(10000);
    expect(records[1].totals.totalCost).toBeCloseTo(3.25, 10);
  });

  it("recomputes each model's totalTokens from its four components", () => {
    const claude = records[1].models.find((m) => m.modelName === "claude-opus-4-8");
    expect(claude?.totalTokens).toBe(2000 + 600 + 100 + 5300);
  });
});

describe("normalizeSessionReport", () => {
  it("keys by session UUID and carries agent + lastActivity", () => {
    const records = normalizeSessionReport(sessionReport, CAPTURED_AT);
    const a = records.find((r) => r.sessionId === "sess-A");
    expect(a?.agent).toBe("claude");
    expect(a?.lastActivity).toBe("2026-06-28T20:00:00.000Z");
  });

  it("falls back to the capture time when lastActivity is absent", () => {
    const report: CcusageSessionReport = {
      session: [
        {
          agent: "claude",
          period: "sess-x",
          inputTokens: 1,
          outputTokens: 1,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 2,
          totalCost: 0.1,
          modelsUsed: ["m"],
          modelBreakdowns: [
            {
              modelName: "m",
              inputTokens: 1,
              outputTokens: 1,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              cost: 0.1,
            },
          ],
        },
      ],
      totals: sessionReport.totals,
    };
    expect(normalizeSessionReport(report, CAPTURED_AT)[0].lastActivity).toBe(CAPTURED_AT);
  });
});

describe("toUsageData", () => {
  it("derives today's figures and the grand totals", () => {
    const usage = toUsageData(dailyReport, "2026-06-28");
    expect(usage.daily).toEqual({ totalTokens: 10000, cost: 3.25 });
    expect(usage.total).toEqual({ totalTokens: 20000, cost: 4.75 });
  });

  it("returns null daily when today is not present", () => {
    const usage = toUsageData(dailyReport, "2099-01-01");
    expect(usage.daily).toBeNull();
    expect(usage.total?.totalTokens).toBe(20000);
  });
});

describe("runDailyReport", () => {
  it("passes the calculate-mode, tz-pinned flags and parses stdout", async () => {
    const runner = vi.fn().mockResolvedValue(JSON.stringify(dailyReport));
    const report = await runDailyReport(runner, "America/New_York");
    expect(runner).toHaveBeenCalledWith([
      "daily",
      "--json",
      "--mode",
      "calculate",
      "-z",
      "America/New_York",
    ]);
    expect(report.totals.totalCost).toBe(4.75);
  });
});
