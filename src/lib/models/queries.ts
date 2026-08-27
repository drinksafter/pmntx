import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ModelVersionListRow = {
  modelCode: string;
  modelName: string;
  modelType: string;
  versionId: string;
  version: string;
  status: string;
  costClass: string;
  estimatedInferenceCostUsd: number;
  promotedAt: string | null;
  createdAt: string;
};

/** Admin-only read model for Admin -> System -> Models. */
export async function listModelsWithVersions(): Promise<ModelVersionListRow[]> {
  const supabase = createServiceRoleClient();
  const { data: models } = await supabase.from("models").select("id, code, name, model_type");
  const { data: versions } = await supabase
    .from("model_versions")
    .select("id, model_id, version, status, cost_class, estimated_inference_cost_usd, promoted_at, created_at")
    .order("created_at", { ascending: false });

  const modelById = new Map((models ?? []).map((m) => [m.id, m]));

  return (versions ?? []).map((v) => {
    const model = modelById.get(v.model_id);
    return {
      modelCode: model?.code ?? "unknown",
      modelName: model?.name ?? "Unknown",
      modelType: model?.model_type ?? "unknown",
      versionId: v.id,
      version: v.version,
      status: v.status,
      costClass: v.cost_class,
      estimatedInferenceCostUsd: Number(v.estimated_inference_cost_usd),
      promotedAt: v.promoted_at,
      createdAt: v.created_at,
    };
  });
}
