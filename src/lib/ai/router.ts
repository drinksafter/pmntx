import "server-only";

import { getDecryptedCredential } from "@/lib/credentials/store";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IntegrationService } from "@/lib/supabase/types";

import { completeWithAnthropic } from "./providers/anthropic";
import { completeWithOpenAI } from "./providers/openai";
import type { AiCompletionRequest, AiCompletionResult, AiRole } from "./types";

const ADAPTERS: Record<string, typeof completeWithAnthropic | typeof completeWithOpenAI> = {
  ANTHROPIC: completeWithAnthropic,
  OPENAI: completeWithOpenAI,
};

/**
 * Resolves a role (e.g. "AGENT_BUFFETT") to its configured provider/model
 * via ai_routes, calls that provider, and records the call in
 * ai_executions — the audit trail every AI call in PMNTX is required to
 * have (tokens, cost, latency, prompt version). Never call a provider SDK
 * directly outside this module; that's the whole point of the abstraction
 * (brief §9) — swapping a role's model is an ai_routes UPDATE, not a
 * code change.
 */
export async function runAiRole(
  role: AiRole,
  request: AiCompletionRequest
): Promise<AiCompletionResult> {
  const supabase = createServiceRoleClient();

  const { data: route } = await supabase
    .from("ai_routes")
    .select("id, ai_model_id")
    .eq("role_code", role)
    .single();

  if (!route) {
    throw new Error(
      `No AI route configured for role "${role}". Add a row to ai_routes ` +
        `(see supabase/migrations/018_ai_model_pricing.sql).`
    );
  }

  const { data: model } = await supabase
    .from("ai_models")
    .select("model_code, ai_provider_id, cost_input_per_million, cost_output_per_million")
    .eq("id", route.ai_model_id)
    .single();

  if (!model) {
    throw new Error(`ai_routes references a missing ai_models row (role "${role}").`);
  }

  const { data: provider } = await supabase
    .from("ai_providers")
    .select("code, is_enabled")
    .eq("id", model.ai_provider_id)
    .single();

  if (!provider || !provider.is_enabled) {
    throw new Error(
      `Provider for role "${role}" is disabled. Enable it in ai_providers or Admin → System.`
    );
  }

  const adapter = ADAPTERS[provider.code];
  if (!adapter) {
    throw new Error(`No adapter implemented for provider "${provider.code}".`);
  }

  const apiKey = await getDecryptedCredential(provider.code as IntegrationService);
  if (!apiKey) {
    throw new Error(
      `No credential configured for ${provider.code}. Configure it in Admin → System → Integrations.`
    );
  }

  try {
    const result = await adapter(model.model_code, request, apiKey);

    const estimatedCostUsd =
      (result.tokensInput / 1_000_000) * Number(model.cost_input_per_million ?? 0) +
      (result.tokensOutput / 1_000_000) * Number(model.cost_output_per_million ?? 0);

    await supabase.from("ai_executions").insert({
      ai_route_id: route.id,
      ai_model_id: route.ai_model_id,
      role_code: role,
      output: { text: result.text },
      tokens_input: result.tokensInput,
      tokens_output: result.tokensOutput,
      estimated_cost_usd: estimatedCostUsd,
      latency_ms: result.latencyMs,
      status: "SUCCEEDED",
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown AI provider error.";
    await supabase.from("ai_executions").insert({
      ai_route_id: route.id,
      ai_model_id: route.ai_model_id,
      role_code: role,
      status: "FAILED",
      error_message: errorMessage,
    });
    throw err;
  }
}
