import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { loadGlobalBudgetLimits, loadUsageSummary } from "@/lib/ai/usage-queries";

import { BudgetForm } from "./budget-form";
import { KillSwitch } from "./kill-switch";

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

// Admin -> System -> Usage. Every paid AI call in PMNTX passes through
// src/lib/ai/gateway.ts, which is what this page reads the aggregates
// from — spend figures are estimated from provider-published per-token
// pricing (ai_models.cost_*_per_million), not the provider's actual
// invoice. Treat them as a close approximation, and cross-check against
// the provider's own dashboard periodically (see docs/ADMIN_INTEGRATIONS.md).
export default async function UsagePage() {
  await requireAdmin();
  const [summary, limits] = await Promise.all([loadUsageSummary(), loadGlobalBudgetLimits()]);

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — USAGE &amp; COSTS</h1>
        <p className="mt-1 text-sm text-neutral-500">
          All figures are estimated from published per-token pricing, not exact provider invoices.
        </p>
      </header>

      <KillSwitch enabled={summary.killSwitchEnabled} reason={summary.killSwitchReason} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Spend today"
          value={formatUsd(summary.spendToday)}
          sub={summary.limits.maxCostPerDayUsd ? `of $${summary.limits.maxCostPerDayUsd} limit` : "no limit set"}
        />
        <StatCard
          label="Spend this month"
          value={formatUsd(summary.spendThisMonth)}
          sub={summary.limits.maxCostPerMonthUsd ? `of $${summary.limits.maxCostPerMonthUsd} limit` : "no limit set"}
        />
        <StatCard label="Requests today" value={String(summary.requestsToday)} sub={`${summary.failedRequestsToday} failed`} />
        <StatCard label="Retries today" value={String(summary.retriesToday)} sub="across all requests" />
        <StatCard label="Input tokens today" value={summary.tokensInputToday.toLocaleString()} />
        <StatCard label="Output tokens today" value={summary.tokensOutputToday.toLocaleString()} />
      </div>

      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">SPEND TODAY BY PROVIDER / MODEL</h2>
        {summary.byProvider.length === 0 ? (
          <p className="text-sm text-neutral-500">No AI requests yet today.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-neutral-500">
                <th className="pb-2 font-normal">Provider</th>
                <th className="pb-2 font-normal">Model</th>
                <th className="pb-2 font-normal">Requests</th>
                <th className="pb-2 font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.byProvider.map((row) => (
                <tr key={`${row.providerCode}:${row.modelCode}`} className="border-t border-border">
                  <td className="py-1.5 font-mono">{row.providerCode}</td>
                  <td className="py-1.5 text-neutral-400">{row.modelCode}</td>
                  <td className="py-1.5">{row.requests}</td>
                  <td className="py-1.5">{formatUsd(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">RECENT BUDGET EVENTS</h2>
        {summary.recentEvents.length === 0 ? (
          <p className="text-sm text-neutral-500">No budget/guardrail events recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {summary.recentEvents.map((event) => (
              <li key={event.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-accent-watch">{event.eventType}</span>
                  {event.roleCode ? <span className="text-xs text-neutral-500">{event.roleCode}</span> : null}
                  <span className="text-xs text-neutral-600">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                <pre className="mt-1 overflow-x-auto text-xs text-neutral-500">
                  {JSON.stringify(event.detail)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>

      {limits ? <BudgetForm limits={limits} /> : null}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-neutral-600">{sub}</p> : null}
    </div>
  );
}
