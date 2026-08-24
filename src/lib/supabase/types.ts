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
    };
  };
};
