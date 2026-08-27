import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { CandidateRankingConfig } from "./types";

export async function loadRankingConfig(): Promise<CandidateRankingConfig> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("candidate_ranking_configs").select("*").eq("id", true).single();
  return {
    maxCandidates: data?.max_candidates ?? 100,
    minScoreThreshold: data?.min_score_threshold ?? null,
  };
}
