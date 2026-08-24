import "server-only";

import { computeRequestFingerprint, requestAiCompletion } from "@/lib/ai/gateway";
import { resolveAiRoute } from "@/lib/ai/router";
import type { AiRole } from "@/lib/ai/types";
import { BRAND_SUBSYSTEM_NAMES } from "@/lib/branding";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IdeaDirection } from "@/lib/supabase/types";

import { buildAnonymizedPacket } from "./packet";
import { getActivePromptVersion } from "./prompt";

// The two independent blind-analysis roles (docs/PHASE_1A_SCOPE_LOCK.md §1).
// Each is routed to a different AI provider (see
// supabase/migrations/018_ai_model_pricing.sql) — independence comes from
// using genuinely different providers on the same anonymized packet, not
// from different prompts. Never feed one role's output into the other's
// prompt; the loop below builds every request from the packet alone.
const BLIND_ROLES: AiRole[] = ["BLIND_ANALYST", "INDEPENDENT_BLIND_ANALYST"];

const MAX_OUTPUT_TOKENS = 800;

export type BlindAnalysisRoleResult = {
  role: AiRole;
  status: "FROZEN" | "ALREADY_EXISTS" | "NOT_CONFIGURED" | "BLOCKED" | "DUPLICATE" | "PARSE_ERROR";
  blindAnalysisId?: string;
  message?: string;
};

export type BlindAnalysisSecurityResult = {
  securityId: string;
  results: BlindAnalysisRoleResult[];
};

type ParsedBlindResponse = {
  recommendation: IdeaDirection | null;
  confidence: number | null;
  probabilities: unknown;
  supportedHorizons: string[] | null;
  reasoning: string | null;
  riskFactors: string | null;
  parseError?: string;
};

const VALID_DIRECTIONS: IdeaDirection[] = ["LONG", "SHORT", "WATCH", "PASS"];

function parseBlindResponse(text: string): ParsedBlindResponse {
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
      supportedHorizons: Array.isArray(parsed.supported_horizons) ? parsed.supported_horizons : null,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : null,
      riskFactors: typeof parsed.risk_factors === "string" ? parsed.risk_factors : null,
    };
  } catch (err) {
    // A real, paid response came back but didn't parse — preserve it
    // (raw text in `reasoning`) rather than silently discarding it.
    return {
      recommendation: null,
      confidence: null,
      probabilities: null,
      supportedHorizons: null,
      reasoning: text,
      riskFactors: null,
      parseError: err instanceof Error ? err.message : "JSON parse failed",
    };
  }
}

/**
 * Runs both independent blind analyses for one security within one frozen
 * PMNTX Core research run. Never overwrites an existing frozen
 * blind_analyses row — if a prior partial run already froze one provider's
 * result, only the missing one is attempted.
 */
export async function runBlindAnalysisForSecurity(
  researchRunId: string,
  securityId: string
): Promise<BlindAnalysisSecurityResult> {
  const supabase = createServiceRoleClient();

  const { data: run } = await supabase.from("research_runs").select("frozen_at").eq("id", researchRunId).single();
  if (!run?.frozen_at) {
    throw new Error(
      `Cannot run blind analysis: research_run ${researchRunId} is not frozen yet (independence firewall) — ` +
        `${BRAND_SUBSYSTEM_NAMES.core} must freeze its ranking before any analysis reads it.`
    );
  }

  const { data: existingFrozen } = await supabase
    .from("blind_analyses")
    .select("provider_code")
    .eq("research_run_id", researchRunId)
    .eq("security_id", securityId)
    .not("frozen_at", "is", null);
  const frozenProviderCodes = new Set((existingFrozen ?? []).map((r) => r.provider_code));

  // Built once, reused for both providers — research-packet reuse, and the
  // reason neither blind analyst gets a differently-shaped view of the facts.
  const packet = await buildAnonymizedPacket(securityId, researchRunId);
  const packetJson = JSON.stringify(packet);

  const results: BlindAnalysisRoleResult[] = [];

  for (const role of BLIND_ROLES) {
    const routeInfo = await resolveAiRoute(role);
    if (!routeInfo.ok) {
      results.push({ role, status: "NOT_CONFIGURED", message: routeInfo.message });
      continue;
    }

    if (frozenProviderCodes.has(routeInfo.route.providerCode)) {
      results.push({
        role,
        status: "ALREADY_EXISTS",
        message: `A frozen blind analysis from ${routeInfo.route.providerCode} already exists for this run — never overwritten.`,
      });
      continue;
    }

    const promptVersion = await getActivePromptVersion(role);
    if (!promptVersion) {
      results.push({ role, status: "NOT_CONFIGURED", message: `No active prompt_version for role "${role}".` });
      continue;
    }

    const fingerprint = computeRequestFingerprint([role, securityId, researchRunId, packetJson, promptVersion.id]);

    const gatewayResult = await requestAiCompletion({
      role,
      request: {
        system: promptVersion.content,
        messages: [{ role: "user", content: `Research packet:\n${packetJson}` }],
        maxTokens: MAX_OUTPUT_TOKENS,
      },
      context: { researchRunId, securityId, workflowId: `blind_analysis:${researchRunId}` },
      fingerprint,
      promptVersionId: promptVersion.id,
    });

    if (gatewayResult.status === "NOT_CONFIGURED") {
      results.push({ role, status: "NOT_CONFIGURED", message: gatewayResult.message });
      continue;
    }
    if (gatewayResult.status === "BLOCKED") {
      results.push({ role, status: "BLOCKED", message: gatewayResult.message });
      continue;
    }
    if (gatewayResult.status === "DUPLICATE") {
      results.push({ role, status: "DUPLICATE", message: "Materially identical request already executed in this research run." });
      continue;
    }

    const parsed = parseBlindResponse(gatewayResult.result.text);

    const { data: inserted, error: insertError } = await supabase
      .from("blind_analyses")
      .insert({
        security_id: securityId,
        research_run_id: researchRunId,
        ai_execution_id: gatewayResult.aiExecutionId,
        provider_code: routeInfo.route.providerCode,
        model_code: routeInfo.route.modelCode,
        prompt_version_id: promptVersion.id,
        anonymized_packet: packet,
        recommendation: parsed.recommendation,
        probabilities: parsed.probabilities,
        reasoning: parsed.reasoning,
        risk_factors: parsed.riskFactors,
        forecast_horizons_supported: parsed.supportedHorizons,
        confidence: parsed.confidence,
        frozen_at: new Date().toISOString(), // frozen immediately — blind results are never revised in place
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to record blind_analyses row: ${insertError?.message}`);
    }

    results.push({
      role,
      status: parsed.parseError ? "PARSE_ERROR" : "FROZEN",
      blindAnalysisId: inserted.id,
      message: parsed.parseError,
    });
  }

  return { securityId, results };
}

export type BlindAnalysisRunResult = {
  researchRunId: string;
  securities: BlindAnalysisSecurityResult[];
};

/** Runs blind analysis for every selected (top-ranked) candidate from a frozen PMNTX Core research run. */
export async function runBlindAnalysisForResearchRun(researchRunId: string): Promise<BlindAnalysisRunResult> {
  const supabase = createServiceRoleClient();

  const { data: candidates } = await supabase
    .from("candidate_rankings")
    .select("security_id")
    .eq("research_run_id", researchRunId)
    .eq("selected", true);

  const securities: BlindAnalysisSecurityResult[] = [];
  for (const candidate of candidates ?? []) {
    securities.push(await runBlindAnalysisForSecurity(researchRunId, candidate.security_id));
  }

  return { researchRunId, securities };
}
