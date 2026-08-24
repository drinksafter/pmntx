import "server-only";

import { buildAnonymizedPacket } from "@/lib/blind-analysis/packet";
import { getActivePromptVersion } from "@/lib/blind-analysis/prompt";
import { computeRequestFingerprint, requestAiCompletion } from "@/lib/ai/gateway";
import { resolveAiRoute } from "@/lib/ai/router";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IdeaDirection } from "@/lib/supabase/types";

const VALID_DIRECTIONS: IdeaDirection[] = ["LONG", "SHORT", "WATCH", "PASS"];

type ParsedRevealResponse = {
  recommendation: IdeaDirection | null;
  confidence: number | null;
  probabilities: { positive?: number; negative?: number } | null;
  reasoning: string | null;
  parseError?: string;
};

function parseRevealResponse(text: string): ParsedRevealResponse {
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) jsonText = fenceMatch[1];

  try {
    const parsed = JSON.parse(jsonText);
    const recommendation =
      typeof parsed.recommendation === "string" &&
      VALID_DIRECTIONS.includes(parsed.recommendation as IdeaDirection)
        ? (parsed.recommendation as IdeaDirection)
        : null;
    return {
      recommendation,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      probabilities: parsed.probabilities && typeof parsed.probabilities === "object" ? parsed.probabilities : null,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : null,
    };
  } catch (err) {
    return {
      recommendation: null,
      confidence: null,
      probabilities: null,
      reasoning: text,
      parseError: err instanceof Error ? err.message : "JSON parse failed",
    };
  }
}

// A direction flip is the dominant signal (weighted 1.0); probability
// drift is a secondary continuous signal (weighted 0.5), keeping the
// result in a legible ~0..1.5 range. A starting heuristic, not calibrated
// — same caveat as the scoring constants in src/lib/hunters/* and
// src/lib/pmntx-core/scoring.ts.
export function computeNarrativeAdjustment(
  blindRecommendation: IdeaDirection | null,
  blindProbabilities: unknown,
  revealedRecommendation: IdeaDirection | null,
  revealedProbabilities: { positive?: number; negative?: number } | null
): number {
  const directionChanged =
    blindRecommendation !== null &&
    revealedRecommendation !== null &&
    blindRecommendation !== revealedRecommendation;

  const blindPositive = (blindProbabilities as { positive?: number } | null)?.positive;
  const revealedPositive = revealedProbabilities?.positive;
  const probDelta =
    typeof blindPositive === "number" && typeof revealedPositive === "number"
      ? Math.abs(revealedPositive - blindPositive)
      : 0;

  return (directionChanged ? 1 : 0) + probDelta * 0.5;
}

export type RevealAnalysisResult = {
  blindAnalysisId: string;
  status: "FROZEN" | "ALREADY_EXISTS" | "NOT_CONFIGURED" | "BLOCKED" | "PARSE_ERROR";
  revealedAnalysisId?: string;
  narrativeAdjustment?: number;
  message?: string;
};

/**
 * Reveals identity and re-analyzes for every frozen blind_analyses row on
 * a security. Only one real reveal call is made per security — the
 * gateway's own duplicate-fingerprint suppression (same fingerprint on
 * every attempt for this run+security) naturally makes the second and
 * later attempts a DUPLICATE, whose stored output is reused rather than
 * paying for the same reveal twice. Each blind_analysis still gets its
 * own revealed_analyses row and its own narrative_adjustment, computed
 * against that specific blind result.
 */
export async function runRevealAnalysisForSecurity(
  researchRunId: string,
  securityId: string
): Promise<RevealAnalysisResult[]> {
  const supabase = createServiceRoleClient();

  const { data: run } = await supabase.from("research_runs").select("frozen_at").eq("id", researchRunId).single();
  if (!run?.frozen_at) {
    throw new Error(
      `Cannot run reveal analysis: research_run ${researchRunId} is not frozen yet (independence firewall).`
    );
  }

  const { data: blindRows } = await supabase
    .from("blind_analyses")
    .select("id, recommendation, probabilities")
    .eq("research_run_id", researchRunId)
    .eq("security_id", securityId)
    .not("frozen_at", "is", null);

  if (!blindRows || blindRows.length === 0) return [];

  const { data: existingRevealed } = await supabase
    .from("revealed_analyses")
    .select("blind_analysis_id")
    .in(
      "blind_analysis_id",
      blindRows.map((b) => b.id)
    )
    .not("frozen_at", "is", null);
  const alreadyRevealedBlindIds = new Set((existingRevealed ?? []).map((r) => r.blind_analysis_id));

  const promptVersion = await getActivePromptVersion("REVEALED_ANALYST");
  const routeInfo = await resolveAiRoute("REVEALED_ANALYST");
  const packet = await buildAnonymizedPacket(securityId, researchRunId);
  const { data: security } = await supabase.from("securities").select("ticker, name").eq("id", securityId).single();

  const packetJson = JSON.stringify(packet);
  const fingerprint = computeRequestFingerprint([
    "REVEALED_ANALYST",
    securityId,
    researchRunId,
    packetJson,
    promptVersion?.id,
  ]);

  const results: RevealAnalysisResult[] = [];
  // Cache the one real (or duplicate-resolved) response across the loop
  // below so a second blind row never triggers a second real analysis.
  let sharedResponse: { text: string; aiExecutionId: string } | null = null;
  let sharedFailure: RevealAnalysisResult | null = null;

  for (const blind of blindRows) {
    if (alreadyRevealedBlindIds.has(blind.id)) {
      results.push({
        blindAnalysisId: blind.id,
        status: "ALREADY_EXISTS",
        message: "A frozen revealed analysis already exists for this blind result — never overwritten.",
      });
      continue;
    }

    if (sharedFailure) {
      results.push({ ...sharedFailure, blindAnalysisId: blind.id });
      continue;
    }

    if (!promptVersion) {
      const failure: RevealAnalysisResult = {
        blindAnalysisId: blind.id,
        status: "NOT_CONFIGURED",
        message: `No active prompt_version for role "REVEALED_ANALYST".`,
      };
      sharedFailure = failure;
      results.push(failure);
      continue;
    }

    if (!routeInfo.ok) {
      const failure: RevealAnalysisResult = { blindAnalysisId: blind.id, status: "NOT_CONFIGURED", message: routeInfo.message };
      sharedFailure = failure;
      results.push(failure);
      continue;
    }

    if (!sharedResponse) {
      const gatewayResult = await requestAiCompletion({
        role: "REVEALED_ANALYST",
        request: {
          system: promptVersion.content,
          messages: [
            {
              role: "user",
              content: `Company identity: ${security?.name ?? "unknown"} (${security?.ticker ?? "unknown"})\n\nResearch packet:\n${packetJson}`,
            },
          ],
          maxTokens: 800,
        },
        context: { researchRunId, securityId, workflowId: `reveal_analysis:${researchRunId}` },
        fingerprint,
        promptVersionId: promptVersion.id,
      });

      if (gatewayResult.status === "NOT_CONFIGURED") {
        const failure: RevealAnalysisResult = { blindAnalysisId: blind.id, status: "NOT_CONFIGURED", message: gatewayResult.message };
        sharedFailure = failure;
        results.push(failure);
        continue;
      }
      if (gatewayResult.status === "BLOCKED") {
        const failure: RevealAnalysisResult = { blindAnalysisId: blind.id, status: "BLOCKED", message: gatewayResult.message };
        sharedFailure = failure;
        results.push(failure);
        continue;
      }
      if (gatewayResult.status === "DUPLICATE") {
        const executionId = gatewayResult.existingAiExecutionId;
        if (!executionId) {
          const failure: RevealAnalysisResult = {
            blindAnalysisId: blind.id,
            status: "BLOCKED",
            message: "Duplicate detected but no prior execution to reuse.",
          };
          sharedFailure = failure;
          results.push(failure);
          continue;
        }
        const { data: priorExecution } = await supabase
          .from("ai_executions")
          .select("output")
          .eq("id", executionId)
          .single();
        const priorText = (priorExecution?.output as { text?: string } | null)?.text;
        if (!priorText) {
          const failure: RevealAnalysisResult = {
            blindAnalysisId: blind.id,
            status: "BLOCKED",
            message: "Duplicate detected but the prior execution had no recorded output to reuse.",
          };
          sharedFailure = failure;
          results.push(failure);
          continue;
        }
        sharedResponse = { text: priorText, aiExecutionId: executionId };
      } else {
        sharedResponse = { text: gatewayResult.result.text, aiExecutionId: gatewayResult.aiExecutionId };
      }
    }

    const parsed = parseRevealResponse(sharedResponse.text);
    const narrativeAdjustment = computeNarrativeAdjustment(
      blind.recommendation,
      blind.probabilities,
      parsed.recommendation,
      parsed.probabilities
    );

    const { data: inserted, error: insertError } = await supabase
      .from("revealed_analyses")
      .insert({
        blind_analysis_id: blind.id,
        security_id: securityId,
        ai_execution_id: sharedResponse.aiExecutionId,
        provider_code: routeInfo.route.providerCode,
        model_code: routeInfo.route.modelCode,
        prompt_version_id: promptVersion.id,
        recommendation: parsed.recommendation,
        probabilities: parsed.probabilities,
        reasoning: parsed.reasoning,
        narrative_adjustment: narrativeAdjustment,
        frozen_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to record revealed_analyses row: ${insertError?.message}`);
    }

    results.push({
      blindAnalysisId: blind.id,
      status: parsed.parseError ? "PARSE_ERROR" : "FROZEN",
      revealedAnalysisId: inserted.id,
      narrativeAdjustment,
      message: parsed.parseError,
    });
  }

  return results;
}

/** Runs reveal analysis for every security with at least one frozen blind analysis in this research run. */
export async function runRevealAnalysisForResearchRun(researchRunId: string): Promise<RevealAnalysisResult[]> {
  const supabase = createServiceRoleClient();

  const { data: securities } = await supabase
    .from("blind_analyses")
    .select("security_id")
    .eq("research_run_id", researchRunId)
    .not("frozen_at", "is", null);

  const uniqueSecurityIds = [...new Set((securities ?? []).map((s) => s.security_id))];

  const results: RevealAnalysisResult[] = [];
  for (const securityId of uniqueSecurityIds) {
    results.push(...(await runRevealAnalysisForSecurity(researchRunId, securityId)));
  }
  return results;
}
