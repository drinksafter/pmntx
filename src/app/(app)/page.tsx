import { requireUser } from "@/lib/auth/session";
import { BRAND_NAME, BRAND_SUBSYSTEM_NAMES, BRAND_TAGLINE } from "@/lib/branding";
import { loadMorningBrief } from "@/lib/morning-brief/queries";
import { createClient } from "@/lib/supabase/server";

const DIRECTION_STYLES: Record<string, string> = {
  LONG: "text-accent-long border-accent-long/40",
  SHORT: "text-accent-short border-accent-short/40",
  WATCH: "text-accent-watch border-accent-watch/40",
  PASS: "text-neutral-500 border-neutral-700",
};

function DirectionBadge({ direction }: { direction: string }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${DIRECTION_STYLES[direction] ?? DIRECTION_STYLES.PASS}`}
    >
      {direction}
    </span>
  );
}

// Today / Morning Brief. Reads only frozen research through the RLS-
// respecting server client (loadMorningBrief never uses service-role) —
// a non-admin sees exactly what RLS already permits. Distinguishes four
// products per docs/PHASE_1A_SCOPE_LOCK.md §1: PMNTX Core's own picks,
// each agent's own picks, PMNTX's selections from agent picks, and
// PMNTX Meta's consensus — never conflating them into one list.
export default async function TodayPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const brief = await loadMorningBrief(supabase);

  return (
    <div>
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="font-mono text-lg font-bold tracking-tight">
          {BRAND_NAME} — {BRAND_TAGLINE}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Welcome back, {user.displayName ?? user.email}.
          {brief.runDate ? ` Latest research: ${brief.runDate}.` : ""}
        </p>
      </header>

      {!brief.runDate ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-neutral-400">
            No research has run yet. Once integrations are configured (Admin →
            System → Integrations) and a Morning Research cycle completes,{" "}
            {BRAND_SUBSYSTEM_NAMES.meta}, {BRAND_SUBSYSTEM_NAMES.core}, and both agent desks will
            appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-mono text-sm font-bold">
              {BRAND_SUBSYSTEM_NAMES.core.toUpperCase()} — INDEPENDENT PICKS
            </h2>
            {brief.corePicks.length === 0 ? (
              <p className="text-sm text-neutral-500">No candidates ranked for this run.</p>
            ) : (
              <div className="rounded-lg border border-border">
                {brief.corePicks.map((pick) => (
                  <div key={pick.securityId} className="flex items-center justify-between border-b border-border p-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-right font-mono text-xs text-neutral-500">#{pick.rank}</span>
                      <span className="font-mono text-sm font-semibold">{pick.ticker}</span>
                      <span className="text-xs text-neutral-500">{pick.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-neutral-400">{pick.score.toFixed(3)}</span>
                      <DirectionBadge direction={pick.direction} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-bold">AGENT DESKS — INDEPENDENT PICKS</h2>
            {brief.agentPicks.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No agent picks yet — <span className="font-mono">NOT CONFIGURED</span> or agents
                haven&apos;t run for this date.
              </p>
            ) : (
              <div className="rounded-lg border border-border">
                {brief.agentPicks.map((pick, i) => (
                  <div key={i} className="border-b border-border p-3 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-neutral-500">{pick.agentDisplayName}</span>
                        <span className="font-mono text-sm font-semibold">{pick.ticker}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {pick.agentScore !== null ? (
                          <span className="font-mono text-xs text-neutral-400">{pick.agentScore.toFixed(3)}</span>
                        ) : null}
                        <DirectionBadge direction={pick.direction} />
                      </div>
                    </div>
                    {pick.thesis ? <p className="mt-1 text-xs text-neutral-500">{pick.thesis}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-bold">{BRAND_NAME} AGENT SELECTION</h2>
            {brief.selections.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No agent picks have been evaluated yet — depends on agent desks above.
              </p>
            ) : (
              <div className="rounded-lg border border-border">
                {brief.selections.map((s, i) => (
                  <div key={i} className="border-b border-border p-3 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-neutral-500">{s.agentDisplayName}</span>
                        <span className="font-mono text-sm font-semibold">{s.ticker}</span>
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          s.approved ? "border-accent-long/40 text-accent-long" : "border-neutral-700 text-neutral-500"
                        }`}
                      >
                        {s.approved ? "approved" : "not approved"}
                      </span>
                    </div>
                    {s.evidenceDiscovered ? (
                      <p className="mt-1 text-xs text-neutral-500">{s.evidenceDiscovered}</p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-600">
                        <span className="font-mono">NOT CONFIGURED</span> — no AI evidence review available; approval is
                        PMNTx&apos;s deterministic comparison against its own ranking only.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-mono text-sm font-bold">{BRAND_SUBSYSTEM_NAMES.meta.toUpperCase()} — CONSENSUS</h2>
            {brief.meta.length === 0 ? (
              <p className="text-sm text-neutral-500">No consensus computed yet for this date.</p>
            ) : (
              <div className="rounded-lg border border-border">
                {brief.meta.map((m, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border p-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold">{m.ticker}</span>
                      <span className="text-xs text-neutral-500">{m.systemsCount} contributing system(s)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      {Object.entries(m.directionAgreement).map(([direction, count]) => (
                        <span key={direction} className="font-mono">
                          {direction}:{count}
                        </span>
                      ))}
                      {m.rawConsensusScore !== null ? (
                        <span className="font-mono text-neutral-300">score {m.rawConsensusScore.toFixed(3)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
