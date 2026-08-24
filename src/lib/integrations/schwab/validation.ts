import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type SchwabValidationComponent = "OAUTH" | "MARKET_DATA" | "ACCOUNT_DATA";
export type SchwabValidationMode = "MOCK" | "LIVE";
export type SchwabValidationResult = "PASSED" | "FAILED";

/**
 * Records a validation outcome for one Schwab component. `mode: "LIVE"` is
 * only ever passed by the real provider code paths (see oauth.ts,
 * market-data-provider.ts, account-provider.ts) at the exact point a real
 * HTTP call to Schwab actually succeeded or failed — never by a test
 * harness. A mocked test script calls this directly with `mode: "MOCK"`;
 * it has no path to production code that would let it write a LIVE row.
 */
export async function recordValidation(
  component: SchwabValidationComponent,
  mode: SchwabValidationMode,
  result: SchwabValidationResult,
  detail?: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("schwab_validation_runs").insert({ component, mode, result, detail: detail ?? null });
}

export type ComponentValidationStatus = {
  component: SchwabValidationComponent;
  mockValidated: { result: SchwabValidationResult; at: string } | null;
  liveValidated: { result: SchwabValidationResult; at: string } | null;
};

/** Latest MOCK and LIVE outcome per component — the source of truth for the Admin panel's status grid. */
export async function getValidationStatus(): Promise<ComponentValidationStatus[]> {
  const supabase = createServiceRoleClient();
  const components: SchwabValidationComponent[] = ["OAUTH", "MARKET_DATA", "ACCOUNT_DATA"];

  const statuses: ComponentValidationStatus[] = [];
  for (const component of components) {
    const { data: mockRow } = await supabase
      .from("schwab_validation_runs")
      .select("result, run_at")
      .eq("component", component)
      .eq("mode", "MOCK")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: liveRow } = await supabase
      .from("schwab_validation_runs")
      .select("result, run_at")
      .eq("component", component)
      .eq("mode", "LIVE")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    statuses.push({
      component,
      mockValidated: mockRow ? { result: mockRow.result, at: mockRow.run_at } : null,
      liveValidated: liveRow ? { result: liveRow.result, at: liveRow.run_at } : null,
    });
  }
  return statuses;
}
