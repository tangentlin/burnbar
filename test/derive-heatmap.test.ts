import { describe, expect, it } from "vitest";
import { deriveHeatmap } from "../src/derive.js";
import { daily, model, session } from "./helpers.js";

describe("deriveHeatmap — calendar cells", () => {
  it("emits one continuous, zero-filled cell per day with authoritative day totals", () => {
    const records = [
      daily("2026-06-26", [model({ modelName: "m", inputTokens: 100, cost: 1 })]),
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 300, cost: 3 })]),
    ];
    const { cells, totalCost } = deriveHeatmap(records, [], {
      range: "all",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(cells.map((cell) => cell.date)).toEqual(["2026-06-26", "2026-06-27", "2026-06-28"]);
    expect(cells.map((cell) => cell.cost)).toEqual([1, 0, 3]);
    expect(cells.map((cell) => cell.tokens)).toEqual([100, 0, 300]);
    // The gap day carries empty breakdowns, never undefined.
    expect(cells[1].models).toEqual([]);
    expect(cells[1].agents).toEqual([]);
    expect(totalCost).toBe(4);
  });

  it("orders the per-model breakdown by cost descending (label tie-break)", () => {
    const records = [
      daily("2026-06-28", [
        model({ modelName: "cheap", inputTokens: 10, cost: 1 }),
        model({ modelName: "pricey", inputTokens: 20, cost: 5 }),
      ]),
    ];
    const [cell] = deriveHeatmap(records, [], {
      range: "all",
      timezone: "UTC",
      today: "2026-06-28",
    }).cells;
    expect(cell.models).toEqual([
      { label: "pricey", cost: 5, tokens: 20 },
      { label: "cheap", cost: 1, tokens: 10 },
    ]);
  });

  it("sums sessions into a per-agent breakdown, bucketed to the local last-activity day", () => {
    // 03:30Z on the 28th is 23:30 on the 27th in America/New_York (EDT, UTC-4).
    const sessions = [
      session("s1", [model({ modelName: "m", inputTokens: 40, cost: 2 })], {
        agent: "claude",
        lastActivity: "2026-06-28T20:00:00.000Z",
      }),
      session("s2", [model({ modelName: "m", inputTokens: 10, cost: 4 })], {
        agent: "codex",
        lastActivity: "2026-06-28T20:00:00.000Z",
      }),
      session("s3", [model({ modelName: "m", inputTokens: 5, cost: 0.5 })], {
        agent: "codex",
        lastActivity: "2026-06-28T03:30:00.000Z",
      }),
    ];
    const { cells } = deriveHeatmap([], sessions, {
      range: "all",
      timezone: "America/New_York",
      today: "2026-06-28",
    });
    const byDate = Object.fromEntries(cells.map((cell) => [cell.date, cell]));
    expect(byDate["2026-06-27"].agents).toEqual([{ label: "codex", cost: 0.5, tokens: 5 }]);
    // Same-day codex sessions merge; agents sort by cost descending.
    expect(byDate["2026-06-28"].agents).toEqual([
      { label: "codex", cost: 4, tokens: 10 },
      { label: "claude", cost: 2, tokens: 40 },
    ]);
  });

  it("30d scopes the window to today and excludes older days from the total", () => {
    const records = [
      daily("2026-05-01", [model({ modelName: "m", cost: 10 })]),
      daily("2026-06-28", [model({ modelName: "m", cost: 3 })]),
    ];
    const { cells, totalCost } = deriveHeatmap(records, [], {
      range: "30d",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(cells[0].date).toBe("2026-05-30");
    expect(cells.at(-1)?.date).toBe("2026-06-28");
    expect(totalCost).toBe(3);
  });

  it("an empty archive yields a single zero cell at today", () => {
    const { cells, totalCost } = deriveHeatmap([], [], {
      range: "all",
      timezone: "UTC",
      today: "2026-06-28",
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      date: "2026-06-28",
      cost: 0,
      tokens: 0,
      models: [],
      agents: [],
    });
    expect(totalCost).toBe(0);
  });

  it("skips a session with an unparseable lastActivity without crashing", () => {
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
    const { cells } = deriveHeatmap([], sessions, {
      range: "all",
      timezone: "UTC",
      today: "2026-06-28",
    });
    const agents = cells.flatMap((cell) => cell.agents.map((entry) => entry.label));
    expect(agents).toEqual(["claude"]);
  });
});
