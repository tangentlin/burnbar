import { rollupTotals } from "../src/store.js";
import type { DailyRecord, ModelBreakdown, SessionRecord } from "../src/types.js";

/** Build a ModelBreakdown, defaulting unset token fields to 0 and totalTokens to their sum. */
export function model(partial: Partial<ModelBreakdown> & { modelName: string }): ModelBreakdown {
  const inputTokens = partial.inputTokens ?? 0;
  const outputTokens = partial.outputTokens ?? 0;
  const cacheCreationTokens = partial.cacheCreationTokens ?? 0;
  const cacheReadTokens = partial.cacheReadTokens ?? 0;
  return {
    modelName: partial.modelName,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens:
      partial.totalTokens ?? inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    cost: partial.cost ?? 0,
  };
}

export function daily(
  date: string,
  models: ModelBreakdown[],
  opts: { agents?: string[]; timezone?: string; capturedAt?: string } = {},
): DailyRecord {
  const capturedAt = opts.capturedAt ?? "2026-06-28T12:00:00.000Z";
  return {
    date,
    timezone: opts.timezone ?? "UTC",
    agents: opts.agents ?? ["claude"],
    totals: rollupTotals(models),
    models,
    firstCapturedAt: capturedAt,
    lastCapturedAt: capturedAt,
  };
}

export function session(
  sessionId: string,
  models: ModelBreakdown[],
  opts: { agent?: string; lastActivity?: string; capturedAt?: string } = {},
): SessionRecord {
  const capturedAt = opts.capturedAt ?? "2026-06-28T12:00:00.000Z";
  return {
    sessionId,
    agent: opts.agent ?? "claude",
    lastActivity: opts.lastActivity ?? "2026-06-28T12:00:00.000Z",
    totals: rollupTotals(models),
    models,
    firstCapturedAt: capturedAt,
    lastCapturedAt: capturedAt,
  };
}
