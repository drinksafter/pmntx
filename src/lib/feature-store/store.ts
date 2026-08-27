import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { FeatureFamily, FeatureValueInput, FeatureValueRecord } from "./types";

const definitionCache = new Map<string, string>(); // code -> feature_definitions.id

async function getOrCreateFeatureDefinitionId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  code: string,
  family: FeatureFamily,
  name: string
): Promise<string> {
  const cached = definitionCache.get(code);
  if (cached) return cached;

  const { data: existing } = await supabase
    .from("feature_definitions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing) {
    definitionCache.set(code, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("feature_definitions")
    .insert({ code, family, name })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error(`Failed to register feature definition ${code}.`);

  definitionCache.set(code, created.id);
  return created.id;
}

/**
 * Writes one feature value. Never updates an existing row — a revised
 * value for the same security/feature/observation is a new row, per the
 * pivot brief's "preserve historical versions" requirement (§6).
 */
export async function writeFeatureValue(
  input: FeatureValueInput & { family: FeatureFamily; displayName?: string }
): Promise<void> {
  const supabase = createServiceRoleClient();
  const featureDefinitionId = await getOrCreateFeatureDefinitionId(
    supabase,
    input.featureCode,
    input.family,
    input.displayName ?? input.featureCode
  );

  const { error } = await supabase.from("feature_values").insert({
    feature_definition_id: featureDefinitionId,
    security_id: input.securityId,
    value: input.value,
    observation_at: input.observationAt,
    effective_at: input.effectiveAt ?? null,
    publication_at: input.publicationAt ?? null,
    available_at: input.availableAt,
    source: input.source,
    source_version: input.sourceVersion ?? null,
    source_record_id: input.sourceRecordId ?? null,
    feature_schema_version: input.featureSchemaVersion ?? "v1",
  });
  if (error) throw error;
}

export async function writeFeatureValues(
  inputs: (FeatureValueInput & { family: FeatureFamily; displayName?: string })[]
): Promise<void> {
  for (const input of inputs) {
    await writeFeatureValue(input);
  }
}

/**
 * The point-in-time query: returns the latest known value of each
 * requested feature for a security as of `asOfIso` — i.e. what PMNTx
 * could actually have known at that moment. Filters strictly on
 * `available_at <= asOfIso`; a feature whose `available_at` is after
 * `asOfIso` is invisible here regardless of how old its `observation_at`
 * is. This is the critical anti-look-ahead-leakage guarantee (pivot
 * brief §5/§6/§26 property #1).
 */
export async function getFeaturesAsOf(
  securityId: string,
  asOfIso: string,
  featureCodes?: string[]
): Promise<FeatureValueRecord[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("feature_values")
    .select("id, value, observation_at, available_at, source, feature_definitions(code)")
    .eq("security_id", securityId)
    .lte("available_at", asOfIso)
    .order("observation_at", { ascending: false });

  if (featureCodes && featureCodes.length > 0) {
    const { data: definitions } = await supabase
      .from("feature_definitions")
      .select("id, code")
      .in("code", featureCodes);
    const ids = (definitions ?? []).map((d) => d.id);
    query = query.in("feature_definition_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Dedupe to the latest observation_at per feature code (query above is
  // already ordered newest-observation-first).
  const latestByCode = new Map<string, FeatureValueRecord>();
  for (const row of data ?? []) {
    const code = (row.feature_definitions as unknown as { code: string } | null)?.code;
    if (!code || latestByCode.has(code)) continue;
    latestByCode.set(code, {
      id: row.id,
      featureCode: code,
      securityId,
      value: Number(row.value),
      observationAt: row.observation_at,
      availableAt: row.available_at,
      source: row.source,
    });
  }
  return Array.from(latestByCode.values());
}
