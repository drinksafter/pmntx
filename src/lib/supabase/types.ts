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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      integration_service: IntegrationService;
      integration_health_status: IntegrationHealthStatus;
    };
  };
};
