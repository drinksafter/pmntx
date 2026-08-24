import "server-only";

import { buildAnonymizedPacket } from "@/lib/blind-analysis/packet";
import { getActivePromptVersion } from "@/lib/blind-analysis/prompt";
import { computeRequestFingerprint, requestAiCompletion } from "@/lib/ai/gateway";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IdeaDirection } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

// A same-direction agreement with Core's own independent view; below this
// magnitude on an agent-only pick (no Core corroboration available) isn't
// approved. A starting threshold, not calibrated — same caveat as
// src/lib/pmntx-core/scoring.ts and src/lib/hunters/*.
const APPROVAL_SCORE_THRESHOLD = 0.3;

function parseEvidence(text: string): { evidenceDiscovered: string | null; parseError?: string } {
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) jsonText = fenceMatch[1];
  try {
    const parsed = JSON.parse(jsonText);
    return { evidenceDiscovered: typeof parsed.evidence_discovered === "string" ? parsed.evidence_discovered : null };
  } catch (err) {
    return { evidenceDiscovered: text, parseError: err instanceof Error ? err.message : "JSON parse failed" };
  }
}

export type AgentSelectionResult = {
  agentDailyListId: string;
  status: "SELECTED" | "ALREADY_EXISTS";
  selectionId?: string;
  approved?: boolean;
  hadAiEvidence?: boolean;
};

/**
 * PMNTX's own secondary evaluation of one frozen agent pick — distinct
 * from both PMNTX Core's own independent ranking and the agent's own
 * frozen list (docs/PHASE_1A_SCOPE_LOCK.md §1's four-way distinction:
 * Core's picks, each agent's picks, PMNTX's selections from agent picks,
 * and Meta's conclusions). Approval and pmntx_secondary_score are always
 * computed deterministically from Core's own same-day view of the same
 * security, if one exists — "deterministic behavior where AI is not
 * required" is preserved for the gating decision itself. AI (when
 * configured) only adds a supporting evidence_discovered narrative on
 * top; it never overrides the deterministic approval.
 *
 * Never touches the agent_daily_lists row it's evaluating — this is a
 * pure read of an already-frozen record, never a rewrite of it.
 */
export async function selectAgentPick(agentDailyListId: string): Promise<AgentSelectionResult> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("pmntx_agent_selections")
    .select("id, approved")
    .eq("agent_daily_list_id", agentDailyListId)
    .maybeSingle();
  if (existing) {
    return { agentDailyListId, status: "ALREADY_EXISTS", selectionId: existing.id, approved: existing.approved };
  }

  const { data: listing } = await supabase
    .from("agent_daily_lists")
    .select("security_id, direction, agent_score, rank, frozen_at, agent_run_id")
    .eq("id", agentDailyListId)
    .single();
  if (!listing?.frozen_at) {
    throw new Error(`agent_daily_lists row ${agentDailyListId} is not frozen — independence firewall.`);
  }

  const { data: agentRun } = await supabase
    .from("agent_runs")
    .select("research_run_id")
    .eq("id", listing.agent_run_id)
    .single();
  const { data: agentResearchRun } = await supabase
    .from("research_runs")
    .select("run_date")
    .eq("id", agentRun!.research_run_id)
    .single();

  const { data: coreRun } = await supabase
    .from("research_runs")
    .select("id")
    .eq("run_date", agentResearchRun!.run_date)
    .eq("origin_type", "PMNTX_CORE")
    .not("frozen_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let coreRanking: { rank: number | null; score: number; direction: IdeaDirection | null } | null = null;
  if (coreRun) {
    const { data } = await supabase
      .from("candidate_rankings")
      .select("rank, score, direction")
      .eq("research_run_id", coreRun.id)
      .eq("security_id", listing.security_id)
      .maybeSingle();
    coreRanking = data;
  }

  const agentScore = Number(listing.agent_score ?? 0);
  let secondaryScore = agentScore;
  let approved: boolean;
  if (coreRanking) {
    const sameDirection = coreRanking.direction === listing.direction;
    secondaryScore = sameDirection ? (agentScore + Number(coreRanking.score)) / 2 : agentScore * 0.5;
    approved = sameDirection;
  } else {
    approved = Math.abs(agentScore) >= APPROVAL_SCORE_THRESHOLD;
  }

  let evidenceDiscovered: string | null = null;
  let aiExecutionId: string | null = null;
  const promptVersion = await getActivePromptVersion("PMNTX_AGENT_SELECTION");
  if (promptVersion) {
    const packet = await buildAnonymizedPacket(listing.security_id, coreRun?.id ?? agentRun!.research_run_id);
    const { data: security } = await supabase.from("securities").select("ticker, name").eq("id", listing.security_id).single();
    const packetJson = JSON.stringify(packet);
    const fingerprint = computeRequestFingerprint(["PMNTX_AGENT_SELECTION", agentDailyListId, packetJson, promptVersion.id]);

    const gatewayResult = await requestAiCompletion({
      role: "PMNTX_AGENT_SELECTION",
      request: {
        system: promptVersion.content,
        messages: [
          {
            role: "user",
            content:
              `Company: ${security?.name ?? "unknown"} (${security?.ticker ?? "unknown"})\n\n` +
              `Agent's frozen view: direction=${listing.direction}, score=${agentScore}\n` +
              `PMNTX Core's own view: ${coreRanking ? `direction=${coreRanking.direction}, score=${coreRanking.score}` : "Core did not independently rank this security"}\n\n` +
              `Research packet:\n${packetJson}`,
          },
        ],
        maxTokens: 400,
      },
      context: { researchRunId: agentRun!.research_run_id, securityId: listing.security_id, workflowId: `agent_selection:${agentRun!.research_run_id}` },
      fingerprint,
      promptVersionId: promptVersion.id,
    });

    if (gatewayResult.status === "OK") {
      const parsed = parseEvidence(gatewayResult.result.text);
      evidenceDiscovered = parsed.evidenceDiscovered;
      aiExecutionId = gatewayResult.aiExecutionId;
    }
    // NOT_CONFIGURED / BLOCKED / DUPLICATE: evidenceDiscovered stays null.
    // approved/secondaryScore were already computed above — unaffected.
  }

  const { data: inserted, error } = await supabase
    .from("pmntx_agent_selections")
    .insert({
      agent_daily_list_id: agentDailyListId,
      original_agent_rank: listing.rank,
      original_agent_score: listing.agent_score,
      pmntx_original_rank: coreRanking?.rank ?? null,
      pmntx_original_score: coreRanking?.score ?? null,
      pmntx_secondary_score: secondaryScore,
      pmntx_secondary_recommendation: approved ? listing.direction : "WATCH",
      evidence_discovered: evidenceDiscovered,
      approved,
      ai_execution_id: aiExecutionId,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(`Failed to record pmntx_agent_selections row: ${error?.message}`);

  return { agentDailyListId, status: "SELECTED", selectionId: inserted.id, approved, hadAiEvidence: !!evidenceDiscovered };
}

/** Evaluates every frozen listing from one agent_run. */
export async function selectAgentPicksForAgentRun(agentRunId: string): Promise<AgentSelectionResult[]> {
  const supabase: SupabaseClient = createServiceRoleClient();

  const { data: listings } = await supabase
    .from("agent_daily_lists")
    .select("id")
    .eq("agent_run_id", agentRunId)
    .not("frozen_at", "is", null);

  const results: AgentSelectionResult[] = [];
  for (const listing of listings ?? []) {
    results.push(await selectAgentPick(listing.id));
  }
  return results;
}
