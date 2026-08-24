# PMNTX — Phase 1A Implementation Plan

## 1. Current state

This is a brand-new project — the repository contained nothing but a `.gitignore` and placeholder `README.md` before this plan. There is no prior codebase, database, or configuration to inspect, preserve, or migrate away from. Every architectural decision below is being made fresh, which is simpler than the brief's "inspect and preserve" framing anticipates, but the same discipline applies going forward: once Phase 1A code exists, later phases must inspect and preserve it rather than rewrite it.

## 2. Stack decisions

| Concern | Decision | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + React | Matches the brief's suggested default; Vercel-native. |
| Styling | Tailwind CSS | Brief's suggested default; fast to build a dense, data-first UI. |
| Database | Supabase (Postgres) | Brief's suggested default; gives us Postgres + auth + row-level security in one managed service, SQL migrations for the large schema this needs. |
| Auth | Supabase Auth (email/password) + a `profiles` table carrying `role` (`ADMIN` \| `USER`) | Real authentication per brief §53, not a stub. Role lives in our own table (not just Supabase metadata) so authorization checks are simple SQL/RLS, and roles are auditable. |
| Scheduling | Vercel Cron hitting a protected internal API route, which invokes the same job runner the Admin "Run Now" button calls | One code path for scheduled and manual runs — avoids drift between the two. |
| Credential encryption | AES-256-GCM, key from `PMNTX_MASTER_ENCRYPTION_KEY` (bootstrap env var, server-only) | Brief §8/§58 requirement: encrypted at rest, server-only, masked after save. |
| Deployment | Vercel | Brief's explicit target. |

## 3. What Phase 1A actually implements (vertical slice, not full Prompt 2 breadth)

Per Prompt 1 §3, Phase 1A builds the **generic** architecture for all ten agents and the full Hunter network, but only implements enough concrete instances to prove the pipeline end-to-end:

- **2 of 10 agents**: Buffett/Compounder, Gerstner/Technology Growth
- **4 Hunters**: Insider Activity, Government Contracts, Accounting/Financial Change, Market/Price Anomaly
- **Full pipeline spine**: ingestion → Hunters → PMNTX Core ranking → candidate funnel → blind analysis → freeze → reveal analysis → PMNTX Core picks frozen → agents run independently → agent picks frozen → PMNTX evaluates agent discoveries → basic consensus → PMNTX Meta → Morning Brief → Prediction Warehouse → outcome resolution job

Everything in Prompt 2 beyond this (remaining 8 agents, full Hunter network, Edge Lab, Robustness Lab, Risk Engine depth, Scenario Lab, Regime Engine depth, options/bonds/derivatives, Telnyx voice, brokerage connectivity) is **architected for** — the interfaces and schema leave room for them — but not built now. This matches Prompt 1 §44 and Prompt 2 §82's explicit "do not block Phase 1 on future features" guidance.

## 4. Database changes

New Postgres schema (Supabase), organized into migration files under `supabase/migrations/`. Full table list follows Prompt 2 §70's conceptual inventory, grouped into logical migrations:

1. `001_auth_and_users` — `profiles`, `roles`
2. `002_securities` — `securities`, `security_aliases`, `security_metadata`
3. `003_market_data` — `market_prices`, `market_calendar`
4. `004_provenance` — `data_sources`, `data_ingestion_runs`, `source_records` (every later table with external data references these)
5. `005_integrations` — `integration_credentials` (encrypted), `integration_health`, `provider_usage`
6. `006_hunters` — `hunter_definitions`, `hunter_versions`, `hunter_results`
7. `007_research_runs` — `research_runs`, `candidate_rankings`, `daily_rank_snapshots`
8. `008_ai_infrastructure` — `ai_providers`, `ai_models`, `ai_routes`, `prompt_templates`, `prompt_versions`, `ai_executions`
9. `009_agents` — `agents`, `agent_versions`, `agent_runs`, `agent_daily_lists`
10. `010_ideas_and_predictions` — `ideas`, `idea_origins`, `predictions`, `prediction_horizons`, `prediction_scenarios`, `prediction_outcomes`
11. `011_blind_reveal` — `blind_analyses`, `revealed_analyses`
12. `012_review_layers` — `agent_reviews`, `agent_debates`, `consensus_snapshots`, `red_team_reviews`, `risk_reviews`
13. `013_edge_foundation` — `experiments`, `experiment_runs`, `edges`, `edge_versions`, `edge_evidence`, `edge_performance` (schema only — Edge Lab UI/logic is post-1A)
14. `014_regime_foundation` — `regimes`, `regime_snapshots` (schema only)
15. `015_portfolios` — `paper_portfolios`, `paper_positions`, `paper_transactions`, `portfolio_snapshots`
16. `016_user_features` — `watchlists`, `watchlist_items`, `user_theses`, `user_research_requests`
17. `017_jobs_and_logs` — `scheduled_jobs`, `job_runs`, `system_logs`

**Immutability enforcement (§27 in Prompt 1, §71 in Prompt 2):** `predictions` and its horizon/scenario children get a Postgres trigger (`BEFORE UPDATE OR DELETE`) that rejects the operation once a row's `frozen_at` is set, raising an exception. Corrections happen by inserting a new prediction row that references the original via `supersedes_prediction_id` — never by mutating history. The same pattern applies to `blind_analyses` and `agent_daily_lists` once frozen.

**Independence firewall (§24 in Prompt 1, §15 in Prompt 2):** enforced at the query layer, not just by convention. Agent run code and PMNTX Core run code are only permitted to read `agent_daily_lists` / `candidate_rankings` rows from *other* systems where `research_run_id` refers to a run whose `frozen_at IS NOT NULL`. This is checked in a shared repository function used by every read path, with a test asserting a same-day, not-yet-frozen row is invisible to a different system's query.

## 5. Integrations required (all built to "NOT CONFIGURED" gracefully; none are bootstrap-blocking)

| Service | Purpose | Required for Phase 1A functionality? |
|---|---|---|
| Supabase | Database + auth | **Bootstrap** — required before the app runs at all |
| `PMNTX_MASTER_ENCRYPTION_KEY` | Encrypts credentials at rest | **Bootstrap** — required before any integration credential can be saved |
| Market data provider | Daily OHLCV + reference prices | Required for real ranking/outcome resolution; app runs without it, shows `NOT CONFIGURED` |
| Quiver Quantitative | Alternative data (insider, gov't contracts, etc.) — feeds 3 of the 4 Phase 1A Hunters | Same — degrades gracefully |
| SEC EDGAR | Filings for the Accounting/Financial Change Hunter | Same |
| FRED/ALFRED | Macro context | Optional for Phase 1A — architected, not load-bearing for the core pipeline |
| OpenAI | Blind/reveal analysis, one agent's default model | Required for the AI-analysis steps to produce real output |
| Anthropic | Blind/reveal analysis (second independent provider), other agent's default model | Same |
| Telnyx | AI inference (optional) + voice (architecture only) | Optional — not load-bearing for Phase 1A |

I will tell you exactly what to obtain and where to enter it, per credential, when we reach the point where its absence blocks a specific test — not all at once up front.

## 6. Major risks

- **Scope.** This is the largest honest risk. Prompt 1 alone describes ~45 requirements areas; Prompt 2 describes ~98. I'm building in the priority order Prompt 2 §81 specifies (foundation → data → Hunters → AI → predictions → agents → synthesis → UI → portfolios → Edge/Risk/Regime foundations), with a real commit at each stage, so the work is resumable and reviewable incrementally rather than delivered as one unreviewable drop.
- **Look-ahead bias.** Mitigated architecturally (§4 provenance columns on every source-derived table) rather than by convention, per Prompt 1 §11's explicit instruction.
- **Fabricated data.** No mock market prices, predictions, or agent performance will be written to any table that the UI reads as "live." Development fixtures, if any are needed for UI work before real credentials exist, are marked `is_demo = true` and filtered out of every production/performance query — enforced by a database check, not just application logic.
- **Credential security.** AES-256-GCM with a server-only key; tests assert credentials never appear in an API response body or a log line.
- **Independence firewall correctness.** This is the architectural property the whole product's credibility depends on. It gets explicit tests (§39 in Prompt 1), not just a code comment.

## 7. Implementation sequence

Matches Prompt 2 §81's priority order, condensed to what's in scope for Phase 1A (see §3 above):

1. App shell, Supabase auth, roles, protected routes, base layout
2. Full database schema + migrations (all 17 migration files above)
3. Credential encryption + Admin → System → Integrations panel (all 7 services, real test-connection logic, `NOT CONFIGURED` state)
4. AI provider abstraction (OpenAI/Anthropic/Telnyx adapters) + Admin → System → AI Routing
5. Market data provider abstraction + Quiver + SEC EDGAR + FRED ingestion services
6. Hunter framework + 4 Hunters
7. PMNTX Core ranking engine + candidate funnel + daily rank snapshot storage
8. Blind analysis pipeline (anonymization + dual-provider execution + freeze)
9. Reveal analysis pipeline + narrative-adjustment calculation
10. Prediction Warehouse (immutable) + forecast horizon storage + outcome-resolution job
11. Agent framework + Buffett agent + Gerstner agent, independence firewall enforced and tested
12. PMNTX Agent Selection (secondary evaluation of agent discoveries) + basic consensus calculation + PMNTX Meta (transparent synthesis, not a black box)
13. Research Jobs framework (queued/running/succeeded/failed) + Admin "Run Morning Research Now" + Vercel Cron wiring
14. Today/Morning Brief, Company page, Agent Desk, Data Health admin page
15. Tests across all of the above (§39 list)
16. Remaining docs (`ARCHITECTURE.md`, `DATA_PROVENANCE.md`, `PREDICTION_WAREHOUSE.md`, `AI_ARCHITECTURE.md`, `ADMIN_INTEGRATIONS.md`, `RESEARCH_INTEGRITY.md`, `NEXT_PHASE.md`)

Each numbered step above is a checkpoint commit on the `phase-1a` branch, pushed to GitHub as it completes — not one final commit at the end.
