import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { listModelsWithVersions } from "@/lib/models/queries";

import { PromoteForm } from "./promote-form";

const STATUS_STYLES: Record<string, string> = {
  EXPERIMENTAL: "text-neutral-500 border-neutral-700",
  VALIDATED: "text-accent-watch border-accent-watch/40",
  SHADOW: "text-accent-watch border-accent-watch/40",
  PAPER: "text-accent-watch border-accent-watch/40",
  PRODUCTION: "text-accent-long border-accent-long/40",
  RETIRED: "text-neutral-600 border-neutral-800",
};

// Admin -> System -> Models. Functional only, no visual polish (ML pivot
// brief §25). Every promotion here — especially to PRODUCTION — is
// logged to model_promotion_events; see src/lib/models/registry.ts.
export default async function ModelsPage() {
  await requireAdmin();
  const versions = await listModelsWithVersions();

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — MODELS</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every registered model version, across every model type — from PMNTx Core itself through baseline
          ML models. Promotion to PRODUCTION requires an explicit reason and is permanently audit-logged.
        </p>
      </header>

      <div className="rounded-lg border border-border">
        {versions.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">No model versions registered yet.</p>
        ) : (
          versions.map((v) => (
            <div key={v.versionId} className="border-b border-border p-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{v.modelCode}</span>
                <span className="text-xs text-neutral-500">{v.version}</span>
                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[v.status] ?? ""}`}>
                  {v.status}
                </span>
                <span className="text-xs text-neutral-600">{v.modelType}</span>
                <span className="text-xs text-neutral-600">cost class: {v.costClass}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{v.modelName}</p>
              {v.promotedAt ? (
                <p className="mt-0.5 text-[11px] text-neutral-600">Promoted {new Date(v.promotedAt).toLocaleString()}</p>
              ) : null}
              <PromoteForm versionId={v.versionId} currentStatus={v.status} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
