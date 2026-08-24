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

### SchwabBrokerProvider (explicitly not implemented — read-only Schwab market data/account access shipped separately; see `docs/SCHWAB_INTEGRATION.md`)

`SchwabMarketDataProvider` and `SchwabAccountProvider` (read-only) exist. `SchwabBrokerProvider` does not, and must not be built until this future flow is deliberately scoped:

```
PMNTx Research
  → Risk Engine
  → Portfolio Engine
  → Proposed Order
  → Execution Policy
  → human approval
  → SchwabBrokerProvider
```

Future execution modes, in increasing order of autonomy — only the first is ever assumed by default:

- `RESEARCH_ONLY` / `READ_ONLY` — what exists today; no order can be placed.
- `PAPER` — simulated fills against real Schwab quotes, no real order sent.
- `STAGED` — an order is prepared and shown to a human, who submits it manually outside PMNTx.
- `GUARDED_AUTO` — PMNTx submits within tight, pre-approved bounds (size, security allow-list, daily caps) with human override.
- `LIVE` — full autonomous execution. Requires all of the above to exist and be trusted first.

Schwab's Accounts and Trading product does expose order placement/replacement/cancellation endpoints (see `docs/SCHWAB_INTEGRATION.md` §7) — their existence in the API is not authorization to use them. No trading endpoint is called anywhere in the Phase 1A or Phase 1A-validation codebase.

## Distributed research workers
- ResearchWorker, including future cloud workers or dedicated Mac/OpenClaw research workers — PMNTX/Supabase remains the sole authoritative system of record in Phase 1A; no external worker executes research or writes directly to the Prediction Warehouse

## Voice / Telnyx
- Telnyx voice interaction (the Admin integration card and AI-inference adapter interface ship in Phase 1A; voice itself does not)

## Research media intake
- Research Media Intake / ResearchContentProvider — a future system for ingesting legally accessible external research content (podcast transcripts, interviews, newsletters, and similar media), extracting speaker/company/theme/stance/forecast information, and preserving source and publication provenance the same way `source_records` does for Phase 1A's structured data sources. Would eventually support measuring a source/speaker's own predictive track record over time. Prof G Markets is one example future source. Not implemented in Phase 1A.

## UI not required to prove the pipeline
- Agent Desk (standalone page)
- Opportunities page (filterable idea browser)
- Watchlists
- Ask PMNTX (natural-language research interface)
- User themes/theses submission UI
- Dedicated Performance page + Agent Leaderboard
- Research-value-per-dollar analytics (cost attribution + outcome data are both recorded in Phase 1A; the cross-analysis isn't built)

---

Add to this list rather than building when something valuable but nonessential comes up during Phase 1A implementation.
