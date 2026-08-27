import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { loadLatestCandidateFunnel } from "@/lib/candidates/funnel-queries";

// Admin -> System -> Candidates. The funnel: Universe -> Quant/ML Scored
// -> Candidates -> LLM-routed -> (Deep analysis happens in the existing
// blind-analysis/agent pipelines, untouched by this page). Read-only,
// reads the latest frozen MODEL-origin research_run.
export default async function CandidatesPage() {
  await requireAdmin();
  const { summary, rows } = await loadLatestCandidateFunnel();

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — CANDIDATE FUNNEL</h1>
        <p className="mt-1 text-sm text-neutral-500">Universe → Quant/ML scored → Candidates → LLM-routed.</p>
      </header>

      {!summary ? (
        <p className="rounded-lg border border-border p-4 text-sm text-neutral-500">
          No MODEL-origin research run has been frozen yet.
        </p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Run date" value={summary.runDate} />
            <StatCard label="Universe scored" value={String(summary.universeScored)} />
            <StatCard label="Candidates" value={String(summary.candidates)} />
            <StatCard label="Routed" value={`${summary.routedInvoke} invoke / ${summary.routedSkip} skip`} />
          </div>

          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 font-mono text-sm font-bold">CANDIDATES (LATEST RUN)</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-neutral-500">
                  <th className="pb-2 font-normal">Rank</th>
                  <th className="pb-2 font-normal">Ticker</th>
                  <th className="pb-2 font-normal">Score</th>
                  <th className="pb-2 font-normal">Disagreement</th>
                  <th className="pb-2 font-normal">Selected</th>
                  <th className="pb-2 font-normal">Router</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.ticker}-${row.rank}`} className="border-t border-border">
                    <td className="py-1.5 font-mono">{row.rank ?? "—"}</td>
                    <td className="py-1.5 font-mono">{row.ticker}</td>
                    <td className="py-1.5">{row.score.toFixed(3)}</td>
                    <td className="py-1.5 text-neutral-500">{row.disagreement != null ? row.disagreement.toFixed(3) : "—"}</td>
                    <td className="py-1.5">{row.selected ? "yes" : "no"}</td>
                    <td className="py-1.5 text-neutral-500">{row.routerDecision ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold">{value}</p>
    </div>
  );
}
