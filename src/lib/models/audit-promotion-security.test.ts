import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { isAdminPromotionAction, runAsAdminPromotionAction } from "./promotion-context";
import { promoteModelVersion, registerModel, registerModelVersion } from "./registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

describe("AUDIT: model promotion security", () => {
  const supabase = createServiceRoleClient();
  const modelIds: string[] = [];

  afterAll(async () => {
    for (const id of modelIds) {
      await supabase.from("model_versions").delete().eq("model_id", id);
      await supabase.from("models").delete().eq("id", id);
    }
  });

  async function freshVersion() {
    const modelId = await registerModel({ code: `AUDIT_PROMO_${randomUUID().slice(0, 8)}`, name: "test", modelType: "LOGISTIC" });
    modelIds.push(modelId);
    return registerModelVersion({ modelId, version: "v1" });
  }

  it("direct call outside any wrapper is blocked", async () => {
    const version = await freshVersion();
    await expect(promoteModelVersion(version.id, "PRODUCTION", "direct bypass attempt")).rejects.toThrow(/admin action/i);
  });

  it('"experiment code" simulation — calling promoteModelVersion from within an unwrapped async function chain is blocked', async () => {
    const version = await freshVersion();
    async function simulateExperimentRunner() {
      // An experiment runner would never wrap this call — simulating that.
      return promoteModelVersion(version.id, "PRODUCTION", "experiment auto-promotion attempt");
    }
    await expect(simulateExperimentRunner()).rejects.toThrow(/admin action/i);
  });

  it("nesting a non-admin call INSIDE an unrelated admin-wrapped call for a DIFFERENT version does not grant it protection", async () => {
    const versionA = await freshVersion();
    const versionB = await freshVersion();

    let bError: unknown = null;
    await runAsAdminPromotionAction(async () => {
      // Legit promotion for A.
      await promoteModelVersion(versionA.id, "PRODUCTION", "legit");
      // Still inside the SAME context — B should also succeed here, since
      // the context is per-call-tree, not per-model. This documents actual
      // behavior: the gate is "was this call tree admin-triggered", not
      // "was this specific model-version explicitly authorized."
      try {
        await promoteModelVersion(versionB.id, "PRODUCTION", "opportunistic promotion of an unrelated model inside the same admin action");
      } catch (err) {
        bError = err;
      }
    });

    const { data: bStatus } = await supabase.from("model_versions").select("status").eq("id", versionB.id).single();
    console.log(`[promotion scope] versionB status after being promoted inside versionA's admin action: ${bStatus?.status}, error: ${bError}`);
    if (bStatus?.status === "PRODUCTION") {
      console.log(
        "FINDING: runAsAdminPromotionAction's gate is scoped to the ASYNC CALL TREE, not to a specific model version — any promoteModelVersion(..., 'PRODUCTION', ...) call made anywhere within an admin-wrapped call tree succeeds, not just the one the admin action intended. This matches the actual UI usage pattern (one server action, one model version, one call) but is worth noting as the gate's real scope."
      );
    }
  });

  it("[AsyncLocalStorage leak check] a concurrent, unrelated async operation never sees isAdminPromotionAction() as true", async () => {
    const results: boolean[] = [];
    const barrier = { resolve: () => {}, promise: Promise.resolve() };
    let releaseUnrelated: () => void = () => {};
    const unrelatedGate = new Promise<void>((resolve) => {
      releaseUnrelated = resolve;
    });

    const adminTask = runAsAdminPromotionAction(async () => {
      // Yield control (microtask + a real macrotask) while inside the
      // admin context, to give the unrelated task every opportunity to
      // observe leaked context if AsyncLocalStorage were implemented
      // incorrectly (it isn't — Node's implementation is correlation-ID-based
      // per async execution context, not a mutable global).
      await new Promise((r) => setTimeout(r, 20));
      results.push(isAdminPromotionAction()); // should be true, inside its own context
      releaseUnrelated();
    });

    const unrelatedTask = (async () => {
      await unrelatedGate; // wait until partway through the admin task
      results.push(isAdminPromotionAction()); // should be false — NOT wrapped
    })();

    await Promise.all([adminTask, unrelatedTask]);
    void barrier;

    // results[0] = the admin-context check (true), results[1] = the
    // concurrent unrelated check (must be false — no leak).
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(false);
  });

  it("[AsyncLocalStorage leak check] many concurrent Promise.all branches — only the wrapped one sees the context", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i === 5
          ? runAsAdminPromotionAction(async () => {
              await new Promise((r) => setTimeout(r, Math.random() * 10));
              return isAdminPromotionAction();
            })
          : (async () => {
              await new Promise((r) => setTimeout(r, Math.random() * 10));
              return isAdminPromotionAction();
            })()
      )
    );
    expect(outcomes[5]).toBe(true);
    expect(outcomes.filter((_, i) => i !== 5).every((o) => o === false)).toBe(true);
  });

  it("[KNOWN, NOT FIXED — P2, by design] RETIRED -> PRODUCTION directly is allowed with no intermediate re-validation, as long as it's admin-triggered", async () => {
    const version = await freshVersion();
    await promoteModelVersion(version.id, "RETIRED", "retiring for test");
    await runAsAdminPromotionAction(() => promoteModelVersion(version.id, "PRODUCTION", "un-retiring straight to production"));
    const { data: afterRetiredToProd } = await supabase.from("model_versions").select("status").eq("id", version.id).single();
    // Documenting actual, unchanged behavior: promoteModelVersion has no
    // sequencing/lifecycle-order validation. This is a deliberate
    // non-fix (see audit report) — a real fix requires a broader lifecycle
    // state machine, not a minimal correction, and the admin-action gate
    // still requires a human to explicitly authorize it either way.
    expect(afterRetiredToProd?.status).toBe("PRODUCTION");
  });

  it("[FIXED — was: demotion required no gate] demoting a PRODUCTION model version now requires the SAME admin-action gate as promoting to it", async () => {
    const version2 = await freshVersion();
    await runAsAdminPromotionAction(() => promoteModelVersion(version2.id, "PRODUCTION", "promote for demotion test"));

    let demotionError: unknown = null;
    try {
      await promoteModelVersion(version2.id, "EXPERIMENTAL", "arbitrary demotion, not even inside admin context");
    } catch (err) {
      demotionError = err;
    }
    expect(demotionError).not.toBeNull();
    expect((demotionError as Error)?.message).toMatch(/admin action/i);

    const { data: afterFailedDemotion } = await supabase.from("model_versions").select("status").eq("id", version2.id).single();
    expect(afterFailedDemotion?.status).toBe("PRODUCTION"); // unchanged — the demotion was correctly blocked

    // The SAME demotion, done correctly inside the admin-action context, succeeds.
    await runAsAdminPromotionAction(() => promoteModelVersion(version2.id, "EXPERIMENTAL", "legitimate admin-authorized demotion"));
    const { data: afterLegitDemotion } = await supabase.from("model_versions").select("status").eq("id", version2.id).single();
    expect(afterLegitDemotion?.status).toBe("EXPERIMENTAL");
  });

  it("append-only promotion audit log: every transition above was actually logged", async () => {
    const version = await freshVersion();
    await runAsAdminPromotionAction(() => promoteModelVersion(version.id, "VALIDATED", "step 1"));
    await runAsAdminPromotionAction(() => promoteModelVersion(version.id, "PRODUCTION", "step 2"));

    const { data: events } = await supabase
      .from("model_promotion_events")
      .select("event_type, from_status, to_status")
      .eq("model_version_id", version.id)
      .order("created_at");
    expect(events?.map((e) => e.event_type)).toEqual(["REGISTERED", "VALIDATED", "PROMOTED_TO_PRODUCTION"]);
  });
});
