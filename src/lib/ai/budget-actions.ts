"use server";

// The ONLY code path in PMNTX allowed to write ai_budget_limits or
// ai_system_controls. Every export here calls requireAdmin() first — a
// real authenticated human session, not a service-role bypass — which is
// what actually enforces "no AI model, agent, PMNTX Meta process, or
// automated process may modify or raise these limits" (the gateway and
// every other module only ever READ these tables). Do not add a second
// write path to either table.

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type BudgetActionState = { error: string | null; success?: boolean };

const NUMERIC_FIELDS = [
  "max_cost_per_run_usd",
  "max_cost_per_day_usd",
  "max_cost_per_month_usd",
  "max_cost_per_agent_per_day_usd",
  "max_cost_per_security_analysis_usd",
  "max_requests_per_workflow",
  "max_requests_per_security",
  "max_input_tokens_per_request",
  "max_output_tokens_per_request",
  "max_total_tokens_per_workflow",
  "max_retries_per_request",
  "max_reasoning_rounds",
  "max_execution_time_seconds",
] as const;

export async function updateGlobalBudgetLimitsAction(
  _prevState: BudgetActionState,
  formData: FormData
): Promise<BudgetActionState> {
  const admin = await requireAdmin();
  const supabase = createServiceRoleClient();

  const update: Record<string, number | null> = {};
  for (const field of NUMERIC_FIELDS) {
    const raw = formData.get(field);
    const value = raw === null || raw === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      return { error: `${field} must be a non-negative number.` };
    }
    update[field] = value;
  }

  const { error } = await supabase
    .from("ai_budget_limits")
    .update({ ...update, updated_by: admin.id })
    .eq("scope", "GLOBAL")
    .is("agent_id", null);

  if (error) return { error: error.message };

  revalidatePath("/admin/usage");
  return { error: null, success: true };
}

export async function setPaidAiKillSwitchAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const supabase = createServiceRoleClient();
  const disabled = formData.get("disabled") === "true";
  const reason = String(formData.get("reason") ?? "").trim();

  await supabase
    .from("ai_system_controls")
    .update({
      paid_ai_disabled: disabled,
      disabled_at: disabled ? new Date().toISOString() : null,
      disabled_by: disabled ? admin.id : null,
      disabled_reason: disabled ? reason || "Disabled via Admin → System → Usage." : null,
    })
    .eq("id", true);

  revalidatePath("/admin/usage");
}
