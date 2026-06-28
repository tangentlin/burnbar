export type UsageStats = {
  totalTokens: number;
  cost: number;
};

export type UsageData = {
  daily: UsageStats | null;
  total: UsageStats | null;
  error?: string;
};

/**
 * Subset of `ccusage daily --json` output that Burnbar consumes.
 * `daily[].period` is an ISO date (YYYY-MM-DD); `totals` is the grand
 * total across the returned range.
 */
export type CcusageDailyReport = {
  daily: Array<{
    period: string;
    totalTokens: number;
    totalCost: number;
  }>;
  totals: {
    totalTokens: number;
    totalCost: number;
  };
};
