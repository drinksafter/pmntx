import "server-only";

import { loadUsageSummary } from "@/lib/ai/usage-queries";

export type RemainingBudget = { dailyUsd: number; monthlyUsd: number };

/**
 * Thin wrapper over the EXISTING AI usage/budget query (src/lib/ai/
 * usage-queries.ts) — never reimplements spend tracking. Fails closed
 * exactly like the gateway itself: if no daily/monthly limit is
 * configured at all, remaining budget is 0 (nothing allowed through),
 * never treated as unlimited.
 */
export async function getRemainingBudget(): Promise<RemainingBudget> {
  const summary = await loadUsageSummary();

  if (summary.killSwitchEnabled) {
    return { dailyUsd: 0, monthlyUsd: 0 };
  }

  const dailyLimit = summary.limits.maxCostPerDayUsd;
  const monthlyLimit = summary.limits.maxCostPerMonthUsd;

  return {
    dailyUsd: dailyLimit == null ? 0 : Math.max(0, dailyLimit - summary.spendToday),
    monthlyUsd: monthlyLimit == null ? 0 : Math.max(0, monthlyLimit - summary.spendThisMonth),
  };
}
