import "server-only";

import { getDecryptedCredential } from "@/lib/credentials/store";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IntegrationService } from "@/lib/supabase/types";

import { completeWithAnthropic } from "./providers/anthropic";
import { completeWithOpenAI } from "./providers/openai";
import type { AiRole } from "./types";

export const AI_ADAPTERS: Record<string, typeof completeWithAnthropic | typeof completeWithOpenAI> = {
  ANTHROPIC: completeWithAnthropic,
  OPENAI: completeWithOpenAI,
};

export type ResolvedAiRoute = {
  routeId: string;
  aiModelId: string;
  modelCode: string;
  providerCode: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  adapter: typeof completeWithAnthropic | typeof completeWithOpenAI;
  apiKey: string;
};

export type RouteResolutionFailure =
  | { ok: false; reason: "NO_ROUTE" | "NO_MODEL" | "PROVIDER_DISABLED" | "NO_ADAPTER" | "NO_CREDENTIAL"; message: string };

/**
 * Resolves a role (e.g. "AGENT_BUFFETT") to its configured provider/model
 * via ai_routes and decrypts that provider's credential. This is
 * gateway-internal — application code must never call a provider adapter
 * or this resolver directly; go through src/lib/ai/gateway.ts, which is
 * the only place ai_executions gets written and budget limits are
 * enforced. Swapping a role's model is an ai_routes UPDATE, not a code
 * change (brief §9) — that's the point of keeping this resolution generic.
 */
export async function resolveAiRoute(
  role: AiRole
): Promise<{ ok: true; route: ResolvedAiRoute } | RouteResolutionFailure> {
  const supabase = createServiceRoleClient();

  const { data: route } = await supabase
    .from("ai_routes")
    .select("id, ai_model_id")
    .eq("role_code", role)
    .single();
  if (!route) {
    return { ok: false, reason: "NO_ROUTE", message: `No AI route configured for role "${role}".` };
  }

  const { data: model } = await supabase
    .from("ai_models")
    .select("model_code, ai_provider_id, cost_input_per_million, cost_output_per_million")
    .eq("id", route.ai_model_id)
    .single();
  if (!model) {
    return { ok: false, reason: "NO_MODEL", message: `ai_routes references a missing ai_models row (role "${role}").` };
  }

  const { data: provider } = await supabase
    .from("ai_providers")
    .select("code, is_enabled")
    .eq("id", model.ai_provider_id)
    .single();
  if (!provider || !provider.is_enabled) {
    return {
      ok: false,
      reason: "PROVIDER_DISABLED",
      message: `Provider for role "${role}" is disabled. Enable it in ai_providers or Admin → System.`,
    };
  }

  const adapter = AI_ADAPTERS[provider.code];
  if (!adapter) {
    return { ok: false, reason: "NO_ADAPTER", message: `No adapter implemented for provider "${provider.code}".` };
  }

  const apiKey = await getDecryptedCredential(provider.code as IntegrationService);
  if (!apiKey) {
    return {
      ok: false,
      reason: "NO_CREDENTIAL",
      message: `No credential configured for ${provider.code}. Configure it in Admin → System → Integrations.`,
    };
  }

  return {
    ok: true,
    route: {
      routeId: route.id,
      aiModelId: route.ai_model_id,
      modelCode: model.model_code,
      providerCode: provider.code,
      costInputPerMillion: Number(model.cost_input_per_million ?? 0),
      costOutputPerMillion: Number(model.cost_output_per_million ?? 0),
      adapter,
      apiKey,
    },
  };
}
