# Phase 1A Scope Lock

Binding for the remainder of Phase 1A. Supersedes any broader reading of the Master Specification (Prompt 2) for what gets *implemented* now — Prompt 2 remains the governing long-term architecture per the original build instruction, which is exactly why "architect only" is its own category below rather than "skip."

Rule going forward: **no feature enters Phase 1A unless it's required for the end-to-end vertical slice in `PHASE_1A_PLAN.md` §3 or fixes a blocking defect.** Anything else attractive-but-nonessential goes in `docs/NEXT_PHASE.md`, not into code.

---

## 1. MUST BUILD NOW

**Foundation**
- Auth (email/password via Supabase Auth), `ADMIN`/`USER` roles, protected routes
- Full database schema (all tables needed by everything else in this section — see `PHASE_1A_PLAN.md` §4). Schema breadth is not scope creep; it's the minimum needed for provenance and immutability to be real from day one.
- Credential encryption (AES-256-GCM, server-only) + Admin → System → Integrations panel for every service this section actually uses: Supabase (bootstrap), Market Data, Quiver, SEC EDGAR, OpenAI, Anthropic
- AI provider abstraction (OpenAI, Anthropic adapters) + Admin → System → AI Routing, scoped to the roles this section actually needs (Blind Analyst, Independent Blind Analyst, Revealed Analyst, Red Team, Buffett Agent, Gerstner Agent)
- Admin → System → Data Health
- Research Jobs framework (`QUEUED`/`RUNNING`/`SUCCEEDED`/`FAILED`/`PARTIAL`) + Admin "Run Morning Research Now" + Vercel Cron

**Data**
- Market data provider abstraction + one working provider
- Quiver Quantitative ingestion
- SEC EDGAR ingestion (only what the Accounting/Financial Change Hunter needs)
- Full provenance columns (`event_date`, `public_date`/`known_at`, `ingested_at`, source) enforced at the schema level, not by convention

**Research pipeline (the vertical slice)**
- 3–4 Hunters max: Insider Activity, Government Contracts, Accounting/Financial Change, and Market/Price Anomaly if time allows (3 is an acceptable Phase 1A outcome, not a shortfall)
- PMNTX Core ranking engine + candidate funnel + daily rank snapshot storage
- Blind analysis (anonymized packet, dual-provider, freeze)
- Reveal analysis + narrative-adjustment calculation
- 2 agents max: Buffett/Compounder, Gerstner/Technology Growth — generic Agent interface built correctly, only these two instantiated
- Independence firewall between PMNTX Core and both agents, enforced at the query layer and covered by a test, not just documented
- PMNTX Agent Selection (PMNTX's secondary evaluation of agent-originated ideas)
- Basic consensus calculation (raw agreement; schema supports independence-adjusted consensus later — see §2)
- Basic PMNTX Meta (transparent synthesis of Core + Agent Selection + consensus + Red Team + Risk stub — not a black box, not the full weighting sophistication of Prompt 2 §40)
- Basic Red Team (real attack pass against serious Meta candidates using the Prompt 2 §22 checklist; doesn't need the full Robustness Lab behind it)
- Prediction Warehouse (immutable, append-only, full field set from `PHASE_1A_PLAN.md` §4)
- Outcome resolution job (automatic, as horizons mature)
- Basic performance tracking (hit rate, sample size, average excess return, always paired — no leaderboard UI, see §3)

**UI (exactly two pages, plus admin)**
- One Morning Brief / Today page
- One company research page
- Admin pages listed above (Integrations, AI Routing, Data Health, Research Jobs)

**Tests**
- Auth/authorization, credential security, prediction immutability, independence-firewall ordering, provenance/known-at correctness, outcome resolution, stale-data handling, research-job failure handling

---

## 2. ARCHITECT ONLY (interfaces/schema exist; no working logic or UI)

- Remaining 8 agents — generic `Agent` interface supports them; not instantiated
- Full Hunter network beyond the 3–4 built — generic `Hunter` interface supports more
- Edge Lab schema (`experiments`, `experiment_runs`, `edges`, `edge_versions`, `edge_evidence`, `edge_performance`) — tables exist, no lifecycle logic, no UI
- Regime Engine schema (`regimes`, `regime_snapshots`) — tables exist; predictions get tagged with a placeholder regime value, no real classifier
- Risk Engine — `risk_reviews` table exists, Meta gets a minimal stub review (not the sector/factor/correlation depth in Prompt 2 §35)
- Agent debate schema (`agent_debates`) — table exists; the selective-debate trigger logic is not built
- Independence-adjusted consensus — schema field exists on `consensus_snapshots`; only raw agreement is calculated in Phase 1A (matches Prompt 2 §28's own Phase 1 carve-out)
- Cross-asset universe fields (ETF/ADR/security-type flags) — columns exist on `securities`, filtering logic is equities-only
- Telnyx — Admin integration card exists (`NOT CONFIGURED` until credentialed), AI-inference adapter interface exists; no voice architecture beyond the interface shape
- Cost/usage fields (`ai_executions.tokens`, `.cost`) — recorded on every execution; no dedicated Admin Cost/Usage dashboard yet

---

## 3. DO NOT BUILD YET → `docs/NEXT_PHASE.md`

- Remaining 8 agent implementations (Millennium, Citadel, Jane Street, HRT, Optiver, Jump, Druckenmiller, ARK/Cathie Wood)
- Full Edge Lab (lifecycle UI, backtest/robustness/validation workflow)
- Advanced Edge Ledger functionality
- Advanced Risk Engine (factor/rates/credit/macro exposure, stress testing)
- Advanced regime intelligence (real classifier, regime-conditional performance)
- Sophisticated factor models
- Options, bonds, derivatives, credit, rates, commodities, currencies
- Brokerage integrations, live execution
- Portfolio optimization
- Telnyx voice interaction
- Advanced scenario modeling (Scenario Lab)
- Agent Desk (standalone page — the Today page's per-agent sections cover Phase 1A's needs)
- Opportunities page (filterable idea browser)
- Watchlists
- Portfolio foundation UI (manual paper/user portfolio entry beyond the per-system paper portfolios already required for performance tracking)
- Ask PMNTX (natural-language research interface)
- User themes/theses submission UI
- Dedicated Performance page + Agent Leaderboard UI
- Admin Cost/Usage dashboard UI
- Selective agent debate (logic + UI)

---

## 4. Dependency-gate rule

Before starting any subsystem below, its dependency must be operational with a passing test and a real Git checkpoint on `phase-1a` — not just "written":

```
data ingestion  →  Hunters  →  PMNTX Core  →  Core predictions frozen
                                                        │
                             independent agent predictions frozen
                                                        │
                                                  PMNTX Meta
                                                        │
                                          Prediction Warehouse operational
                                                        │
                                              outcome/analytics expansion
```

If a step isn't demonstrably working, the next step doesn't start.

---

## 5. Changing this document

If something valuable surfaces mid-build that isn't in §1, it goes in `docs/NEXT_PHASE.md`, not into a "just this once" exception here. Scope changes to §1 itself require an explicit instruction, the same way this lock was created.
