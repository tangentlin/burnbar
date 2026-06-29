import { describe, expect, it } from "vitest";
import {
  dailyContentEqual,
  mergeDailyRecord,
  mergeModelBreakdowns,
  mergeSessionRecord,
} from "../src/store.js";
import { daily, model, session } from "./helpers.js";

describe("mergeModelBreakdowns — keep richest, never shrink", () => {
  it("keeps the max of every token field per model", () => {
    const existing = [model({ modelName: "m", inputTokens: 100, cacheReadTokens: 900, cost: 1 })];
    const incoming = [model({ modelName: "m", inputTokens: 80, cacheReadTokens: 1200, cost: 2 })];
    const [merged] = mergeModelBreakdowns(existing, incoming);
    expect(merged.inputTokens).toBe(100);
    expect(merged.cacheReadTokens).toBe(1200);
    expect(merged.totalTokens).toBe(100 + 1200);
  });

  it("cost follows the snapshot with the larger token total", () => {
    const existing = [model({ modelName: "m", inputTokens: 1000, cost: 5 })];
    const incoming = [model({ modelName: "m", inputTokens: 10, cost: 99 })];
    const [merged] = mergeModelBreakdowns(existing, incoming);
    expect(merged.cost).toBe(5); // existing is richer → its price wins
  });

  it("a retroactive re-price (same counts, new cost) wins via the tie-break", () => {
    const existing = [model({ modelName: "m", inputTokens: 1000, cost: 5 })];
    const incoming = [model({ modelName: "m", inputTokens: 1000, cost: 6.5 })];
    const [merged] = mergeModelBreakdowns(existing, incoming);
    expect(merged.inputTokens).toBe(1000);
    expect(merged.cost).toBe(6.5);
  });

  it("adds models that appear only in one side", () => {
    const merged = mergeModelBreakdowns(
      [model({ modelName: "a", inputTokens: 1 })],
      [model({ modelName: "b", inputTokens: 2 })],
    );
    expect(merged.map((m) => m.modelName)).toEqual(["a", "b"]);
  });

  it("preserves a model that drops out of a later (purged) snapshot", () => {
    // existing has [a, b]; incoming reports only [a] (b purged) — b must survive.
    const merged = mergeModelBreakdowns(
      [
        model({ modelName: "a", inputTokens: 100, cost: 1 }),
        model({ modelName: "b", inputTokens: 200, cost: 2 }),
      ],
      [model({ modelName: "a", inputTokens: 50, cost: 0.5 })],
    );
    expect(merged.map((m) => m.modelName)).toEqual(["a", "b"]);
    expect(merged.find((m) => m.modelName === "a")?.inputTokens).toBe(100);
    expect(merged.find((m) => m.modelName === "b")?.inputTokens).toBe(200);
  });
});

describe("mergeDailyRecord", () => {
  it("a later capture with fewer tokens never shrinks the stored counts", () => {
    const existing = daily("2026-06-28", [model({ modelName: "m", inputTokens: 1000, cost: 4 })], {
      capturedAt: "2026-06-28T10:00:00.000Z",
    });
    const purged = daily("2026-06-28", [model({ modelName: "m", inputTokens: 200, cost: 1 })], {
      capturedAt: "2026-06-29T10:00:00.000Z",
    });
    const merged = mergeDailyRecord(existing, purged);
    expect(merged.totals.totalTokens).toBe(1000);
    expect(merged.totals.totalCost).toBe(4);
  });

  it("a richer capture grows the record, advances lastCapturedAt, holds firstCapturedAt", () => {
    const existing = daily("2026-06-28", [model({ modelName: "m", inputTokens: 1000, cost: 4 })], {
      capturedAt: "2026-06-28T10:00:00.000Z",
    });
    const richer = daily("2026-06-28", [model({ modelName: "m", inputTokens: 3000, cost: 9 })], {
      capturedAt: "2026-06-29T10:00:00.000Z",
    });
    const merged = mergeDailyRecord(existing, richer);
    expect(merged.totals.totalTokens).toBe(3000);
    expect(merged.totals.totalCost).toBe(9);
    expect(merged.firstCapturedAt).toBe("2026-06-28T10:00:00.000Z");
    expect(merged.lastCapturedAt).toBe("2026-06-29T10:00:00.000Z");
  });

  it("unions the contributing agents", () => {
    const existing = daily("2026-06-28", [model({ modelName: "m", inputTokens: 1 })], {
      agents: ["claude"],
    });
    const incoming = daily("2026-06-28", [model({ modelName: "m", inputTokens: 1 })], {
      agents: ["codex"],
    });
    expect(mergeDailyRecord(existing, incoming).agents).toEqual(["claude", "codex"]);
  });

  it("totals always equal the sum of the merged model lines", () => {
    const merged = mergeDailyRecord(
      daily("2026-06-28", [model({ modelName: "a", inputTokens: 100, cost: 1 })]),
      daily("2026-06-28", [model({ modelName: "b", inputTokens: 200, cost: 2 })]),
    );
    expect(merged.totals.totalTokens).toBe(300);
    expect(merged.totals.totalCost).toBe(3);
  });

  it("seeds a brand-new date when there is no existing record", () => {
    const merged = mergeDailyRecord(
      undefined,
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 5, cost: 1 })]),
    );
    expect(merged.date).toBe("2026-06-28");
    expect(merged.totals.totalTokens).toBe(5);
  });

  it("dailyContentEqual ignores capture timestamps (drives the dirty check)", () => {
    const a = daily("2026-06-28", [model({ modelName: "m", inputTokens: 5, cost: 1 })], {
      capturedAt: "2026-06-28T10:00:00.000Z",
    });
    const b = daily("2026-06-28", [model({ modelName: "m", inputTokens: 5, cost: 1 })], {
      capturedAt: "2026-06-29T23:00:00.000Z",
    });
    expect(dailyContentEqual(a, b)).toBe(true);
  });
});

describe("mergeSessionRecord", () => {
  it("advances lastActivity and merges counts without duplicating the session", () => {
    const existing = session("s1", [model({ modelName: "m", inputTokens: 100, cost: 1 })], {
      lastActivity: "2026-06-28T10:00:00.000Z",
    });
    const grown = session("s1", [model({ modelName: "m", inputTokens: 400, cost: 3 })], {
      lastActivity: "2026-06-29T11:00:00.000Z",
    });
    const merged = mergeSessionRecord(existing, grown);
    expect(merged.sessionId).toBe("s1");
    expect(merged.totals.totalTokens).toBe(400);
    expect(merged.lastActivity).toBe("2026-06-29T11:00:00.000Z");
  });
});
