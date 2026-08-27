import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { loadCostSummary } from "@/lib/cost-ledger/queries";

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

// Admin -> System -> Costs. Extends the existing Usage & Costs page
// (/admin/usage, AI-inference-only) into a ledger that also covers
// non-AI compute — see src/lib/cost-ledger/. Neither page's logic is
// modified by the other.
export default async function CostsPage() {
  await requireAdmin();
  const summary = await loadCostSummary();

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — COST LEDGER</h1>
        <p className="mt-1 text-sm text-neutral-500">
          AI inference plus feature/quant compute, by category and provider. See{" "}
          <Link href="/admin/usage" className="underline hover:text-white">
            Usage &amp; Costs
          </Link>{" "}
          for the AI-gateway-specific view (kill switch, budgets, per-request detail).
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Today (estimated)" value={formatUsd(summary.today.estimatedUsd)} />
        <StatCard label="Today (actual)" value={formatUsd(summary.today.actualUsd)} />
        <StatCard label="Month to date (estimated)" value={formatUsd(summary.monthToDate.estimatedUsd)} />
        <StatCard label="Month to date (actual)" value={formatUsd(summary.monthToDate.actualUsd)} />
      </div>

      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">BY CATEGORY</h2>
        <BreakdownTable rows={summary.byCategory} />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">BY PROVIDER</h2>
        <BreakdownTable rows={summary.byProvider} />
      </div>
    </div>
  );
}

function BreakdownTable({ rows }: { rows: { key: string; totalActualUsd: number; totalEstimatedUsd: number; entryCount: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">No cost ledger entries yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs text-neutral-500">
          <th className="pb-2 font-normal">Key</th>
          <th className="pb-2 font-normal">Entries</th>
          <th className="pb-2 font-normal">Estimated</th>
          <th className="pb-2 font-normal">Actual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-border">
            <td className="py-1.5 font-mono">{row.key}</td>
            <td className="py-1.5">{row.entryCount}</td>
            <td className="py-1.5">{formatUsd(row.totalEstimatedUsd)}</td>
            <td className="py-1.5">{formatUsd(row.totalActualUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
