import "server-only";

import { getCostBreakdown, getDailyCostTotals, getMonthlyCostTotals } from "./ledger";

function startOfTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonthDateStr(): string {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

export type CostSummary = {
  today: { estimatedUsd: number; actualUsd: number };
  monthToDate: { estimatedUsd: number; actualUsd: number };
  byCategory: { key: string; totalActualUsd: number; totalEstimatedUsd: number; entryCount: number }[];
  byProvider: { key: string; totalActualUsd: number; totalEstimatedUsd: number; entryCount: number }[];
};

/** Admin-only read model for Admin -> System -> Costs. */
export async function loadCostSummary(): Promise<CostSummary> {
  const [today, monthToDate, byCategory, byProvider] = await Promise.all([
    getDailyCostTotals(startOfTodayDateStr()),
    getMonthlyCostTotals(startOfMonthDateStr()),
    getCostBreakdown("category"),
    getCostBreakdown("provider"),
  ]);
  return { today, monthToDate, byCategory, byProvider };
}
