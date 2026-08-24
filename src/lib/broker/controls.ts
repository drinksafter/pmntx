import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BrokerExecutionMode } from "@/lib/supabase/types";

export type BrokerControlsSummary = {
  mode: BrokerExecutionMode;
  executionEnabled: boolean;
  closeOnlyMode: boolean;
  guardedAutoUnlocked: boolean;
};

/** Fails closed: any read error is treated as READ_ONLY + execution disabled, never as "assume it's fine." */
export async function getBrokerControls(): Promise<BrokerControlsSummary> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("broker_system_controls").select("*").eq("id", true).single();
  return {
    mode: data?.mode ?? "READ_ONLY",
    executionEnabled: data?.execution_enabled ?? false,
    closeOnlyMode: data?.close_only_mode ?? false,
    guardedAutoUnlocked: data?.guarded_auto_unlocked ?? false,
  };
}

/**
 * Admin-only (callers must have already checked requireAdmin()). All five
 * modes — including GUARDED_AUTO — can be selected here, since this is
 * config for a policy *framework*, not a live-execution switch: nothing
 * downstream advances a trade to real execution regardless of mode
 * (SchwabBrokerProvider.submitOrder is a hard-disabled stub — see
 * schwab-broker-provider.ts), and GUARDED_AUTO additionally requires
 * guarded_auto_unlocked, which no code path in this codebase ever sets.
 */
export async function setBrokerMode(mode: BrokerExecutionMode, adminProfileId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("broker_system_controls").update({ mode, updated_by: adminProfileId }).eq("id", true);
  if (error) throw error;
}

export async function setExecutionEnabled(enabled: boolean, adminProfileId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("broker_system_controls").update({ execution_enabled: enabled, updated_by: adminProfileId }).eq("id", true);
  if (error) throw error;
}

export async function setCloseOnlyMode(enabled: boolean, adminProfileId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("broker_system_controls").update({ close_only_mode: enabled, updated_by: adminProfileId }).eq("id", true);
  if (error) throw error;
}
