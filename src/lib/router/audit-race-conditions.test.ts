import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { runAsAdminPromotionAction } from "@/lib/models/promotion-context";
import { promoteModelVersion, registerModel, registerModelVersion } from "@/lib/models/registry";

import { routeAndInvoke } from "./orchestrator";

describe("AUDIT: §12 race conditions", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  afterAll(async () => {
    await supabase.from("router_decisions").delete().eq("security_id", securityId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("[TOCTOU budget race] N concurrent routeAndInvoke calls each independently see 'budget available' — the router has no reservation/locking step", async () => {
    const { data } = await supabase.from("securities").insert({ ticker: `RACEAUDIT_${randomUUID().slice(0, 8)}`, name: "Race Audit" }).select("id").single();
    securityId = data!.id;

    let invokeCount = 0;
    const calls = Array.from({ length: 8 }, () =>
      routeAndInvoke(
        {
          candidateRankingId: null,
          securityId,
          researchRunId: null,
          rank: 1,
          confidence: 0.9,
          disagreement: null,
          materialChangeFlag: false,
          lastAnalysisAt: null,
          tierCode: "BLIND_ANALYSIS",
        },
        async () => {
          invokeCount++;
        }
      )
    );

    const decisions = await Promise.all(calls);
    const invokes = decisions.filter((d) => d.decision === "INVOKE").length;
    console.log(`[race] 8 concurrent routeAndInvoke calls, same candidate/tier: ${invokes} INVOKE, invokeCount=${invokeCount}`);
    if (invokes > 1) {
      console.log(
        "FINDING: the router has no reservation/locking mechanism — under real concurrency, multiple simultaneous calls can each independently read the same 'budget remaining' snapshot and each decide INVOKE, since getRemainingBudget() is a plain read with no lock. In a real deployment where this fired N genuinely simultaneous LLM calls, actual total spend could exceed the intended per-check budget before the NEXT budget read reflects the first calls' cost. Mitigated in part by the underlying gateway's own budget checks happening again at actual call time (a second, later check) — but the router's own decision is not itself safe against this race."
      );
    }
    expect(invokes).toBeGreaterThanOrEqual(1);
  });

  it("[concurrent promotion race] two simultaneous promotions of the SAME version to PRODUCTION do not corrupt the audit log or leave an inconsistent status", async () => {
    const modelId = await registerModel({ code: `RACEAUDIT_MODEL_${randomUUID().slice(0, 6)}`, name: "test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });

    const [r1, r2] = await Promise.allSettled([
      runAsAdminPromotionAction(() => promoteModelVersion(version.id, "PRODUCTION", "race attempt 1")),
      runAsAdminPromotionAction(() => promoteModelVersion(version.id, "PRODUCTION", "race attempt 2")),
    ]);

    console.log(`[race] concurrent promotions: r1=${r1.status}, r2=${r2.status}`);

    const { data: finalStatus } = await supabase.from("model_versions").select("status").eq("id", version.id).single();
    expect(finalStatus?.status).toBe("PRODUCTION"); // both racing toward the same end state — should land there either way

    const { data: events } = await supabase.from("model_promotion_events").select("event_type").eq("model_version_id", version.id).order("created_at");
    console.log(`[race] promotion_events after concurrent race: ${events?.map((e) => e.event_type).join(",")}`);
    // Both concurrent calls likely succeed independently (Postgres
    // serializes the two UPDATEs; there's no uniqueness constraint
    // preventing a duplicate PROMOTED_TO_PRODUCTION event) — documenting
    // actual behavior rather than presupposing a single-winner semantic.
    const promotionEventCount = (events ?? []).filter((e) => e.event_type === "PROMOTED_TO_PRODUCTION").length;
    if (promotionEventCount > 1) {
      console.log(`FINDING: ${promotionEventCount} separate PROMOTED_TO_PRODUCTION audit events were written for a single race — the audit log is not deduplicated against redundant concurrent promotions of an already-PRODUCTION version. Not a security issue (both calls were genuinely admin-authorized), but a minor audit-trail noise/clarity issue.`);
    }

    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
  });
});
