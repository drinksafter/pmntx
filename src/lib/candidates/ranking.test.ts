import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { rankCandidates, writeCandidateRankings } from "./ranking";
import type { SecurityScoreInput } from "./types";

describe("candidates/ranking", () => {
  it("ranks a mock universe deterministically by |compositeScore|, strongest first", () => {
    const inputs: SecurityScoreInput[] = [
      { securityId: "A", scores: [{ modelCode: "M1", score: 0.1 }] },
      { securityId: "B", scores: [{ modelCode: "M1", score: -0.9 }] }, // strong SHORT — should outrank a weak LONG
      { securityId: "C", scores: [{ modelCode: "M1", score: 0.5 }] },
    ];
    const ranked = rankCandidates(inputs, { maxCandidates: 100, minScoreThreshold: null });

    expect(ranked.map((r) => r.securityId)).toEqual(["B", "C", "A"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("selects only up to maxCandidates, in rank order", () => {
    const inputs: SecurityScoreInput[] = Array.from({ length: 10 }, (_, i) => ({
      securityId: `SEC_${i}`,
      scores: [{ modelCode: "M1", score: (i + 1) / 10 }],
    }));
    const ranked = rankCandidates(inputs, { maxCandidates: 3, minScoreThreshold: null });

    const selected = ranked.filter((r) => r.selected);
    expect(selected).toHaveLength(3);
    expect(selected.map((r) => r.securityId)).toEqual(["SEC_9", "SEC_8", "SEC_7"]);
  });

  it("respects minScoreThreshold even within the candidate limit", () => {
    const inputs: SecurityScoreInput[] = [
      { securityId: "STRONG", scores: [{ modelCode: "M1", score: 0.8 }] },
      { securityId: "WEAK", scores: [{ modelCode: "M1", score: 0.05 }] },
    ];
    const ranked = rankCandidates(inputs, { maxCandidates: 100, minScoreThreshold: 0.2 });

    expect(ranked.find((r) => r.securityId === "STRONG")?.selected).toBe(true);
    expect(ranked.find((r) => r.securityId === "WEAK")?.selected).toBe(false);
  });

  it("[property #15] preserves individual model scores and computes disagreement — never just averages them away", () => {
    const inputs: SecurityScoreInput[] = [
      { securityId: "A", scores: [{ modelCode: "M1", score: 0.9 }, { modelCode: "M2", score: -0.9 }] },
    ];
    const ranked = rankCandidates(inputs, { maxCandidates: 100, minScoreThreshold: null });

    expect(ranked[0].scoreComponents).toEqual({ M1: 0.9, M2: -0.9 });
    expect(ranked[0].compositeScore).toBeCloseTo(0); // averages to ~0
    expect(ranked[0].disagreement).not.toBeNull();
    expect(ranked[0].disagreement!).toBeGreaterThan(1); // but disagreement is large — the ~0 composite would hide this alone
  });

  it("carries novelty signal and material-change flag through unchanged", () => {
    const inputs: SecurityScoreInput[] = [
      { securityId: "A", scores: [{ modelCode: "M1", score: 0.5 }], noveltySignal: 0.7, materialChangeFlag: true },
    ];
    const ranked = rankCandidates(inputs, { maxCandidates: 100, minScoreThreshold: null });

    expect(ranked[0].noveltySignal).toBe(0.7);
    expect(ranked[0].materialChangeFlag).toBe(true);
  });

  describe("writeCandidateRankings (DB)", () => {
    const supabase = createServiceRoleClient();
    let securityId: string;
    let modelId: string;
    let modelVersionId: string;
    let researchRunId: string;

    afterAll(async () => {
      await supabase.from("candidate_rankings").delete().eq("research_run_id", researchRunId);
      await supabase.from("model_runs").delete().eq("research_run_id", researchRunId);
      await supabase.from("research_runs").delete().eq("id", researchRunId);
      await supabase.from("model_versions").delete().eq("model_id", modelId);
      await supabase.from("models").delete().eq("id", modelId);
      await supabase.from("securities").delete().eq("id", securityId);
    });

    it("writes a MODEL-origin, frozen research_run with candidate_rankings and a model_runs row", async () => {
      const { data: security } = await supabase
        .from("securities")
        .insert({ ticker: `RANKTEST_${randomUUID().slice(0, 8)}`, name: "Ranking Test Security" })
        .select("id")
        .single();
      securityId = security!.id;

      modelId = await registerModel({ code: `RANKTEST_MODEL_${randomUUID().slice(0, 8)}`, name: "Test", modelType: "LOGISTIC" });
      const version = await registerModelVersion({ modelId, version: "v1" });
      modelVersionId = version.id;

      const ranked = rankCandidates(
        [{ securityId, scores: [{ modelCode: "TEST", score: 0.7 }] }],
        { maxCandidates: 100, minScoreThreshold: null }
      );

      const result = await writeCandidateRankings("2026-01-01", modelVersionId, ranked);
      researchRunId = result.researchRunId;
      expect(result.selectedCount).toBe(1);

      const { data: run } = await supabase.from("research_runs").select("origin_type, frozen_at, status").eq("id", researchRunId).single();
      expect(run?.origin_type).toBe("MODEL");
      expect(run?.frozen_at).toBeTruthy();
      expect(run?.status).toBe("SUCCEEDED");

      const { data: modelRun } = await supabase.from("model_runs").select("model_version_id, status").eq("research_run_id", researchRunId).single();
      expect(modelRun?.model_version_id).toBe(modelVersionId);
      expect(modelRun?.status).toBe("SUCCEEDED");

      const { data: rankingRow } = await supabase
        .from("candidate_rankings")
        .select("selected, score, score_components")
        .eq("research_run_id", researchRunId)
        .single();
      expect(rankingRow?.selected).toBe(true);
      expect(rankingRow?.score).toBeCloseTo(0.7);
    });
  });
});
