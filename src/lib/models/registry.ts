import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { isAdminPromotionAction } from "./promotion-context";
import type { ModelStatus, ModelVersionRef, RegisterModelInput, RegisterModelVersionInput } from "./types";

export async function registerModel(input: RegisterModelInput): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase.from("models").select("id").eq("code", input.code).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("models")
    .insert({ code: input.code, name: input.name, model_type: input.modelType, description: input.description ?? null })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error(`Failed to register model ${input.code}.`);
  return data.id;
}

export async function registerModelVersion(input: RegisterModelVersionInput): Promise<ModelVersionRef> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("model_versions")
    .select("id, model_id")
    .eq("model_id", input.modelId)
    .eq("version", input.version)
    .maybeSingle();
  if (existing) return { id: existing.id, modelId: existing.model_id };

  const { data, error } = await supabase
    .from("model_versions")
    .insert({
      model_id: input.modelId,
      version: input.version,
      horizons: input.horizons ?? [],
      required_feature_schema_version: input.requiredFeatureSchemaVersion ?? null,
      cost_class: input.costClass ?? "FREE",
      estimated_inference_cost_usd: input.estimatedInferenceCostUsd ?? 0,
      config: input.config ?? {},
    })
    .select("id, model_id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to register model version.");

  await recordPromotionEvent(data.id, "REGISTERED", null, "EXPERIMENTAL", "Initial registration.");
  return { id: data.id, modelId: data.model_id };
}

/** Latest PRODUCTION version for a model code, or null if none exists yet. Never returns a SHADOW/EXPERIMENTAL/PAPER version, even if that's the only one registered. */
export async function getActiveProductionModelVersion(modelCode: string): Promise<ModelVersionRef | null> {
  const supabase = createServiceRoleClient();
  const { data: model } = await supabase.from("models").select("id").eq("code", modelCode).maybeSingle();
  if (!model) return null;

  const { data: version } = await supabase
    .from("model_versions")
    .select("id, model_id")
    .eq("model_id", model.id)
    .eq("status", "PRODUCTION")
    .order("promoted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return null;
  return { id: version.id, modelId: version.model_id };
}

/**
 * The one path that changes a model version's lifecycle status. Promoting
 * to PRODUCTION requires running inside runAsAdminPromotionAction() (see
 * promotion-context.ts) — an experiment runner or any other caller that
 * just imports this function directly cannot self-promote to production,
 * no matter what it computed. Every transition is logged to
 * model_promotion_events (append-only).
 */
export async function promoteModelVersion(
  modelVersionId: string,
  toStatus: ModelStatus,
  reason: string,
  actorProfileId?: string | null
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: current } = await supabase.from("model_versions").select("status").eq("id", modelVersionId).single();
  if (!current) throw new Error(`Model version ${modelVersionId} not found.`);

  // The gate covers BOTH directions of crossing the PRODUCTION boundary —
  // demoting a live production model is just as consequential as
  // promoting one, and originally only promotion was gated.
  const entersOrLeavesProduction = toStatus === "PRODUCTION" || current.status === "PRODUCTION";
  if (entersOrLeavesProduction && !isAdminPromotionAction()) {
    throw new Error(
      "Changing a model version's status into or out of PRODUCTION requires an explicit admin action " +
        "(runAsAdminPromotionAction) — no automated or research code path may do this directly."
    );
  }

  const { error } = await supabase
    .from("model_versions")
    .update({
      status: toStatus,
      promoted_at: toStatus === "PRODUCTION" ? new Date().toISOString() : undefined,
      retired_at: toStatus === "RETIRED" ? new Date().toISOString() : undefined,
      retirement_reason: toStatus === "RETIRED" ? reason : undefined,
    })
    .eq("id", modelVersionId);
  if (error) throw error;

  const eventType =
    toStatus === "SHADOW"
      ? "PROMOTED_TO_SHADOW"
      : toStatus === "PAPER"
        ? "PROMOTED_TO_PAPER"
        : toStatus === "PRODUCTION"
          ? "PROMOTED_TO_PRODUCTION"
          : toStatus === "RETIRED"
            ? "RETIRED"
            : toStatus === "VALIDATED"
              ? "VALIDATED"
              : "DEMOTED";

  await recordPromotionEvent(modelVersionId, eventType, current.status, toStatus, reason, actorProfileId);
}

async function recordPromotionEvent(
  modelVersionId: string,
  eventType:
    | "REGISTERED"
    | "VALIDATED"
    | "PROMOTED_TO_SHADOW"
    | "PROMOTED_TO_PAPER"
    | "PROMOTED_TO_PRODUCTION"
    | "DEMOTED"
    | "RETIRED",
  fromStatus: ModelStatus | null,
  toStatus: ModelStatus,
  reason: string,
  actorProfileId?: string | null
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("model_promotion_events").insert({
    model_version_id: modelVersionId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    reason,
    actor: actorProfileId ?? null,
  });
}
