// role_code values Phase 1A actually calls — see supabase/migrations/018_ai_model_pricing.sql
// for the seeded route → model → provider mapping. Adding a role requires a
// matching row in ai_routes (via SQL or a future Admin → AI Routing page).
export type AiRole =
  | "BLIND_ANALYST"
  | "INDEPENDENT_BLIND_ANALYST"
  | "REVEALED_ANALYST"
  | "RED_TEAM"
  | "AGENT_BUFFETT"
  | "AGENT_GERSTNER"
  | "PMNTX_AGENT_SELECTION";

export type AiCompletionRequest = {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
};

export type AiCompletionResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
};

/** Every concrete provider adapter (Anthropic, OpenAI, ...) implements this shape. */
export type AiProviderAdapter = (
  modelCode: string,
  request: AiCompletionRequest,
  apiKey: string
) => Promise<AiCompletionResult>;
