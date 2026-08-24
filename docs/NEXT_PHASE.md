# Next Phase — Deferred from Phase 1A

Everything here is explicitly out of scope for Phase 1A per `docs/PHASE_1A_SCOPE_LOCK.md` §3. Nothing in this list gets implemented until Phase 1A's vertical slice is operational and a new phase is explicitly scoped. This file is a parking lot, not a backlog with commitments attached.

## Research agents
- Millennium Agent
- Citadel Agent
- Jane Street Agent
- Hudson River Trading Agent
- Optiver Agent
- Jump Trading Agent
- Druckenmiller Agent
- ARK / Cathie Wood Agent
- Selective agent debate (trigger logic + UI) — schema (`agent_debates`) exists from Phase 1A

## Research infrastructure depth
- Full Edge Lab (lifecycle: IDEA → RESEARCH → REGISTERED → BACKTEST → ROBUSTNESS → VALIDATION → OUT_OF_SAMPLE → SHADOW → APPROVED → WATCH → DECAYING → RETIRED) and its UI
- Advanced Edge Ledger functionality beyond the Phase 1A schema
- Advanced Risk Engine (sector/factor/rates/credit/macro exposure, stress testing, cross-asset)
- Advanced regime intelligence (real classifier; regime-conditional agent/edge performance)
- Sophisticated factor models
- Independence-adjusted consensus calculation (raw agreement ships in Phase 1A; the adjusted version needs enough history to be meaningful anyway)
- Robustness Lab (parameter/date-window/universe perturbation, bootstrap testing, etc.)
- Scenario Lab (rate/oil/USD/credit-spread/VIX scenario modeling)

## Asset classes
- Options, bonds, derivatives, credit, rates, commodities, currencies
- ETF/ADR-specific handling beyond the schema flags already in place

## Portfolio & execution
- Brokerage connectivity, live execution
- Portfolio optimization
- Manual paper/user portfolio entry UI beyond the per-system paper portfolios Phase 1A already tracks for performance

## Voice / Telnyx
- Telnyx voice interaction (the Admin integration card and AI-inference adapter interface ship in Phase 1A; voice itself does not)

## UI not required to prove the pipeline
- Agent Desk (standalone page)
- Opportunities page (filterable idea browser)
- Watchlists
- Ask PMNTX (natural-language research interface)
- User themes/theses submission UI
- Dedicated Performance page + Agent Leaderboard
- Admin Cost/Usage dashboard (the underlying `ai_executions` token/cost fields are recorded in Phase 1A; no dashboard yet)

---

Add to this list rather than building when something valuable but nonessential comes up during Phase 1A implementation.
