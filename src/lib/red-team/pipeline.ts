import "server-only";

import { getActivePromptVersion } from "@/lib/blind-analysis/prompt";
import { computeRequestFingerprint, requestAiCompletion } from "@/lib/ai/gateway";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RedTeamSeverity = "LOW" | "MEDIUM" | "HIGH";
type RedTeamFinding = { category: string; concern: string; severity: RedTeamSeverity };

const VALID_SEVERITIES: RedTeamSeverity[] = ["LOW", "MEDIUM", "HIGH"];

type ParsedRedTeamResponse = {
  findings: RedTeamFinding[];
  severity: RedTeamSeverity | null;
  summary: string | null;
  parseError?: string;
};

function parseRedTeamResponse(text: string): ParsedRedTeamResponse {
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) jsonText = fenceMatch[1];

  try {
    const parsed = JSON.parse(jsonText);
    const findings: RedTeamFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings
          .filter(
            (f: unknown): f is RedTeamFinding =>
              typeof f === "object" &&
              f !== null &&
              typeof (f as Record<string, unknown>).category === "string" &&
              typeof (f as Record<string, unknown>).concern === "string" &&
              VALID_SEVERITIES.includes((f as Record<string, unknown>).severity as RedTeamSeverity)
          )
          .map((f: RedTeamFinding) => ({ category: f.category, concern: f.concern, severity: f.severity }))
      : [];
    const severity = VALID_SEVERITIES.includes(parsed.severity) ? (parsed.severity as RedTeamSeverity) : null;
    return {
      findings,
      severity,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
    };
  } catch (err) {
    return { findings: [], severity: null, summary: text, parseError: err instanceof Error ? err.message : "JSON parse failed" };
  }
}

export type RedTeamResult = {
  predictionId: string;
  status: "REVIEWED" | "ALREADY_EXISTS" | "NOT_CONFIGURED" | "BLOCKED";
  reviewId?: string;
  message?: string;
};

/**
 * Challenges one already-frozen prediction: material risks, contrary
 * evidence, invalidation conditions. Purely additive — never touches the
 * prediction it reviews. Bounded and basic per the Phase 1A scope lock:
 * one AI call per prediction, no follow-up debate/rebuttal loop.
 */
export async function runRedTeamReview(predictionId: string): Promise<RedTeamResult> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("red_team_reviews")
    .select("id")
    .eq("prediction_id", predictionId)
    .maybeSingle();
  if (existing) return { predictionId, status: "ALREADY_EXISTS", reviewId: existing.id };

  const { data: prediction } = await supabase
    .from("predictions")
    .select("security_id, direction, score, thesis, risks, frozen_at, origin")
    .eq("id", predictionId)
    .single();
  if (!prediction?.frozen_at) {
    throw new Error(`Cannot red-team prediction ${predictionId}: it is not frozen yet.`);
  }

  const promptVersion = await getActivePromptVersion("RED_TEAM");
  if (!promptVersion) {
    return { predictionId, status: "NOT_CONFIGURED", message: `No active prompt_version for role "RED_TEAM".` };
  }

  const { data: security } = await supabase.from("securities").select("ticker, name").eq("id", prediction.security_id).single();
  const promptInput = JSON.stringify({
    company: `${security?.name ?? "unknown"} (${security?.ticker ?? "unknown"})`,
    origin: prediction.origin,
    direction: prediction.direction,
    score: prediction.score,
    thesis: prediction.thesis,
    risksAlreadyNoted: prediction.risks,
  });

  const fingerprint = computeRequestFingerprint(["RED_TEAM", predictionId, promptVersion.id]);
  const gatewayResult = await requestAiCompletion({
    role: "RED_TEAM",
    request: {
      system: promptVersion.content,
      messages: [{ role: "user", content: promptInput }],
      maxTokens: 600,
    },
    context: { securityId: prediction.security_id, workflowId: `red_team:${predictionId}` },
    fingerprint,
    promptVersionId: promptVersion.id,
  });

  if (gatewayResult.status === "NOT_CONFIGURED") return { predictionId, status: "NOT_CONFIGURED", message: gatewayResult.message };
  if (gatewayResult.status === "BLOCKED") return { predictionId, status: "BLOCKED", message: gatewayResult.message };
  if (gatewayResult.status === "DUPLICATE") return { predictionId, status: "ALREADY_EXISTS", message: "Duplicate request suppressed." };

  const parsed = parseRedTeamResponse(gatewayResult.result.text);

  const { data: inserted, error } = await supabase
    .from("red_team_reviews")
    .insert({
      prediction_id: predictionId,
      ai_execution_id: gatewayResult.aiExecutionId,
      findings: parsed.findings,
      concerns: parsed.findings.map((f) => f.concern),
      severity: parsed.severity,
      summary: parsed.summary,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(`Failed to record red_team_reviews row: ${error?.message}`);

  return { predictionId, status: "REVIEWED", reviewId: inserted.id };
}

/** Runs Red Team review for every frozen prediction on a given research_run (Core or agent). */
export async function runRedTeamForResearchRun(researchRunId: string): Promise<RedTeamResult[]> {
  const supabase = createServiceRoleClient();
  const { data: predictions } = await supabase
    .from("predictions")
    .select("id")
    .eq("research_run_id", researchRunId)
    .not("frozen_at", "is", null);

  const results: RedTeamResult[] = [];
  for (const prediction of predictions ?? []) {
    results.push(await runRedTeamReview(prediction.id));
  }
  return results;
}
