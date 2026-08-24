import "server-only";

import { accountingFinancialChangeHunter } from "./accounting-financial-change";
import { governmentContractsHunter } from "./government-contracts";
import { insiderActivityHunter } from "./insider-activity";
import { runHunter } from "./runner";
import type { HunterImplementation } from "./types";

/** The 3 Hunters active in Phase 1A — docs/PHASE_1A_SCOPE_LOCK.md §1 caps this at "3-4 Hunters maximum." */
export const ACTIVE_HUNTERS: HunterImplementation[] = [
  insiderActivityHunter,
  governmentContractsHunter,
  accountingFinancialChangeHunter,
];

export type HunterRunSummary = { code: string; signalCount: number; error?: string };

/** Runs every active Hunter for a given date, isolating failures per-Hunter so one bad Hunter doesn't block the rest. */
export async function runAllActiveHunters(asOfDate: string): Promise<HunterRunSummary[]> {
  const summaries: HunterRunSummary[] = [];

  for (const hunter of ACTIVE_HUNTERS) {
    try {
      const signalCount = await runHunter(hunter, asOfDate);
      summaries.push({ code: hunter.code, signalCount });
    } catch (err) {
      summaries.push({
        code: hunter.code,
        signalCount: 0,
        error: err instanceof Error ? err.message : "Unknown Hunter error.",
      });
    }
  }

  return summaries;
}
