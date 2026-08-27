"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { promoteModelVersion } from "@/lib/models/registry";
import { runAsAdminPromotionAction } from "@/lib/models/promotion-context";

export type ModelActionState = { error: string | null; success?: boolean };

/**
 * The ONLY UI path that can promote a model version to PRODUCTION —
 * wrapped in runAsAdminPromotionAction, which registry.ts's
 * promoteModelVersion() requires for that specific transition. No
 * experiment/research code path can reach this.
 */
export async function promoteModelVersionAction(
  _prevState: ModelActionState,
  formData: FormData
): Promise<ModelActionState> {
  const admin = await requireAdmin();

  const modelVersionId = String(formData.get("modelVersionId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "") as
    | "VALIDATED"
    | "SHADOW"
    | "PAPER"
    | "PRODUCTION"
    | "RETIRED";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!modelVersionId || !toStatus || !reason) {
    return { error: "Model version, target status, and reason are all required." };
  }

  try {
    if (toStatus === "PRODUCTION") {
      await runAsAdminPromotionAction(() => promoteModelVersion(modelVersionId, toStatus, reason, admin.id));
    } else {
      await promoteModelVersion(modelVersionId, toStatus, reason, admin.id);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update model version status." };
  }

  revalidatePath("/admin/models");
  return { error: null, success: true };
}
