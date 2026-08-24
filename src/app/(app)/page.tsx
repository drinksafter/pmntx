import { requireUser } from "@/lib/auth/session";

// Today / Morning Brief. Real sections land as the research pipeline is
// built (see docs/PHASE_1A_PLAN.md §7) — this renders honest empty states
// rather than placeholder content, since no research has run yet.
export default async function TodayPage() {
  const user = await requireUser();

  return (
    <div>
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="font-mono text-lg font-bold tracking-tight">
          PMNTX — PRE-MARKET INTELLIGENCE
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Welcome back, {user.displayName ?? user.email}.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-neutral-400">
          No research has run yet. Once integrations are configured (Admin →
          System → Integrations) and a Morning Research cycle completes,
          PMNTX Meta, PMNTX Core, and both agent desks will appear here.
        </p>
      </div>
    </div>
  );
}
