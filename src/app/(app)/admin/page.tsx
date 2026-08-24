import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { listIntegrationStatus } from "@/lib/credentials/store";
import { getConnectionSummary } from "@/lib/integrations/schwab/oauth";

import { IntegrationRow } from "./integration-row";

const SCHWAB_STATUS_STYLES: Record<string, string> = {
  CONNECTED: "text-accent-long border-accent-long/40",
  DISCONNECTED: "text-neutral-500 border-neutral-700",
  EXPIRED: "text-accent-watch border-accent-watch/40",
  ERROR: "text-accent-short border-accent-short/40",
};

// Admin → System. Phase 1A scope: Integrations + AI Usage/Costs
// (docs/PHASE_1A_PLAN.md §5) — Data Health and "Run Morning Research Now"
// land as those subsystems are built, per docs/PHASE_1A_SCOPE_LOCK.md's
// dependency gate. Values are never displayed once saved; only status/
// rotation date. Schwab gets its own dedicated, richer page (linked
// below) rather than a row in this list — see src/app/(app)/admin/schwab.
export default async function AdminPage() {
  await requireAdmin();
  const [integrations, schwab] = await Promise.all([listIntegrationStatus(), getConnectionSummary()]);

  return (
    <div>
      <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight">SYSTEM — INTEGRATIONS</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Credential values are encrypted (AES-256-GCM) before storage and never displayed after
            saving. Pipeline stages that depend on a service show{" "}
            <span className="font-mono text-neutral-400">NOT CONFIGURED</span> until it&apos;s set up
            here.
          </p>
        </div>
        <Link
          href="/admin/usage"
          className="focus-ring shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white"
        >
          Usage &amp; Costs →
        </Link>
      </header>

      <Link
        href="/admin/schwab"
        className="focus-ring mb-6 flex items-center justify-between rounded-lg border border-border p-4 hover:border-neutral-600"
      >
        <div>
          <span className="font-mono text-sm font-semibold">Charles Schwab</span>
          <p className="mt-1 text-xs text-neutral-500">Read-only market data and account data.</p>
        </div>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${SCHWAB_STATUS_STYLES[schwab.status]}`}
        >
          {schwab.status}
        </span>
      </Link>

      <div className="rounded-lg border border-border px-4">
        {integrations.map((integration) => (
          <IntegrationRow key={integration.service} integration={integration} />
        ))}
      </div>
    </div>
  );
}
