/**
 * Hand-authored Supabase Database types, covering only the tables the
 * application code actually queries so far — kept in sync with
 * supabase/migrations/*.sql as each new area is built, not a full mirror
 * of the schema. Once a live Supabase project exists, regenerate
 * authoritatively with:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * (then re-apply this file's header comment — the generator overwrites it).
 * Until then, this file is the best-effort source of truth for TypeScript,
 * and supabase/migrations/*.sql is the actual source of truth for the
 * database.
 */

export type UserRole = "ADMIN" | "USER";

export type IntegrationService =
  | "QUIVER"
  | "MARKET_DATA"
  | "SEC_EDGAR"
  | "FRED"
  | "OPENAI"
  | "ANTHROPIC"
  | "TELNYX";

export type IntegrationHealthStatus = "NOT_CONFIGURED" | "OK" | "DEGRADED" | "ERROR";

export type AiExecutionStatus = "SUCCEEDED" | "FAILED";

export type SecurityType = "EQUITY" | "ETF" | "ADR" | "OTHER";

export type IngestionStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";
export type IngestionTrigger = "SCHEDULED" | "MANUAL";

export type SignalDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export type ResearchRunOrigin = "PMNTX_CORE" | "AGENT" | "MODEL";
export type ResearchRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";
export type IdeaDirection = "LONG" | "SHORT" | "WATCH" | "PASS";

export type IdeaOrigin =
  | "PMNTX_CORE"
  | "AGENT_BUFFETT"
  | "AGENT_GERSTNER"
  | "AGENT_MILLENNIUM"
  | "AGENT_CITADEL"
  | "AGENT_JANE_STREET"
  | "AGENT_HRT"
  | "AGENT_OPTIVER"
  | "AGENT_JUMP"
  | "AGENT_DRUCKENMILLER"
  | "AGENT_ARK"
  | "USER_SECURITY"
  | "USER_THEME"
  | "USER_THESIS"
  | "EDGE_LAB"
  | "OTHER_SYSTEM"
  | "ML_MODEL";

export type ForecastHorizon = "D1" | "D5" | "D10" | "D21" | "D63" | "D126" | "Y1" | "Y2" | "Y3" | "Y5";
export type ForecastType = "FORECAST" | "NO_FORECAST" | "INSUFFICIENT_EDGE" | "OUTSIDE_MANDATE";

export type AgentRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";

export type OutcomeStatus = "PENDING" | "PARTIALLY_RESOLVED" | "RESOLVED";
export type RedTeamSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskRecommendation = "APPROVE" | "APPROVE_SMALLER" | "WATCH" | "DO_NOT_ADD";

export type SchwabConnectionStatus = "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "ERROR";
export type SchwabValidationComponentEnum = "OAUTH" | "MARKET_DATA" | "ACCOUNT_DATA";
export type SchwabValidationModeEnum = "MOCK" | "LIVE";
export type SchwabValidationResultEnum = "PASSED" | "FAILED";

export type BrokerExecutionMode = "READ_ONLY" | "PAPER" | "STAGED" | "HUMAN_APPROVAL" | "GUARDED_AUTO";
export type ProposedTradeSide = "BUY" | "SELL";
export type ProposedTradeOrderType = "MARKET" | "LIMIT";
export type ProposedTradeStatus =
  | "PROPOSED"
  | "RISK_REVIEWED"
  | "POLICY_REVIEWED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "STAGED"
  | "FILLED_PAPER"
  | "CANCELLED"
  | "INVALIDATED"
  | "EXPIRED";
export type ProposedTradeEventType =
  | "CREATED"
  | "RISK_REVIEWED"
  | "POLICY_REVIEWED"
  | "APPROVAL_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "INVALIDATED"
  | "STAGED"
  | "FILLED_PAPER"
  | "CANCELLED"
  | "EXECUTION_BLOCKED";

export type FeatureFamily =
  | "RETURNS"
  | "MOMENTUM"
  | "VOLATILITY"
  | "VOLUME_LIQUIDITY"
  | "RELATIVE_STRENGTH"
  | "FUNDAMENTALS"
  | "EARNINGS"
  | "VALUATION"
  | "SECTOR_INDUSTRY"
  | "MACRO_RATES"
  | "ALTERNATIVE_DATA"
  | "OPTIONS_DERIVED";

export type ModelType =
  | "NAIVE_BASELINE"
  | "DETERMINISTIC_FACTOR"
  | "LINEAR"
  | "LOGISTIC"
  | "TREE_BOOSTING"
  | "NEURAL"
  | "PMNTX_CORE"
  | "LLM_ANALYST"
  | "SPECIALIST_AGENT"
  | "ENSEMBLE";
export type ModelStatus = "EXPERIMENTAL" | "VALIDATED" | "SHADOW" | "PAPER" | "PRODUCTION" | "RETIRED";
export type ModelPromotionEventType =
  | "REGISTERED"
  | "VALIDATED"
  | "PROMOTED_TO_SHADOW"
  | "PROMOTED_TO_PAPER"
  | "PROMOTED_TO_PRODUCTION"
  | "DEMOTED"
  | "RETIRED";

export type ExperimentLifecycleStatus =
  | "PROPOSED"
  | "DATASET_DEFINED"
  | "TRAINING"
  | "TRAINED"
  | "VALIDATING"
  | "VALIDATED"
  | "WALK_FORWARD_TESTING"
  | "TESTED"
  | "COST_ADJUSTED"
  | "BENCHMARKED"
  | "PROMOTION_DECIDED"
  | "COMPLETE"
  | "FAILED";
export type ModelRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";

export type AiBudgetEventType =
  | "BLOCKED_RUN_BUDGET"
  | "BLOCKED_DAILY_BUDGET"
  | "BLOCKED_MONTHLY_BUDGET"
  | "BLOCKED_AGENT_DAILY_BUDGET"
  | "BLOCKED_SECURITY_BUDGET"
  | "BLOCKED_REQUEST_LIMIT"
  | "BLOCKED_TOKEN_LIMIT"
  | "BLOCKED_RETRY_LIMIT"
  | "BLOCKED_TIME_LIMIT"
  | "BLOCKED_KILL_SWITCH"
  | "BLOCKED_DUPLICATE"
  | "BLOCKED_REASONING_ROUNDS"
  | "WARNING_THRESHOLD";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          role: UserRole;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: UserRole;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: UserRole;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_credentials: {
        Row: {
          id: string;
          service: IntegrationService;
          display_name: string;
          encrypted_value: string | null;
          is_enabled: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          last_rotated_at: string | null;
        };
        Insert: {
          id?: string;
          service: IntegrationService;
          display_name: string;
          encrypted_value?: string | null;
          is_enabled?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          last_rotated_at?: string | null;
        };
        Update: {
          id?: string;
          service?: IntegrationService;
          display_name?: string;
          encrypted_value?: string | null;
          is_enabled?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          last_rotated_at?: string | null;
        };
        Relationships: [];
      };
      integration_health: {
        Row: {
          id: string;
          service: IntegrationService;
          status: IntegrationHealthStatus;
          last_success_at: string | null;
          last_error_at: string | null;
          last_error_message: string | null;
          last_sync_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service: IntegrationService;
          status?: IntegrationHealthStatus;
          last_success_at?: string | null;
          last_error_at?: string | null;
          last_error_message?: string | null;
          last_sync_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service?: IntegrationService;
          status?: IntegrationHealthStatus;
          last_success_at?: string | null;
          last_error_at?: string | null;
          last_error_message?: string | null;
          last_sync_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_providers: {
        Row: { id: string; code: string; name: string; is_enabled: boolean };
        Insert: { id?: string; code: string; name: string; is_enabled?: boolean };
        Update: { id?: string; code?: string; name?: string; is_enabled?: boolean };
        Relationships: [];
      };
      ai_models: {
        Row: {
          id: string;
          ai_provider_id: string;
          model_code: string;
          display_name: string;
          is_enabled: boolean;
          cost_input_per_million: number | null;
          cost_output_per_million: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ai_provider_id: string;
          model_code: string;
          display_name: string;
          is_enabled?: boolean;
          cost_input_per_million?: number | null;
          cost_output_per_million?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ai_provider_id?: string;
          model_code?: string;
          display_name?: string;
          is_enabled?: boolean;
          cost_input_per_million?: number | null;
          cost_output_per_million?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_routes: {
        Row: {
          id: string;
          role_code: string;
          ai_model_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          role_code: string;
          ai_model_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          role_code?: string;
          ai_model_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      ai_executions: {
        Row: {
          id: string;
          ai_route_id: string | null;
          ai_model_id: string;
          prompt_version_id: string | null;
          role_code: string;
          input_hash: string | null;
          input_summary: unknown | null;
          output: unknown | null;
          tokens_input: number | null;
          tokens_output: number | null;
          estimated_cost_usd: number | null;
          latency_ms: number | null;
          status: AiExecutionStatus;
          error_message: string | null;
          executed_at: string;
          research_run_id: string | null;
          agent_id: string | null;
          security_id: string | null;
          workflow_id: string | null;
          retries: number;
        };
        Insert: {
          id?: string;
          ai_route_id?: string | null;
          ai_model_id: string;
          prompt_version_id?: string | null;
          role_code: string;
          input_hash?: string | null;
          input_summary?: unknown | null;
          output?: unknown | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          estimated_cost_usd?: number | null;
          latency_ms?: number | null;
          status: AiExecutionStatus;
          error_message?: string | null;
          executed_at?: string;
          research_run_id?: string | null;
          agent_id?: string | null;
          security_id?: string | null;
          workflow_id?: string | null;
          retries?: number;
        };
        Update: {
          id?: string;
          ai_route_id?: string | null;
          ai_model_id?: string;
          prompt_version_id?: string | null;
          role_code?: string;
          input_hash?: string | null;
          input_summary?: unknown | null;
          output?: unknown | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          estimated_cost_usd?: number | null;
          latency_ms?: number | null;
          status?: AiExecutionStatus;
          error_message?: string | null;
          executed_at?: string;
          research_run_id?: string | null;
          agent_id?: string | null;
          security_id?: string | null;
          workflow_id?: string | null;
          retries?: number;
        };
        Relationships: [];
      };
      schwab_validation_runs: {
        Row: {
          id: string;
          component: SchwabValidationComponentEnum;
          mode: SchwabValidationModeEnum;
          result: SchwabValidationResultEnum;
          detail: unknown;
          run_at: string;
        };
        Insert: {
          id?: string;
          component: SchwabValidationComponentEnum;
          mode: SchwabValidationModeEnum;
          result: SchwabValidationResultEnum;
          detail?: unknown;
          run_at?: string;
        };
        Update: {
          id?: string;
          component?: SchwabValidationComponentEnum;
          mode?: SchwabValidationModeEnum;
          result?: SchwabValidationResultEnum;
          detail?: unknown;
          run_at?: string;
        };
        Relationships: [];
      };
      schwab_connection: {
        Row: {
          id: boolean;
          status: SchwabConnectionStatus;
          encrypted_access_token: string | null;
          access_token_expires_at: string | null;
          encrypted_refresh_token: string | null;
          refresh_token_expires_at: string | null;
          scope: string | null;
          connected_at: string | null;
          connected_by: string | null;
          last_error: string | null;
          last_error_at: string | null;
          last_market_data_request_at: string | null;
          last_account_data_request_at: string | null;
          updated_at: string;
          encrypted_client_id: string | null;
          encrypted_client_secret: string | null;
          client_credentials_set_at: string | null;
          client_credentials_set_by: string | null;
        };
        Insert: {
          id?: boolean;
          status?: SchwabConnectionStatus;
          encrypted_access_token?: string | null;
          access_token_expires_at?: string | null;
          encrypted_refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          scope?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_market_data_request_at?: string | null;
          last_account_data_request_at?: string | null;
          updated_at?: string;
          encrypted_client_id?: string | null;
          encrypted_client_secret?: string | null;
          client_credentials_set_at?: string | null;
          client_credentials_set_by?: string | null;
        };
        Update: {
          id?: boolean;
          status?: SchwabConnectionStatus;
          encrypted_access_token?: string | null;
          access_token_expires_at?: string | null;
          encrypted_refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          scope?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_market_data_request_at?: string | null;
          last_account_data_request_at?: string | null;
          updated_at?: string;
          encrypted_client_id?: string | null;
          encrypted_client_secret?: string | null;
          client_credentials_set_at?: string | null;
          client_credentials_set_by?: string | null;
        };
        Relationships: [];
      };
      schwab_accounts: {
        Row: {
          id: string;
          account_number_masked: string;
          encrypted_account_hash: string;
          account_type: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_number_masked: string;
          encrypted_account_hash: string;
          account_type?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_number_masked?: string;
          encrypted_account_hash?: string;
          account_type?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      schwab_account_snapshots: {
        Row: {
          id: string;
          schwab_account_id: string;
          as_of: string;
          cash: number | null;
          buying_power: number | null;
          total_value: number | null;
          raw: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          schwab_account_id: string;
          as_of?: string;
          cash?: number | null;
          buying_power?: number | null;
          total_value?: number | null;
          raw?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          schwab_account_id?: string;
          as_of?: string;
          cash?: number | null;
          buying_power?: number | null;
          total_value?: number | null;
          raw?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      schwab_positions: {
        Row: {
          id: string;
          schwab_account_id: string;
          as_of: string;
          symbol: string;
          security_id: string | null;
          quantity: number;
          average_cost: number | null;
          market_value: number | null;
          raw: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          schwab_account_id: string;
          as_of?: string;
          symbol: string;
          security_id?: string | null;
          quantity: number;
          average_cost?: number | null;
          market_value?: number | null;
          raw?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          schwab_account_id?: string;
          as_of?: string;
          symbol?: string;
          security_id?: string | null;
          quantity?: number;
          average_cost?: number | null;
          market_value?: number | null;
          raw?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      schwab_quotes: {
        Row: {
          id: string;
          symbol: string;
          security_id: string | null;
          last_price: number | null;
          bid: number | null;
          ask: number | null;
          volume: number | null;
          bar_interval: string | null;
          quote_timestamp: string;
          received_at: string;
          raw: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          security_id?: string | null;
          last_price?: number | null;
          bid?: number | null;
          ask?: number | null;
          volume?: number | null;
          bar_interval?: string | null;
          quote_timestamp: string;
          received_at?: string;
          raw?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          security_id?: string | null;
          last_price?: number | null;
          bid?: number | null;
          ask?: number | null;
          volume?: number | null;
          bar_interval?: string | null;
          quote_timestamp?: string;
          received_at?: string;
          raw?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_budget_limits: {
        Row: {
          id: string;
          scope: string;
          agent_id: string | null;
          max_cost_per_run_usd: number | null;
          max_cost_per_day_usd: number | null;
          max_cost_per_month_usd: number | null;
          max_cost_per_agent_per_day_usd: number | null;
          max_cost_per_security_analysis_usd: number | null;
          max_requests_per_workflow: number | null;
          max_requests_per_security: number | null;
          max_input_tokens_per_request: number | null;
          max_output_tokens_per_request: number | null;
          max_total_tokens_per_workflow: number | null;
          max_retries_per_request: number;
          max_reasoning_rounds: number | null;
          max_execution_time_seconds: number | null;
          warning_thresholds: number[];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          scope?: string;
          agent_id?: string | null;
          max_cost_per_run_usd?: number | null;
          max_cost_per_day_usd?: number | null;
          max_cost_per_month_usd?: number | null;
          max_cost_per_agent_per_day_usd?: number | null;
          max_cost_per_security_analysis_usd?: number | null;
          max_requests_per_workflow?: number | null;
          max_requests_per_security?: number | null;
          max_input_tokens_per_request?: number | null;
          max_output_tokens_per_request?: number | null;
          max_total_tokens_per_workflow?: number | null;
          max_retries_per_request?: number;
          max_reasoning_rounds?: number | null;
          max_execution_time_seconds?: number | null;
          warning_thresholds?: number[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          scope?: string;
          agent_id?: string | null;
          max_cost_per_run_usd?: number | null;
          max_cost_per_day_usd?: number | null;
          max_cost_per_month_usd?: number | null;
          max_cost_per_agent_per_day_usd?: number | null;
          max_cost_per_security_analysis_usd?: number | null;
          max_requests_per_workflow?: number | null;
          max_requests_per_security?: number | null;
          max_input_tokens_per_request?: number | null;
          max_output_tokens_per_request?: number | null;
          max_total_tokens_per_workflow?: number | null;
          max_retries_per_request?: number;
          max_reasoning_rounds?: number | null;
          max_execution_time_seconds?: number | null;
          warning_thresholds?: number[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      ai_system_controls: {
        Row: {
          id: boolean;
          paid_ai_disabled: boolean;
          disabled_at: string | null;
          disabled_by: string | null;
          disabled_reason: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          paid_ai_disabled?: boolean;
          disabled_at?: string | null;
          disabled_by?: string | null;
          disabled_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          paid_ai_disabled?: boolean;
          disabled_at?: string | null;
          disabled_by?: string | null;
          disabled_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_budget_events: {
        Row: {
          id: string;
          event_type: AiBudgetEventType;
          role_code: string | null;
          research_run_id: string | null;
          agent_id: string | null;
          security_id: string | null;
          detail: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: AiBudgetEventType;
          role_code?: string | null;
          research_run_id?: string | null;
          agent_id?: string | null;
          security_id?: string | null;
          detail?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: AiBudgetEventType;
          role_code?: string | null;
          research_run_id?: string | null;
          agent_id?: string | null;
          security_id?: string | null;
          detail?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_request_fingerprints: {
        Row: {
          id: string;
          research_run_id: string;
          fingerprint: string;
          role_code: string;
          ai_execution_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_run_id: string;
          fingerprint: string;
          role_code: string;
          ai_execution_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          research_run_id?: string;
          fingerprint?: string;
          role_code?: string;
          ai_execution_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      prompt_templates: {
        Row: { id: string; code: string; role_code: string; description: string | null; created_at: string };
        Insert: { id?: string; code: string; role_code: string; description?: string | null; created_at?: string };
        Update: { id?: string; code?: string; role_code?: string; description?: string | null; created_at?: string };
        Relationships: [];
      };
      prompt_versions: {
        Row: {
          id: string;
          prompt_template_id: string;
          version: string;
          content: string;
          content_hash: string;
          created_at: string;
          activated_at: string | null;
          retired_at: string | null;
        };
        Insert: {
          id?: string;
          prompt_template_id: string;
          version: string;
          content: string;
          content_hash: string;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Update: {
          id?: string;
          prompt_template_id?: string;
          version?: string;
          content?: string;
          content_hash?: string;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Relationships: [];
      };
      blind_analyses: {
        Row: {
          id: string;
          security_id: string;
          research_run_id: string;
          ai_execution_id: string | null;
          provider_code: string;
          model_code: string;
          prompt_version_id: string | null;
          anonymized_packet: unknown;
          recommendation: IdeaDirection | null;
          probabilities: unknown;
          reasoning: string | null;
          risk_factors: string | null;
          forecast_horizons_supported: string[] | null;
          confidence: number | null;
          frozen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_id: string;
          research_run_id: string;
          ai_execution_id?: string | null;
          provider_code: string;
          model_code: string;
          prompt_version_id?: string | null;
          anonymized_packet: unknown;
          recommendation?: IdeaDirection | null;
          probabilities?: unknown;
          reasoning?: string | null;
          risk_factors?: string | null;
          forecast_horizons_supported?: string[] | null;
          confidence?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_id?: string;
          research_run_id?: string;
          ai_execution_id?: string | null;
          provider_code?: string;
          model_code?: string;
          prompt_version_id?: string | null;
          anonymized_packet?: unknown;
          recommendation?: IdeaDirection | null;
          probabilities?: unknown;
          reasoning?: string | null;
          risk_factors?: string | null;
          forecast_horizons_supported?: string[] | null;
          confidence?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ideas: {
        Row: {
          id: string;
          security_id: string;
          origin: IdeaOrigin;
          research_run_id: string | null;
          agent_daily_list_id: string | null;
          direction: IdeaDirection;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_id: string;
          origin: IdeaOrigin;
          research_run_id?: string | null;
          agent_daily_list_id?: string | null;
          direction: IdeaDirection;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_id?: string;
          origin?: IdeaOrigin;
          research_run_id?: string | null;
          agent_daily_list_id?: string | null;
          direction?: IdeaDirection;
          created_at?: string;
        };
        Relationships: [];
      };
      predictions: {
        Row: {
          id: string;
          idea_id: string;
          security_id: string;
          origin: IdeaOrigin;
          research_run_id: string | null;
          agent_id: string | null;
          data_cutoff: string;
          reference_price: number;
          reference_price_at: string;
          direction: IdeaDirection;
          score: number | null;
          score_version: string | null;
          thesis: string | null;
          catalysts: string | null;
          risks: string | null;
          invalidation_criteria: string | null;
          best_horizon_label: string | null;
          regime_snapshot_id: string | null;
          ai_execution_id: string | null;
          prompt_version_id: string | null;
          supersedes_prediction_id: string | null;
          model_id: string | null;
          model_version_id: string | null;
          environment: "PRODUCTION" | "SHADOW" | "EXPERIMENT";
          estimated_inference_cost_usd: number | null;
          actual_inference_cost_usd: number | null;
          frozen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          idea_id: string;
          security_id: string;
          origin: IdeaOrigin;
          research_run_id?: string | null;
          agent_id?: string | null;
          data_cutoff: string;
          reference_price: number;
          reference_price_at: string;
          direction: IdeaDirection;
          score?: number | null;
          score_version?: string | null;
          thesis?: string | null;
          catalysts?: string | null;
          risks?: string | null;
          invalidation_criteria?: string | null;
          best_horizon_label?: string | null;
          regime_snapshot_id?: string | null;
          ai_execution_id?: string | null;
          prompt_version_id?: string | null;
          supersedes_prediction_id?: string | null;
          model_id?: string | null;
          model_version_id?: string | null;
          environment?: "PRODUCTION" | "SHADOW" | "EXPERIMENT";
          estimated_inference_cost_usd?: number | null;
          actual_inference_cost_usd?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          idea_id?: string;
          security_id?: string;
          origin?: IdeaOrigin;
          research_run_id?: string | null;
          agent_id?: string | null;
          data_cutoff?: string;
          reference_price?: number;
          reference_price_at?: string;
          direction?: IdeaDirection;
          score?: number | null;
          score_version?: string | null;
          thesis?: string | null;
          catalysts?: string | null;
          risks?: string | null;
          invalidation_criteria?: string | null;
          best_horizon_label?: string | null;
          regime_snapshot_id?: string | null;
          ai_execution_id?: string | null;
          prompt_version_id?: string | null;
          supersedes_prediction_id?: string | null;
          model_id?: string | null;
          model_version_id?: string | null;
          environment?: "PRODUCTION" | "SHADOW" | "EXPERIMENT";
          estimated_inference_cost_usd?: number | null;
          actual_inference_cost_usd?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      prediction_horizons: {
        Row: {
          id: string;
          prediction_id: string;
          horizon: ForecastHorizon;
          forecast_type: ForecastType;
          expected_return: number | null;
          expected_price: number | null;
          probability_positive: number | null;
          probability_negative: number | null;
          probability_outperform_benchmark: number | null;
          expected_benchmark_relative_return: number | null;
          bear_range_low: number | null;
          bear_range_high: number | null;
          base_range_low: number | null;
          base_range_high: number | null;
          bull_range_low: number | null;
          bull_range_high: number | null;
          downside_tail_estimate: number | null;
          confidence: number | null;
          data_quality: number | null;
          assumptions: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prediction_id: string;
          horizon: ForecastHorizon;
          forecast_type?: ForecastType;
          expected_return?: number | null;
          expected_price?: number | null;
          probability_positive?: number | null;
          probability_negative?: number | null;
          probability_outperform_benchmark?: number | null;
          expected_benchmark_relative_return?: number | null;
          bear_range_low?: number | null;
          bear_range_high?: number | null;
          base_range_low?: number | null;
          base_range_high?: number | null;
          bull_range_low?: number | null;
          bull_range_high?: number | null;
          downside_tail_estimate?: number | null;
          confidence?: number | null;
          data_quality?: number | null;
          assumptions?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prediction_id?: string;
          horizon?: ForecastHorizon;
          forecast_type?: ForecastType;
          expected_return?: number | null;
          expected_price?: number | null;
          probability_positive?: number | null;
          probability_negative?: number | null;
          probability_outperform_benchmark?: number | null;
          expected_benchmark_relative_return?: number | null;
          bear_range_low?: number | null;
          bear_range_high?: number | null;
          base_range_low?: number | null;
          base_range_high?: number | null;
          bull_range_low?: number | null;
          bull_range_high?: number | null;
          downside_tail_estimate?: number | null;
          confidence?: number | null;
          data_quality?: number | null;
          assumptions?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      prediction_outcomes: {
        Row: {
          id: string;
          prediction_horizon_id: string;
          status: OutcomeStatus;
          actual_price: number | null;
          actual_return: number | null;
          benchmark_return: number | null;
          excess_return: number | null;
          direction_correct: boolean | null;
          forecast_error: number | null;
          max_favorable_excursion: number | null;
          max_adverse_excursion: number | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prediction_horizon_id: string;
          status?: OutcomeStatus;
          actual_price?: number | null;
          actual_return?: number | null;
          benchmark_return?: number | null;
          excess_return?: number | null;
          direction_correct?: boolean | null;
          forecast_error?: number | null;
          max_favorable_excursion?: number | null;
          max_adverse_excursion?: number | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prediction_horizon_id?: string;
          status?: OutcomeStatus;
          actual_price?: number | null;
          actual_return?: number | null;
          benchmark_return?: number | null;
          excess_return?: number | null;
          direction_correct?: boolean | null;
          forecast_error?: number | null;
          max_favorable_excursion?: number | null;
          max_adverse_excursion?: number | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pmntx_agent_selections: {
        Row: {
          id: string;
          agent_daily_list_id: string;
          original_agent_rank: number | null;
          original_agent_score: number | null;
          pmntx_original_rank: number | null;
          pmntx_original_score: number | null;
          pmntx_secondary_score: number | null;
          pmntx_secondary_recommendation: IdeaDirection | null;
          evidence_discovered: string | null;
          approved: boolean;
          ai_execution_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_daily_list_id: string;
          original_agent_rank?: number | null;
          original_agent_score?: number | null;
          pmntx_original_rank?: number | null;
          pmntx_original_score?: number | null;
          pmntx_secondary_score?: number | null;
          pmntx_secondary_recommendation?: IdeaDirection | null;
          evidence_discovered?: string | null;
          approved?: boolean;
          ai_execution_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_daily_list_id?: string;
          original_agent_rank?: number | null;
          original_agent_score?: number | null;
          pmntx_original_rank?: number | null;
          pmntx_original_score?: number | null;
          pmntx_secondary_score?: number | null;
          pmntx_secondary_recommendation?: IdeaDirection | null;
          evidence_discovered?: string | null;
          approved?: boolean;
          ai_execution_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      red_team_reviews: {
        Row: {
          id: string;
          prediction_id: string;
          ai_execution_id: string | null;
          findings: unknown;
          concerns: string[] | null;
          severity: RedTeamSeverity | null;
          summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prediction_id: string;
          ai_execution_id?: string | null;
          findings?: unknown;
          concerns?: string[] | null;
          severity?: RedTeamSeverity | null;
          summary?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prediction_id?: string;
          ai_execution_id?: string | null;
          findings?: unknown;
          concerns?: string[] | null;
          severity?: RedTeamSeverity | null;
          summary?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      consensus_snapshots: {
        Row: {
          id: string;
          security_id: string;
          run_date: string;
          systems_count: number;
          direction_agreement: unknown;
          probability_dispersion: number | null;
          score_dispersion: number | null;
          horizon_agreement: unknown;
          raw_consensus_score: number | null;
          independence_adjusted_consensus_score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_id: string;
          run_date: string;
          systems_count?: number;
          direction_agreement?: unknown;
          probability_dispersion?: number | null;
          score_dispersion?: number | null;
          horizon_agreement?: unknown;
          raw_consensus_score?: number | null;
          independence_adjusted_consensus_score?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_id?: string;
          run_date?: string;
          systems_count?: number;
          direction_agreement?: unknown;
          probability_dispersion?: number | null;
          score_dispersion?: number | null;
          horizon_agreement?: unknown;
          raw_consensus_score?: number | null;
          independence_adjusted_consensus_score?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      revealed_analyses: {
        Row: {
          id: string;
          blind_analysis_id: string;
          security_id: string;
          ai_execution_id: string | null;
          provider_code: string;
          model_code: string;
          prompt_version_id: string | null;
          recommendation: IdeaDirection | null;
          probabilities: unknown;
          reasoning: string | null;
          narrative_adjustment: number | null;
          frozen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          blind_analysis_id: string;
          security_id: string;
          ai_execution_id?: string | null;
          provider_code: string;
          model_code: string;
          prompt_version_id?: string | null;
          recommendation?: IdeaDirection | null;
          probabilities?: unknown;
          reasoning?: string | null;
          narrative_adjustment?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          blind_analysis_id?: string;
          security_id?: string;
          ai_execution_id?: string | null;
          provider_code?: string;
          model_code?: string;
          prompt_version_id?: string | null;
          recommendation?: IdeaDirection | null;
          probabilities?: unknown;
          reasoning?: string | null;
          narrative_adjustment?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      securities: {
        Row: {
          id: string;
          ticker: string;
          cik: string | null;
          name: string;
          exchange: string | null;
          sector: string | null;
          industry: string | null;
          security_type: SecurityType;
          is_etf: boolean;
          is_adr: boolean;
          market_cap: number | null;
          is_active: boolean;
          listed_at: string | null;
          delisted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ticker: string;
          cik?: string | null;
          name: string;
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          security_type?: SecurityType;
          is_etf?: boolean;
          is_adr?: boolean;
          market_cap?: number | null;
          is_active?: boolean;
          listed_at?: string | null;
          delisted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ticker?: string;
          cik?: string | null;
          name?: string;
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          security_type?: SecurityType;
          is_etf?: boolean;
          is_adr?: boolean;
          market_cap?: number | null;
          is_active?: boolean;
          listed_at?: string | null;
          delisted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      market_prices: {
        Row: {
          id: string;
          security_id: string;
          price_date: string;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number;
          adj_close: number | null;
          volume: number | null;
          source: string;
          ingested_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_id: string;
          price_date: string;
          open?: number | null;
          high?: number | null;
          low?: number | null;
          close: number;
          adj_close?: number | null;
          volume?: number | null;
          source: string;
          ingested_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_id?: string;
          price_date?: string;
          open?: number | null;
          high?: number | null;
          low?: number | null;
          close?: number;
          adj_close?: number | null;
          volume?: number | null;
          source?: string;
          ingested_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: string;
          code: string;
          name: string;
          category: string;
          description: string | null;
          base_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          category: string;
          description?: string | null;
          base_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          category?: string;
          description?: string | null;
          base_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      data_ingestion_runs: {
        Row: {
          id: string;
          data_source_id: string;
          status: IngestionStatus;
          triggered_by: IngestionTrigger;
          triggered_by_user_id: string | null;
          started_at: string | null;
          completed_at: string | null;
          records_ingested: number;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          data_source_id: string;
          status?: IngestionStatus;
          triggered_by?: IngestionTrigger;
          triggered_by_user_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          records_ingested?: number;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          data_source_id?: string;
          status?: IngestionStatus;
          triggered_by?: IngestionTrigger;
          triggered_by_user_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          records_ingested?: number;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      source_records: {
        Row: {
          id: string;
          data_source_id: string;
          data_ingestion_run_id: string | null;
          source_record_id: string | null;
          entity_type: string;
          entity_id: string | null;
          event_date: string;
          public_date: string;
          ingested_at: string;
          transformation_version: string;
          raw: unknown | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          data_source_id: string;
          data_ingestion_run_id?: string | null;
          source_record_id?: string | null;
          entity_type: string;
          entity_id?: string | null;
          event_date: string;
          public_date: string;
          ingested_at?: string;
          transformation_version?: string;
          raw?: unknown | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          data_source_id?: string;
          data_ingestion_run_id?: string | null;
          source_record_id?: string | null;
          entity_type?: string;
          entity_id?: string | null;
          event_date?: string;
          public_date?: string;
          ingested_at?: string;
          transformation_version?: string;
          raw?: unknown | null;
          created_at?: string;
        };
        Relationships: [];
      };
      hunter_definitions: {
        Row: {
          id: string;
          code: string;
          name: string;
          category: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          category: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          category?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      hunter_versions: {
        Row: {
          id: string;
          hunter_definition_id: string;
          version: string;
          config: unknown;
          created_at: string;
          activated_at: string | null;
          retired_at: string | null;
        };
        Insert: {
          id?: string;
          hunter_definition_id: string;
          version: string;
          config?: unknown;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Update: {
          id?: string;
          hunter_definition_id?: string;
          version?: string;
          config?: unknown;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          internal_name: string;
          display_name: string;
          methodology_description: string;
          inspiration_disclaimer: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          internal_name: string;
          display_name: string;
          methodology_description: string;
          inspiration_disclaimer?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          internal_name?: string;
          display_name?: string;
          methodology_description?: string;
          inspiration_disclaimer?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_versions: {
        Row: {
          id: string;
          agent_id: string;
          version: string;
          system_prompt: string;
          config: unknown;
          created_at: string;
          activated_at: string | null;
          retired_at: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          version: string;
          system_prompt: string;
          config?: unknown;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          version?: string;
          system_prompt?: string;
          config?: unknown;
          created_at?: string;
          activated_at?: string | null;
          retired_at?: string | null;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          agent_version_id: string;
          research_run_id: string;
          status: AgentRunStatus;
          started_at: string | null;
          completed_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_version_id: string;
          research_run_id: string;
          status?: AgentRunStatus;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_version_id?: string;
          research_run_id?: string;
          status?: AgentRunStatus;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_daily_lists: {
        Row: {
          id: string;
          agent_run_id: string;
          security_id: string;
          direction: IdeaDirection;
          rank: number | null;
          agent_score: number | null;
          probability: number | null;
          thesis: string | null;
          catalyst: string | null;
          risks: string | null;
          invalidation_criteria: string | null;
          best_horizon_label: string | null;
          discovery_reason: string | null;
          data_quality: number | null;
          frozen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_run_id: string;
          security_id: string;
          direction: IdeaDirection;
          rank?: number | null;
          agent_score?: number | null;
          probability?: number | null;
          thesis?: string | null;
          catalyst?: string | null;
          risks?: string | null;
          invalidation_criteria?: string | null;
          best_horizon_label?: string | null;
          discovery_reason?: string | null;
          data_quality?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_run_id?: string;
          security_id?: string;
          direction?: IdeaDirection;
          rank?: number | null;
          agent_score?: number | null;
          probability?: number | null;
          thesis?: string | null;
          catalyst?: string | null;
          risks?: string | null;
          invalidation_criteria?: string | null;
          best_horizon_label?: string | null;
          discovery_reason?: string | null;
          data_quality?: number | null;
          frozen_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      hunter_results: {
        Row: {
          id: string;
          hunter_version_id: string;
          security_id: string;
          as_of_date: string;
          signal_direction: SignalDirection;
          raw_value: number | null;
          normalized_score: number;
          confidence: number;
          data_quality: number;
          evidence: unknown;
          explanation: string | null;
          source_record_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          hunter_version_id: string;
          security_id: string;
          as_of_date: string;
          signal_direction: SignalDirection;
          raw_value?: number | null;
          normalized_score: number;
          confidence: number;
          data_quality: number;
          evidence?: unknown;
          explanation?: string | null;
          source_record_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          hunter_version_id?: string;
          security_id?: string;
          as_of_date?: string;
          signal_direction?: SignalDirection;
          raw_value?: number | null;
          normalized_score?: number;
          confidence?: number;
          data_quality?: number;
          evidence?: unknown;
          explanation?: string | null;
          source_record_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      research_runs: {
        Row: {
          id: string;
          run_date: string;
          origin_type: ResearchRunOrigin;
          status: ResearchRunStatus;
          score_version: string | null;
          started_at: string | null;
          completed_at: string | null;
          frozen_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_date: string;
          origin_type: ResearchRunOrigin;
          status?: ResearchRunStatus;
          score_version?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          frozen_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_date?: string;
          origin_type?: ResearchRunOrigin;
          status?: ResearchRunStatus;
          score_version?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          frozen_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      candidate_rankings: {
        Row: {
          id: string;
          research_run_id: string;
          security_id: string;
          rank: number | null;
          score: number;
          score_components: unknown;
          selected: boolean;
          selection_reason: string | null;
          direction: IdeaDirection | null;
          model_disagreement: number | null;
          novelty_signal: number | null;
          material_change_flag: boolean;
          recommended_next_tier: string | null;
          horizon: ForecastHorizon | null;
          confidence: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_run_id: string;
          security_id: string;
          rank?: number | null;
          score: number;
          score_components?: unknown;
          selected?: boolean;
          selection_reason?: string | null;
          direction?: IdeaDirection | null;
          model_disagreement?: number | null;
          novelty_signal?: number | null;
          material_change_flag?: boolean;
          recommended_next_tier?: string | null;
          horizon?: ForecastHorizon | null;
          confidence?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          research_run_id?: string;
          security_id?: string;
          rank?: number | null;
          score?: number;
          score_components?: unknown;
          selected?: boolean;
          selection_reason?: string | null;
          direction?: IdeaDirection | null;
          model_disagreement?: number | null;
          novelty_signal?: number | null;
          material_change_flag?: boolean;
          recommended_next_tier?: string | null;
          horizon?: ForecastHorizon | null;
          confidence?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      candidate_ranking_configs: {
        Row: { id: boolean; max_candidates: number; min_score_threshold: number | null; updated_at: string; updated_by: string | null };
        Insert: {
          id?: boolean;
          max_candidates?: number;
          min_score_threshold?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          max_candidates?: number;
          min_score_threshold?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      routing_tier_configs: {
        Row: {
          id: string;
          tier_code: string;
          display_name: string;
          min_rank: number | null;
          max_rank: number | null;
          min_confidence: number | null;
          min_disagreement: number | null;
          requires_material_change: boolean;
          max_daily_invocations: number | null;
          min_hours_since_last_analysis: number | null;
          is_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          tier_code: string;
          display_name: string;
          min_rank?: number | null;
          max_rank?: number | null;
          min_confidence?: number | null;
          min_disagreement?: number | null;
          requires_material_change?: boolean;
          max_daily_invocations?: number | null;
          min_hours_since_last_analysis?: number | null;
          is_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          tier_code?: string;
          display_name?: string;
          min_rank?: number | null;
          max_rank?: number | null;
          min_confidence?: number | null;
          min_disagreement?: number | null;
          requires_material_change?: boolean;
          max_daily_invocations?: number | null;
          min_hours_since_last_analysis?: number | null;
          is_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      router_decisions: {
        Row: {
          id: string;
          candidate_ranking_id: string | null;
          security_id: string | null;
          tier_code: string;
          decision: "INVOKE" | "SKIP";
          reasoning: string;
          inputs_snapshot: unknown;
          budget_remaining_daily_usd: number | null;
          budget_remaining_monthly_usd: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          candidate_ranking_id?: string | null;
          security_id?: string | null;
          tier_code: string;
          decision: "INVOKE" | "SKIP";
          reasoning: string;
          inputs_snapshot?: unknown;
          budget_remaining_daily_usd?: number | null;
          budget_remaining_monthly_usd?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          candidate_ranking_id?: string | null;
          security_id?: string | null;
          tier_code?: string;
          decision?: "INVOKE" | "SKIP";
          reasoning?: string;
          inputs_snapshot?: unknown;
          budget_remaining_daily_usd?: number | null;
          budget_remaining_monthly_usd?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_rank_snapshots: {
        Row: {
          id: string;
          research_run_id: string;
          security_id: string;
          rank: number;
          score: number;
          percentile: number | null;
          decile: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_run_id: string;
          security_id: string;
          rank: number;
          score: number;
          percentile?: number | null;
          decile?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          research_run_id?: string;
          security_id?: string;
          rank?: number;
          score?: number;
          percentile?: number | null;
          decile?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      broker_system_controls: {
        Row: {
          id: boolean;
          mode: BrokerExecutionMode;
          execution_enabled: boolean;
          close_only_mode: boolean;
          guarded_auto_unlocked: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          mode?: BrokerExecutionMode;
          execution_enabled?: boolean;
          close_only_mode?: boolean;
          guarded_auto_unlocked?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          mode?: BrokerExecutionMode;
          execution_enabled?: boolean;
          close_only_mode?: boolean;
          guarded_auto_unlocked?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      proposed_trades: {
        Row: {
          id: string;
          prediction_id: string | null;
          rationale: string | null;
          security_id: string;
          side: ProposedTradeSide;
          order_type: ProposedTradeOrderType;
          quantity: number;
          limit_price: number | null;
          execution_mode: BrokerExecutionMode;
          status: ProposedTradeStatus;
          fingerprint: string;
          risk_review_passed: boolean | null;
          risk_review_detail: unknown;
          policy_review_passed: boolean | null;
          policy_review_detail: unknown;
          approved_by: string | null;
          approved_at: string | null;
          approval_invalidated_at: string | null;
          approval_invalidated_reason: string | null;
          staged_at: string | null;
          filled_paper_at: string | null;
          filled_paper_price: number | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          reviewed_against_quote_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prediction_id?: string | null;
          rationale?: string | null;
          security_id: string;
          side: ProposedTradeSide;
          order_type?: ProposedTradeOrderType;
          quantity: number;
          limit_price?: number | null;
          execution_mode: BrokerExecutionMode;
          status?: ProposedTradeStatus;
          fingerprint: string;
          risk_review_passed?: boolean | null;
          risk_review_detail?: unknown;
          policy_review_passed?: boolean | null;
          policy_review_detail?: unknown;
          approved_by?: string | null;
          approved_at?: string | null;
          approval_invalidated_at?: string | null;
          approval_invalidated_reason?: string | null;
          staged_at?: string | null;
          filled_paper_at?: string | null;
          filled_paper_price?: number | null;
          cancelled_at?: string | null;
          cancelled_reason?: string | null;
          reviewed_against_quote_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prediction_id?: string | null;
          rationale?: string | null;
          security_id?: string;
          side?: ProposedTradeSide;
          order_type?: ProposedTradeOrderType;
          quantity?: number;
          limit_price?: number | null;
          execution_mode?: BrokerExecutionMode;
          status?: ProposedTradeStatus;
          fingerprint?: string;
          risk_review_passed?: boolean | null;
          risk_review_detail?: unknown;
          policy_review_passed?: boolean | null;
          policy_review_detail?: unknown;
          approved_by?: string | null;
          approved_at?: string | null;
          approval_invalidated_at?: string | null;
          approval_invalidated_reason?: string | null;
          staged_at?: string | null;
          filled_paper_at?: string | null;
          filled_paper_price?: number | null;
          cancelled_at?: string | null;
          cancelled_reason?: string | null;
          reviewed_against_quote_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      proposed_trade_events: {
        Row: {
          id: string;
          proposed_trade_id: string;
          event_type: ProposedTradeEventType;
          detail: unknown;
          actor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          proposed_trade_id: string;
          event_type: ProposedTradeEventType;
          detail?: unknown;
          actor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          proposed_trade_id?: string;
          event_type?: ProposedTradeEventType;
          detail?: unknown;
          actor?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feature_definitions: {
        Row: {
          id: string;
          code: string;
          name: string;
          family: FeatureFamily;
          description: string | null;
          schema_version: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          family: FeatureFamily;
          description?: string | null;
          schema_version?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          family?: FeatureFamily;
          description?: string | null;
          schema_version?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      feature_values: {
        Row: {
          id: string;
          feature_definition_id: string;
          security_id: string;
          value: number;
          observation_at: string;
          effective_at: string | null;
          publication_at: string | null;
          available_at: string;
          source: string;
          source_version: string | null;
          source_record_id: string | null;
          ingested_at: string;
          feature_schema_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          feature_definition_id: string;
          security_id: string;
          value: number;
          observation_at: string;
          effective_at?: string | null;
          publication_at?: string | null;
          available_at: string;
          source: string;
          source_version?: string | null;
          source_record_id?: string | null;
          ingested_at?: string;
          feature_schema_version?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          feature_definition_id?: string;
          security_id?: string;
          value?: number;
          observation_at?: string;
          effective_at?: string | null;
          publication_at?: string | null;
          available_at?: string;
          source?: string;
          source_version?: string | null;
          source_record_id?: string | null;
          ingested_at?: string;
          feature_schema_version?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_values_feature_definition_id_fkey";
            columns: ["feature_definition_id"];
            referencedRelation: "feature_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      models: {
        Row: {
          id: string;
          code: string;
          name: string;
          model_type: ModelType;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          model_type: ModelType;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          model_type?: ModelType;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      model_versions: {
        Row: {
          id: string;
          model_id: string;
          version: string;
          status: ModelStatus;
          horizons: ForecastHorizon[];
          required_feature_schema_version: string | null;
          training_period_start: string | null;
          training_period_end: string | null;
          validation_period_start: string | null;
          validation_period_end: string | null;
          artifact_reference: unknown;
          cost_class: string;
          estimated_inference_cost_usd: number;
          config: unknown;
          created_at: string;
          promoted_at: string | null;
          retired_at: string | null;
          retirement_reason: string | null;
        };
        Insert: {
          id?: string;
          model_id: string;
          version: string;
          status?: ModelStatus;
          horizons?: ForecastHorizon[];
          required_feature_schema_version?: string | null;
          training_period_start?: string | null;
          training_period_end?: string | null;
          validation_period_start?: string | null;
          validation_period_end?: string | null;
          artifact_reference?: unknown;
          cost_class?: string;
          estimated_inference_cost_usd?: number;
          config?: unknown;
          created_at?: string;
          promoted_at?: string | null;
          retired_at?: string | null;
          retirement_reason?: string | null;
        };
        Update: {
          id?: string;
          model_id?: string;
          version?: string;
          status?: ModelStatus;
          horizons?: ForecastHorizon[];
          required_feature_schema_version?: string | null;
          training_period_start?: string | null;
          training_period_end?: string | null;
          validation_period_start?: string | null;
          validation_period_end?: string | null;
          artifact_reference?: unknown;
          cost_class?: string;
          estimated_inference_cost_usd?: number;
          config?: unknown;
          created_at?: string;
          promoted_at?: string | null;
          retired_at?: string | null;
          retirement_reason?: string | null;
        };
        Relationships: [];
      };
      model_promotion_events: {
        Row: {
          id: string;
          model_version_id: string;
          event_type: ModelPromotionEventType;
          from_status: ModelStatus | null;
          to_status: ModelStatus;
          reason: string | null;
          detail: unknown;
          actor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          model_version_id: string;
          event_type: ModelPromotionEventType;
          from_status?: ModelStatus | null;
          to_status: ModelStatus;
          reason?: string | null;
          detail?: unknown;
          actor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          model_version_id?: string;
          event_type?: ModelPromotionEventType;
          from_status?: ModelStatus | null;
          to_status?: ModelStatus;
          reason?: string | null;
          detail?: unknown;
          actor?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      prediction_feature_snapshot: {
        Row: { id: string; prediction_id: string; feature_value_id: string; created_at: string };
        Insert: { id?: string; prediction_id: string; feature_value_id: string; created_at?: string };
        Update: { id?: string; prediction_id?: string; feature_value_id?: string; created_at?: string };
        Relationships: [];
      };
      experiments: {
        Row: {
          id: string;
          name: string;
          hypothesis: string;
          universe: string | null;
          features: unknown;
          horizon: string | null;
          benchmark: string | null;
          success_criteria: string | null;
          sample_requirements: string | null;
          origin: string | null;
          status: ExperimentLifecycleStatus;
          feature_schema_version: string | null;
          dataset_start_date: string | null;
          dataset_end_date: string | null;
          train_start_date: string | null;
          train_end_date: string | null;
          validation_start_date: string | null;
          validation_end_date: string | null;
          test_start_date: string | null;
          test_end_date: string | null;
          random_seed: number | null;
          candidate_model_version_id: string | null;
          benchmark_model_version_id: string | null;
          survivorship_bias_warning: string | null;
          cost_adjustment_bps: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          hypothesis: string;
          universe?: string | null;
          features?: unknown;
          horizon?: string | null;
          benchmark?: string | null;
          success_criteria?: string | null;
          sample_requirements?: string | null;
          origin?: string | null;
          status?: ExperimentLifecycleStatus;
          feature_schema_version?: string | null;
          dataset_start_date?: string | null;
          dataset_end_date?: string | null;
          train_start_date?: string | null;
          train_end_date?: string | null;
          validation_start_date?: string | null;
          validation_end_date?: string | null;
          test_start_date?: string | null;
          test_end_date?: string | null;
          random_seed?: number | null;
          candidate_model_version_id?: string | null;
          benchmark_model_version_id?: string | null;
          survivorship_bias_warning?: string | null;
          cost_adjustment_bps?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          hypothesis?: string;
          universe?: string | null;
          features?: unknown;
          horizon?: string | null;
          benchmark?: string | null;
          success_criteria?: string | null;
          sample_requirements?: string | null;
          origin?: string | null;
          status?: ExperimentLifecycleStatus;
          feature_schema_version?: string | null;
          dataset_start_date?: string | null;
          dataset_end_date?: string | null;
          train_start_date?: string | null;
          train_end_date?: string | null;
          validation_start_date?: string | null;
          validation_end_date?: string | null;
          test_start_date?: string | null;
          test_end_date?: string | null;
          random_seed?: number | null;
          candidate_model_version_id?: string | null;
          benchmark_model_version_id?: string | null;
          survivorship_bias_warning?: string | null;
          cost_adjustment_bps?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      experiment_runs: {
        Row: {
          id: string;
          experiment_id: string;
          started_at: string | null;
          completed_at: string | null;
          status: ExperimentLifecycleStatus;
          results: unknown;
          seed_used: number | null;
          train_row_count: number | null;
          validation_row_count: number | null;
          test_row_count: number | null;
          is_mock: boolean;
          promotion_decision: string | null;
          promoted_model_version_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          experiment_id: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: ExperimentLifecycleStatus;
          results?: unknown;
          seed_used?: number | null;
          train_row_count?: number | null;
          validation_row_count?: number | null;
          test_row_count?: number | null;
          is_mock?: boolean;
          promotion_decision?: string | null;
          promoted_model_version_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          experiment_id?: string;
          started_at?: string | null;
          completed_at?: string | null;
          status?: ExperimentLifecycleStatus;
          results?: unknown;
          seed_used?: number | null;
          train_row_count?: number | null;
          validation_row_count?: number | null;
          test_row_count?: number | null;
          is_mock?: boolean;
          promotion_decision?: string | null;
          promoted_model_version_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      model_runs: {
        Row: {
          id: string;
          model_version_id: string;
          research_run_id: string;
          status: ModelRunStatus;
          started_at: string | null;
          completed_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          model_version_id: string;
          research_run_id: string;
          status?: ModelRunStatus;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          model_version_id?: string;
          research_run_id?: string;
          status?: ModelRunStatus;
          started_at?: string | null;
          completed_at?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      integration_service: IntegrationService;
      integration_health_status: IntegrationHealthStatus;
      ai_execution_status: AiExecutionStatus;
      security_type: SecurityType;
      ingestion_status: IngestionStatus;
      ingestion_trigger: IngestionTrigger;
      signal_direction: SignalDirection;
      research_run_origin: ResearchRunOrigin;
      research_run_status: ResearchRunStatus;
      idea_direction: IdeaDirection;
      ai_budget_event_type: AiBudgetEventType;
      idea_origin: IdeaOrigin;
      forecast_horizon: ForecastHorizon;
      forecast_type: ForecastType;
      agent_run_status: AgentRunStatus;
      outcome_status: OutcomeStatus;
      red_team_severity: RedTeamSeverity;
      risk_recommendation: RiskRecommendation;
      schwab_connection_status: SchwabConnectionStatus;
      schwab_validation_component: SchwabValidationComponentEnum;
      schwab_validation_mode: SchwabValidationModeEnum;
      schwab_validation_result: SchwabValidationResultEnum;
      broker_execution_mode: BrokerExecutionMode;
      proposed_trade_side: ProposedTradeSide;
      proposed_trade_order_type: ProposedTradeOrderType;
      proposed_trade_status: ProposedTradeStatus;
      proposed_trade_event_type: ProposedTradeEventType;
      feature_family: FeatureFamily;
      model_type: ModelType;
      model_status: ModelStatus;
      model_promotion_event_type: ModelPromotionEventType;
      experiment_lifecycle_status: ExperimentLifecycleStatus;
      model_run_status: ModelRunStatus;
    };
  };
};
