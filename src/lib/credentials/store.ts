import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IntegrationHealthStatus, IntegrationService } from "@/lib/supabase/types";

import { decryptCredential, encryptCredential } from "./encryption";

/**
 * Static catalog of every integration Phase 1A knows about, independent of
 * whether a credential has been configured yet. Mirrors the seed data in
 * supabase/migrations/005_integrations.sql and the table in
 * docs/PHASE_1A_PLAN.md §5.
 */
export const INTEGRATION_CATALOG: Record<
  IntegrationService,
  { displayName: string; purpose: string }
> = {
  QUIVER: {
    displayName: "Quiver Quantitative",
    purpose: "Alternative data — feeds 3 of the 4 Phase 1A Hunters (insider activity, government contracts, congressional trading).",
  },
  MARKET_DATA: {
    displayName: "Market Data Provider",
    purpose: "Daily OHLCV and reference prices, required for ranking and outcome resolution.",
  },
  SEC_EDGAR: {
    displayName: "SEC EDGAR",
    purpose: "Filings feed for the Accounting/Financial Change Hunter.",
  },
  FRED: {
    displayName: "FRED / ALFRED",
    purpose: "Macro context. Architected but not load-bearing for the Phase 1A pipeline.",
  },
  OPENAI: {
    displayName: "OpenAI",
    purpose: "Blind/reveal analysis and default model for one Phase 1A agent.",
  },
  ANTHROPIC: {
    displayName: "Anthropic",
    purpose: "Second independent provider for blind/reveal analysis; default model for the other Phase 1A agent.",
  },
  TELNYX: {
    displayName: "Telnyx",
    purpose: "Optional inference provider. Voice is architecture-only in Phase 1A — see docs/NEXT_PHASE.md.",
  },
};

export type IntegrationStatusRow = {
  service: IntegrationService;
  displayName: string;
  purpose: string;
  isConfigured: boolean;
  isEnabled: boolean;
  lastRotatedAt: string | null;
  health: IntegrationHealthStatus;
  lastErrorMessage: string | null;
};

/** Admin-only read model combining the credential and health tables for every known service. */
export async function listIntegrationStatus(): Promise<IntegrationStatusRow[]> {
  const supabase = createServiceRoleClient();

  const [{ data: credentials }, { data: health }] = await Promise.all([
    supabase.from("integration_credentials").select("service, is_enabled, last_rotated_at, encrypted_value"),
    supabase.from("integration_health").select("service, status, last_error_message"),
  ]);

  const credentialByService = new Map((credentials ?? []).map((c) => [c.service, c]));
  const healthByService = new Map((health ?? []).map((h) => [h.service, h]));

  return (Object.keys(INTEGRATION_CATALOG) as IntegrationService[]).map((service) => {
    const credential = credentialByService.get(service);
    const healthRow = healthByService.get(service);
    return {
      service,
      displayName: INTEGRATION_CATALOG[service].displayName,
      purpose: INTEGRATION_CATALOG[service].purpose,
      isConfigured: Boolean(credential?.encrypted_value),
      isEnabled: credential?.is_enabled ?? false,
      lastRotatedAt: credential?.last_rotated_at ?? null,
      health: healthRow?.status ?? "NOT_CONFIGURED",
      lastErrorMessage: healthRow?.last_error_message ?? null,
    };
  });
}

/** Encrypts and upserts a credential value. Caller is responsible for admin authorization. */
export async function saveCredential(
  service: IntegrationService,
  plaintext: string,
  adminProfileId: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const encrypted_value = encryptCredential(plaintext);

  const { error } = await supabase.from("integration_credentials").upsert(
    {
      service,
      display_name: INTEGRATION_CATALOG[service].displayName,
      encrypted_value,
      is_enabled: true,
      created_by: adminProfileId,
      last_rotated_at: new Date().toISOString(),
    },
    { onConflict: "service" }
  );

  if (error) throw error;
}

/** Toggles a credential on/off without touching its stored value. Caller must authorize. */
export async function setCredentialEnabled(service: IntegrationService, isEnabled: boolean): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("integration_credentials")
    .update({ is_enabled: isEnabled })
    .eq("service", service);

  if (error) throw error;
}

/**
 * Decrypts a stored credential for server-only use (AI routing, data
 * ingestion). Returns null if nothing is configured or the credential is
 * disabled — callers should treat that as "provider unavailable," not throw.
 */
export async function getDecryptedCredential(service: IntegrationService): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("integration_credentials")
    .select("encrypted_value, is_enabled")
    .eq("service", service)
    .single();

  if (error || !data?.encrypted_value || !data.is_enabled) return null;
  return decryptCredential(data.encrypted_value);
}
