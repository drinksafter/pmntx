import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ExperimentRunListRow = {
  experimentName: string;
  hypothesis: string;
  runId: string;
  status: string;
  isMock: boolean;
  promotionDecision: string | null;
  trainRowCount: number | null;
  testRowCount: number | null;
  startedAt: string | null;
  completedAt: string | null;
};

/** Admin-only read model for Admin -> System -> Experiments. */
export async function listExperimentRuns(): Promise<ExperimentRunListRow[]> {
  const supabase = createServiceRoleClient();
  const { data: experiments } = await supabase.from("experiments").select("id, name, hypothesis");
  const { data: runs } = await supabase
    .from("experiment_runs")
    .select("id, experiment_id, status, is_mock, promotion_decision, train_row_count, test_row_count, started_at, completed_at")
    .order("started_at", { ascending: false, nullsFirst: false });

  const experimentById = new Map((experiments ?? []).map((e) => [e.id, e]));

  return (runs ?? []).map((r) => {
    const experiment = experimentById.get(r.experiment_id);
    return {
      experimentName: experiment?.name ?? "Unknown",
      hypothesis: experiment?.hypothesis ?? "",
      runId: r.id,
      status: r.status,
      isMock: r.is_mock,
      promotionDecision: r.promotion_decision,
      trainRowCount: r.train_row_count,
      testRowCount: r.test_row_count,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  });
}
