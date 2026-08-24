import { requireAdmin } from "@/lib/auth/session";
import { listIntegrationStatus } from "@/lib/credentials/store";

import { IntegrationRow } from "./integration-row";

// Admin → System. Phase 1A scope: Integrations only (docs/PHASE_1A_PLAN.md
// §5) — AI Routing, Data Health, and "Run Morning Research Now" land as
// those subsystems are built, per docs/PHASE_1A_SCOPE_LOCK.md's dependency
// gate. Values are never displayed once saved; only status/rotation date.
export default async function AdminPage() {
  await requireAdmin();
  const integrations = await listIntegrationStatus();

  return (
    <div>
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="font-mono text-lg font-bold tracking-tight">SYSTEM — INTEGRATIONS</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Credential values are encrypted (AES-256-GCM) before storage and never displayed after
          saving. Pipeline stages that depend on a service show{" "}
          <span className="font-mono text-neutral-400">NOT CONFIGURED</span> until it&apos;s set up
          here.
        </p>
      </header>

      <div className="rounded-lg border border-border px-4">
        {integrations.map((integration) => (
          <IntegrationRow key={integration.service} integration={integration} />
        ))}
      </div>
    </div>
  );
}
