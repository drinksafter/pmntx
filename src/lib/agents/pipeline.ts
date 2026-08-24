import "server-only";

import { buildAnonymizedPacket } from "@/lib/blind-analysis/packet";
import { computeRequestFingerprint, requestAiCompletion } from "@/lib/ai/gateway";
import type { AiRole } from "@/lib/ai/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IdeaDirection, IdeaOrigin } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

// A value in this set is simultaneously a valid AiRole (routing) and a
// valid IdeaOrigin (Prediction Warehouse attribution) by design — the two
// enums share these two literal strings on purpose.
type AgentRole = Extract<AiRole, "AGENT_BUFFETT" | "AGENT_GERSTNER"> & Extract<IdeaOrigin, "AGENT_BUFFETT" | "AGENT_GERSTNER">;

// idea_origin and AiRole share the same string values for agents by
// design (AGENT_BUFFETT / AGENT_GERSTNER) — this maps the DB's
// agents.internal_name (BUFFETT_AGENT) to that shared value.
const AGENT_ROLE_BY_INTERNAL_NAME: Record<string, AgentRole> = {
  BUFFETT_AGENT: "AGENT_BUFFETT",
  GERSTNER_AGENT: "AGENT_GERSTNER",
};

const VALID_DIRECTIONS: IdeaDirection[] = ["LONG", "SHORT", "WATCH", "PASS"];
const MAX_OUTPUT_TOKENS = 900;
const PREDICTION_HORIZON = "D63"; // agent theses skew medium-term; see the same caveat in src/lib/pmntx-core/predictions.ts

type ParsedAgentResponse = {
  direction: IdeaDirection | null;
  agentScore: number | null;
  probability: number | null;
  thesis: string | null;
  catalyst: string | null;
  risks: string | null;
  invalidationCriteria: string | null;
  bestHorizonLabel: string | null;
  discoveryReason: string | null;
  dataQuality: number | null;
  parseError?: string;
};

function parseAgentResponse(text: string): ParsedAgentResponse {
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) jsonText = fenceMatch[1];

  try {
    const parsed = JSON.parse(jsonText);
    const direction =
      typeof parsed.direction === "string" && VALID_DIRECTIONS.includes(parsed.direction as IdeaDirection)
        ? (parsed.direction as IdeaDirection)
        : null;
    return {
      direction,
      agentScore: typeof parsed.agent_score === "number" ? parsed.agent_score : null,
      probability: typeof parsed.probability === "number" ? parsed.probability : null,
      thesis: typeof parsed.thesis === "string" ? parsed.thesis : null,
      catalyst: typeof parsed.catalyst === "string" ? parsed.catalyst : null,
      risks: typeof parsed.risks === "string" ? parsed.risks : null,
      invalidationCriteria: typeof parsed.invalidation_criteria === "string" ? parsed.invalidation_criteria : null,
      bestHorizonLabel: typeof parsed.best_horizon_label === "string" ? parsed.best_horizon_label : null,
      discoveryReason: typeof parsed.discovery_reason === "string" ? parsed.discovery_reason : null,
      dataQuality: typeof parsed.data_quality === "number" ? parsed.data_quality : null,
    };
  } catch (err) {
    return {
      direction: null,
      agentScore: null,
      probability: null,
      thesis: text,
      catalyst: null,
      risks: null,
      invalidationCriteria: null,
      bestHorizonLabel: null,
      discoveryReason: null,
      dataQuality: null,
      parseError: err instanceof Error ? err.message : "JSON parse failed",
    };
  }
}

/** Reuses (or creates) this agent's one research_run for a given day — re-invoking the pipeline never spawns a second parallel run. */
async function findOrCreateAgentResearchRun(
  supabase: SupabaseClient,
  agentVersionId: string,
  runDate: string
): Promise<{ researchRunId: string; agentRunId: string; alreadyFrozen: boolean }> {
  const { data: sameDayRuns } = await supabase
    .from("research_runs")
    .select("id, frozen_at")
    .eq("run_date", runDate)
    .eq("origin_type", "AGENT");
  const sameDayRunIds = (sameDayRuns ?? []).map((r) => r.id);

  if (sameDayRunIds.length > 0) {
    const { data: existing } = await supabase
      .from("agent_runs")
      .select("id, research_run_id")
      .eq("agent_version_id", agentVersionId)
      .in("research_run_id", sameDayRunIds)
      .maybeSingle();
    if (existing) {
      const run = sameDayRuns!.find((r) => r.id === existing.research_run_id);
      return { researchRunId: existing.research_run_id, agentRunId: existing.id, alreadyFrozen: !!run?.frozen_at };
    }
  }

  const { data: newRun, error: newRunError } = await supabase
    .from("research_runs")
    .insert({ run_date: runDate, origin_type: "AGENT", status: "RUNNING", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (newRunError || !newRun) throw new Error(`Failed to create agent research_run: ${newRunError?.message}`);

  const { data: newAgentRun, error: newAgentRunError } = await supabase
    .from("agent_runs")
    .insert({ agent_version_id: agentVersionId, research_run_id: newRun.id, status: "RUNNING", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (newAgentRunError || !newAgentRun) throw new Error(`Failed to create agent_run: ${newAgentRunError?.message}`);

  return { researchRunId: newRun.id, agentRunId: newAgentRun.id, alreadyFrozen: false };
}

/** Mirrors src/lib/pmntx-core/predictions.ts, sourced from this agent's own listing rather than candidate_rankings. */
async function freezeAgentPrediction(
  supabase: SupabaseClient,
  role: AgentRole,
  agentId: string,
  agentResearchRunId: string,
  securityId: string,
  direction: IdeaDirection,
  parsed: ParsedAgentResponse,
  aiExecutionId: string
): Promise<void> {
  const { data: latestPrice } = await supabase
    .from("market_prices")
    .select("close, price_date")
    .eq("security_id", securityId)
    .order("price_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestPrice) return; // no reference price — same honest skip as PMNTX Core's prediction freezing

  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .insert({ security_id: securityId, origin: role, research_run_id: agentResearchRunId, direction })
    .select("id")
    .single();
  if (ideaError || !idea) throw new Error(`Failed to create agent idea: ${ideaError?.message}`);

  const now = new Date().toISOString();
  const { data: prediction, error: predictionError } = await supabase
    .from("predictions")
    .insert({
      idea_id: idea.id,
      security_id: securityId,
      origin: role,
      research_run_id: agentResearchRunId,
      agent_id: agentId,
      data_cutoff: now,
      reference_price: latestPrice.close,
      reference_price_at: new Date(latestPrice.price_date).toISOString(),
      direction,
      score: parsed.agentScore,
      score_version: "v1",
      thesis: parsed.thesis,
      catalysts: parsed.catalyst,
      risks: parsed.risks,
      invalidation_criteria: parsed.invalidationCriteria,
      best_horizon_label: parsed.bestHorizonLabel,
      ai_execution_id: aiExecutionId,
      frozen_at: now,
    })
    .select("id")
    .single();
  if (predictionError || !prediction) throw new Error(`Failed to create agent prediction: ${predictionError?.message}`);

  const { error: horizonError } = await supabase.from("prediction_horizons").insert({
    prediction_id: prediction.id,
    horizon: PREDICTION_HORIZON,
    forecast_type: "FORECAST",
    probability_positive: parsed.probability,
    confidence: parsed.dataQuality,
  });
  if (horizonError) throw new Error(`Failed to create agent prediction_horizons: ${horizonError.message}`);
}

export type AgentRunSummary = {
  agentInternalName: string;
  agentResearchRunId: string;
  agentRunId: string;
  candidateCount: number;
  listed: number;
  skipped: number;
  alreadyFrozen: boolean;
};

/**
 * Runs one Phase 1A agent (BUFFETT_AGENT or GERSTNER_AGENT) against
 * PMNTX Core's most recent frozen candidates for a date — the
 * independence firewall this enforces: an agent may only ever read
 * Core's FROZEN output, never a run still in progress. Each agent writes
 * to its OWN research_run/agent_run (never Core's), and every listing
 * both freezes into agent_daily_lists and (when a reference price exists)
 * a matching Prediction Warehouse entry, origin-tagged to this agent.
 */
export async function runAgentForDate(agentInternalName: string, runDate: string): Promise<AgentRunSummary> {
  const supabase = createServiceRoleClient();
  const role = AGENT_ROLE_BY_INTERNAL_NAME[agentInternalName];
  if (!role) throw new Error(`Unknown agent internal_name "${agentInternalName}".`);

  const { data: agent } = await supabase
    .from("agents")
    .select("id, is_active")
    .eq("internal_name", agentInternalName)
    .single();
  if (!agent || !agent.is_active) throw new Error(`Agent "${agentInternalName}" is not active for Phase 1A.`);

  const { data: agentVersion } = await supabase
    .from("agent_versions")
    .select("id, system_prompt")
    .eq("agent_id", agent.id)
    .not("activated_at", "is", null)
    .is("retired_at", null)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!agentVersion) throw new Error(`No active agent_version for "${agentInternalName}" — see supabase/migrations/023_agent_prompts.sql.`);

  const { data: coreRun } = await supabase
    .from("research_runs")
    .select("id")
    .eq("run_date", runDate)
    .eq("origin_type", "PMNTX_CORE")
    .not("frozen_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!coreRun) {
    throw new Error(
      `No frozen PMNTX Core research_run for ${runDate} — independence firewall: agents may only read Core's frozen output.`
    );
  }

  const { researchRunId: agentResearchRunId, agentRunId, alreadyFrozen } = await findOrCreateAgentResearchRun(
    supabase,
    agentVersion.id,
    runDate
  );

  const { data: candidates } = await supabase
    .from("candidate_rankings")
    .select("security_id")
    .eq("research_run_id", coreRun.id)
    .eq("selected", true);
  const candidateList = candidates ?? [];

  if (alreadyFrozen) {
    return {
      agentInternalName,
      agentResearchRunId,
      agentRunId,
      candidateCount: candidateList.length,
      listed: 0,
      skipped: 0,
      alreadyFrozen: true,
    };
  }

  const { data: existingListings } = await supabase
    .from("agent_daily_lists")
    .select("security_id")
    .eq("agent_run_id", agentRunId);
  const alreadyListedSecurityIds = new Set((existingListings ?? []).map((l) => l.security_id));

  let listed = 0;
  let skipped = 0;

  for (const candidate of candidateList) {
    if (alreadyListedSecurityIds.has(candidate.security_id)) {
      listed++;
      continue;
    }

    const packet = await buildAnonymizedPacket(candidate.security_id, coreRun.id);
    const { data: security } = await supabase
      .from("securities")
      .select("ticker, name")
      .eq("id", candidate.security_id)
      .single();
    const packetJson = JSON.stringify(packet);
    const fingerprint = computeRequestFingerprint([role, candidate.security_id, agentResearchRunId, packetJson, agentVersion.id]);

    const gatewayResult = await requestAiCompletion({
      role,
      request: {
        system: agentVersion.system_prompt,
        messages: [
          {
            role: "user",
            content: `Company: ${security?.name ?? "unknown"} (${security?.ticker ?? "unknown"})\n\nResearch packet:\n${packetJson}`,
          },
        ],
        maxTokens: MAX_OUTPUT_TOKENS,
      },
      context: { researchRunId: agentResearchRunId, agentId: agent.id, securityId: candidate.security_id, workflowId: `agent_run:${agentResearchRunId}` },
      fingerprint,
    });

    if (gatewayResult.status !== "OK") {
      skipped++; // NOT_CONFIGURED / BLOCKED / DUPLICATE — no listing, no fabrication
      continue;
    }

    const parsed = parseAgentResponse(gatewayResult.result.text);
    const direction = parsed.direction ?? "PASS"; // agent_daily_lists.direction is NOT NULL; an unparseable response defaults to PASS, not a guess

    const { error: listingError } = await supabase.from("agent_daily_lists").insert({
      agent_run_id: agentRunId,
      security_id: candidate.security_id,
      direction,
      agent_score: parsed.agentScore,
      probability: parsed.probability,
      thesis: parsed.thesis,
      catalyst: parsed.catalyst,
      risks: parsed.risks,
      invalidation_criteria: parsed.invalidationCriteria,
      best_horizon_label: parsed.bestHorizonLabel,
      discovery_reason: parsed.discoveryReason,
      data_quality: parsed.dataQuality,
    });
    if (listingError) throw new Error(`Failed to record agent_daily_lists row: ${listingError.message}`);

    await freezeAgentPrediction(supabase, role, agent.id, agentResearchRunId, candidate.security_id, direction, parsed, gatewayResult.aiExecutionId);

    listed++;
  }

  const now = new Date().toISOString();
  await supabase.from("agent_daily_lists").update({ frozen_at: now }).eq("agent_run_id", agentRunId).is("frozen_at", null);
  await supabase
    .from("research_runs")
    .update({ status: skipped > 0 ? "PARTIAL" : "SUCCEEDED", completed_at: now, frozen_at: now })
    .eq("id", agentResearchRunId);
  await supabase
    .from("agent_runs")
    .update({ status: skipped > 0 ? "PARTIAL" : "SUCCEEDED", completed_at: now })
    .eq("id", agentRunId);

  return { agentInternalName, agentResearchRunId, agentRunId, candidateCount: candidateList.length, listed, skipped, alreadyFrozen: false };
}
