import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { RoutingTierConfig } from "./types";

export async function loadRoutingTierConfigs(): Promise<RoutingTierConfig[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("routing_tier_configs").select("*").order("tier_code");
  return (data ?? []).map((row) => ({
    tierCode: row.tier_code,
    displayName: row.display_name,
    minRank: row.min_rank,
    maxRank: row.max_rank,
    minConfidence: row.min_confidence,
    minDisagreement: row.min_disagreement,
    requiresMaterialChange: row.requires_material_change,
    maxDailyInvocations: row.max_daily_invocations,
    minHoursSinceLastAnalysis: row.min_hours_since_last_analysis,
    isEnabled: row.is_enabled,
  }));
}

export async function loadRoutingTierConfig(tierCode: string): Promise<RoutingTierConfig | null> {
  const configs = await loadRoutingTierConfigs();
  return configs.find((c) => c.tierCode === tierCode) ?? null;
}
