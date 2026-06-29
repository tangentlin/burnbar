import { describe, expect, it } from "vitest";
import { deriveSeries } from "../src/derive.js";
import type { SeriesDataset } from "../src/types.js";
import { daily, model, session } from "./helpers.js";

function byLabel(datasets: SeriesDataset[]): Record<string, number[]> {
  return Object.fromEntries(datasets.map((dataset) => [dataset.label, dataset.data]));
}

describe("deriveSeries — cost over time (none)", () => {
  it("builds a continuous daily axis with zero-filled gaps", () => {
    const records = [
      daily("2026-06-26", [model({ modelName: "m", inputTokens: 100, cost: 1 })]),
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 100, cost: 3 })]),
    ];
    const series = deriveSeries(records, [], {
      range: "all",
      dimension: "none",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(series.labels).toEqual(["2026-06-26", "2026-06-27", "2026-06-28"]);
    expect(series.datasets).toHaveLength(1);
    expect(series.datasets[0].label).toBe("Cost");
    expect(series.datasets[0].data).toEqual([1, 0, 3]);
    expect(series.totalCost).toBe(4);
  });
});

describe("deriveSeries — by model", () => {
  it("emits one stacked dataset per model, aligned to the axis", () => {
    const records = [
      daily("2026-06-27", [model({ modelName: "a", cost: 1 }), model({ modelName: "b", cost: 2 })]),
      daily("2026-06-28", [model({ modelName: "a", cost: 3 })]),
    ];
    const series = deriveSeries(records, [], {
      range: "all",
      dimension: "model",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(series.labels).toEqual(["2026-06-27", "2026-06-28"]);
    expect(series.datasets.map((d) => d.label)).toEqual(["a", "b"]);
    const data = byLabel(series.datasets);
    expect(data.a).toEqual([1, 3]);
    expect(data.b).toEqual([2, 0]);
  });
});

describe("deriveSeries — by agent (session day-bucketing)", () => {
  it("attributes each session to its last-activity day in the pinned tz", () => {
    // 03:30Z on the 28th is 23:30 on the 27th in America/New_York (EDT, UTC-4),
    // exercising the documented day-boundary approximation.
    const sessions = [
      session("s1", [model({ modelName: "m", cost: 2 })], {
        agent: "claude",
        lastActivity: "2026-06-28T20:00:00.000Z",
      }),
      session("s2", [model({ modelName: "m", cost: 0.5 })], {
        agent: "codex",
        lastActivity: "2026-06-28T03:30:00.000Z",
      }),
    ];
    const series = deriveSeries([], sessions, {
      range: "all",
      dimension: "agent",
      timezone: "America/New_York",
      today: "2026-06-28",
    });
    expect(series.labels).toEqual(["2026-06-27", "2026-06-28"]);
    const data = byLabel(series.datasets);
    expect(data.codex).toEqual([0.5, 0]);
    expect(data.claude).toEqual([0, 2]);
  });

  it("skips a session whose lastActivity is unparseable, without crashing", () => {
    const sessions = [
      session("good", [model({ modelName: "m", cost: 2 })], {
        agent: "claude",
        lastActivity: "2026-06-28T20:00:00.000Z",
      }),
      session("bad", [model({ modelName: "m", cost: 99 })], {
        agent: "codex",
        lastActivity: "not-a-timestamp",
      }),
    ];
    const series = deriveSeries([], sessions, {
      range: "all",
      dimension: "agent",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(series.datasets.map((d) => d.label)).toEqual(["claude"]);
    expect(series.totalCost).toBe(2);
  });
});

describe("deriveSeries — range presets", () => {
  it("30d excludes older records and anchors the window to today", () => {
    const records = [
      daily("2026-05-01", [model({ modelName: "m", cost: 10 })]),
      daily("2026-06-28", [model({ modelName: "m", cost: 3 })]),
    ];
    const series = deriveSeries(records, [], {
      range: "30d",
      dimension: "none",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(series.labels[0]).toBe("2026-05-30");
    expect(series.labels.at(-1)).toBe("2026-06-28");
    expect(series.totalCost).toBe(3);
  });

  it("an empty archive yields a single day axis at zero", () => {
    const series = deriveSeries([], [], {
      range: "all",
      dimension: "none",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(series.labels).toEqual(["2026-06-28"]);
    expect(series.datasets[0].data).toEqual([0]);
    expect(series.totalCost).toBe(0);
  });
});
