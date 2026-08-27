import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { runAsAdminPromotionAction } from "./promotion-context";
import { getActiveProductionModelVersion, promoteModelVersion, registerModel, registerModelVersion } from "./registry";

describe("models/registry", () => {
  const supabase = createServiceRoleClient();
  const modelIds: string[] = [];

  afterAll(async () => {
    for (const id of modelIds) {
      await supabase.from("model_versions").delete().eq("model_id", id);
      await supabase.from("models").delete().eq("id", id);
    }
  });

  it("registers a model and a version idempotently", async () => {
    const code = `TEST_MODEL_${randomUUID().slice(0, 8)}`;
    const modelId = await registerModel({ code, name: "Test Model", modelType: "LOGISTIC" });
    modelIds.push(modelId);

    const modelIdAgain = await registerModel({ code, name: "Test Model", modelType: "LOGISTIC" });
    expect(modelIdAgain).toBe(modelId);

    const version = await registerModelVersion({ modelId, version: "v1" });
    expect(version.modelId).toBe(modelId);

    const versionAgain = await registerModelVersion({ modelId, version: "v1" });
    expect(versionAgain.id).toBe(version.id);
  });

  it("[property #14 / #10 analog] refuses to promote a model version to PRODUCTION outside an admin-triggered action", async () => {
    const code = `TEST_MODEL_${randomUUID().slice(0, 8)}`;
    const modelId = await registerModel({ code, name: "Test Model", modelType: "LOGISTIC" });
    modelIds.push(modelId);
    const version = await registerModelVersion({ modelId, version: "v1" });

    await expect(promoteModelVersion(version.id, "PRODUCTION", "test")).rejects.toThrow(/admin action/i);

    const { data: unchanged } = await supabase.from("model_versions").select("status").eq("id", version.id).single();
    expect(unchanged?.status).toBe("EXPERIMENTAL");
  });

  it("promotes to PRODUCTION when run inside runAsAdminPromotionAction, and logs an auditable event", async () => {
    const code = `TEST_MODEL_${randomUUID().slice(0, 8)}`;
    const modelId = await registerModel({ code, name: "Test Model", modelType: "LOGISTIC" });
    modelIds.push(modelId);
    const version = await registerModelVersion({ modelId, version: "v1" });

    await runAsAdminPromotionAction(() => promoteModelVersion(version.id, "PRODUCTION", "manual test promotion"));

    const { data: promoted } = await supabase.from("model_versions").select("status, promoted_at").eq("id", version.id).single();
    expect(promoted?.status).toBe("PRODUCTION");
    expect(promoted?.promoted_at).toBeTruthy();

    const { data: events } = await supabase
      .from("model_promotion_events")
      .select("event_type, from_status, to_status, reason")
      .eq("model_version_id", version.id)
      .order("created_at");
    expect(events?.map((e) => e.event_type)).toEqual(["REGISTERED", "PROMOTED_TO_PRODUCTION"]);
    expect(events?.[1].reason).toBe("manual test promotion");

    const active = await getActiveProductionModelVersion(code);
    expect(active?.id).toBe(version.id);
  });

  it("SHADOW/PAPER/VALIDATED promotions don't require the admin-action context", async () => {
    const code = `TEST_MODEL_${randomUUID().slice(0, 8)}`;
    const modelId = await registerModel({ code, name: "Test Model", modelType: "LOGISTIC" });
    modelIds.push(modelId);
    const version = await registerModelVersion({ modelId, version: "v1" });

    await expect(promoteModelVersion(version.id, "SHADOW", "test")).resolves.not.toThrow();
    const { data } = await supabase.from("model_versions").select("status").eq("id", version.id).single();
    expect(data?.status).toBe("SHADOW");
  });

  it("PMNTX_CORE's seeded production model version is discoverable", async () => {
    const active = await getActiveProductionModelVersion("PMNTX_CORE");
    expect(active).not.toBeNull();
  });
});
