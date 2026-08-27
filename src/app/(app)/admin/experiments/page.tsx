import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { listExperimentRuns } from "@/lib/experiments/queries";

const DECISION_STYLES: Record<string, string> = {
  PROMOTE_TO_VALIDATED: "text-accent-long border-accent-long/40",
  PROMOTE_TO_SHADOW: "text-accent-long border-accent-long/40",
  REJECT: "text-accent-short border-accent-short/40",
  INCONCLUSIVE: "text-accent-watch border-accent-watch/40",
};

// Admin -> System -> Experiments. Read-only — experiment runs are
// produced by src/lib/experiments/runner.ts, never edited from here.
// No experiment_runs.promotion_decision value can ever be a production
// promotion (DB check constraint) — this page cannot promote to
// production even in principle; see /admin/models for that.
export default async function ExperimentsPage() {
  await requireAdmin();
  const runs = await listExperimentRuns();

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — EXPERIMENTS</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every experiment run — dataset window, mock/real status, and the deterministic promotion decision
          each run reached. Never a path to PRODUCTION directly.
        </p>
      </header>

      <div className="rounded-lg border border-border">
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">No experiment runs yet.</p>
        ) : (
          runs.map((r) => (
            <div key={r.runId} className="border-b border-border p-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{r.experimentName}</span>
                <span className="text-xs text-neutral-500">{r.status}</span>
                {r.isMock ? (
                  <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-500">
                    MOCK
                  </span>
                ) : (
                  <span className="rounded border border-accent-watch/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent-watch">
                    LIVE
                  </span>
                )}
                {r.promotionDecision ? (
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${DECISION_STYLES[r.promotionDecision] ?? ""}`}
                  >
                    {r.promotionDecision}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{r.hypothesis}</p>
              <p className="mt-1 text-[11px] text-neutral-600">
                train={r.trainRowCount ?? "—"} test={r.testRowCount ?? "—"}
                {r.completedAt ? ` · completed ${new Date(r.completedAt).toLocaleString()}` : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
