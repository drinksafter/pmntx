import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { HunterImplementation } from "./types";

/**
 * Resolves a Hunter's definition + version row (creating the version if
 * this is the first run at that version string), runs it, and upserts
 * every signal into hunter_results. Shared by every Hunter under
 * src/lib/hunters so version bookkeeping isn't duplicated per Hunter.
 */
export async function runHunter(hunter: HunterImplementation, asOfDate: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data: definition, error: definitionError } = await supabase
    .from("hunter_definitions")
    .select("id, is_active")
    .eq("code", hunter.code)
    .single();

  if (definitionError || !definition) {
    throw new Error(`Unknown hunter code "${hunter.code}" — check hunter_definitions seed data.`);
  }
  if (!definition.is_active) {
    throw new Error(`Hunter "${hunter.code}" is not active for Phase 1A.`);
  }

  const { data: existingVersion } = await supabase
    .from("hunter_versions")
    .select("id")
    .eq("hunter_definition_id", definition.id)
    .eq("version", hunter.version)
    .maybeSingle();

  const versionId =
    existingVersion?.id ??
    (
      await supabase
        .from("hunter_versions")
        .insert({
          hunter_definition_id: definition.id,
          version: hunter.version,
          activated_at: new Date().toISOString(),
        })
        .select("id")
        .single()
    ).data?.id;

  if (!versionId) {
    throw new Error(`Failed to resolve hunter_version for "${hunter.code}" v${hunter.version}.`);
  }

  const signals = await hunter.run(asOfDate);

  for (const signal of signals) {
    const { error } = await supabase.from("hunter_results").upsert(
      {
        hunter_version_id: versionId,
        security_id: signal.securityId,
        as_of_date: signal.asOfDate,
        signal_direction: signal.signalDirection,
        raw_value: signal.rawValue,
        normalized_score: signal.normalizedScore,
        confidence: signal.confidence,
        data_quality: signal.dataQuality,
        evidence: signal.evidence,
        explanation: signal.explanation,
        source_record_id: signal.sourceRecordId,
      },
      { onConflict: "hunter_version_id,security_id,as_of_date" }
    );
    if (error) throw error;
  }

  return signals.length;
}
