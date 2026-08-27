# PMNTx ML Pivot — Architecture Audit

Produced before any implementation work on the ML/neural-first pivot, per the pivot brief's own requirement to inspect the repository first. Based on a full read of every file named below, not filenames alone. 69 tables exist across 28 migrations (`001`–`028`) as of this audit; zero test files exist anywhere in the repo (no `jest`/`vitest`/`playwright`, no `.test.ts`/`.spec.ts`, no `test` script in `package.json`); no scheduler/cron currently invokes the research pipeline (see §15 below) — today, running the pipeline end-to-end requires manual script/function invocation.

Legend: **KEEP** (reuse unchanged) · **MODIFY** (extend/reposition, logic changes) · **DEPRECATE** (not applicable this phase — nothing built yet to deprecate) · **ADD** (new).

---

## 1. Hunters — `src/lib/hunters/`

**Classification: KEEP** (reposition as one raw-signal family among many feeding the feature store, not touched code-wise)

- Files: `types.ts`, `index.ts`, `runner.ts`, `insider-activity.ts`, `government-contracts.ts`, `accounting-financial-change.ts`.
- Responsibility today: 3 active Hunters, each reading pre-ingested `source_records` (never calling Quiver/SEC EDGAR directly) and writing normalized `HunterSignal`s to `hunter_results` via shared `runner.ts` bookkeeping.
- Role in new architecture: Hunter signals become one **feature family** (alternative data) feeding the new point-in-time feature store, not a special-cased input hand-fed straight into `PMNTx Core`'s composite score. Their output shape is already compatible (normalized score in [-1,1], confidence, dataQuality) — a thin adapter can copy `hunter_results` rows into `feature_values` without touching Hunter logic itself.
- Schema changes needed: none to Hunter tables themselves.
- Credential dependency: indirect (QUIVER, SEC_EDGAR via the ingestion layer one level down).
- Existing tests: none.
- Reusable directly: yes, unchanged.
- Migration risk: **low** — purely additive (a new consumer reads `hunter_results`; nothing about Hunters changes).

## 2. PMNTx Core ranking — `src/lib/pmntx-core/`

**Classification: MODIFY**

- Files: `ranking.ts`, `scoring.ts`, `predictions.ts`.
- Responsibility today: the sole deterministic idea-generation/ranking engine — composes Hunter signals into one score, ranks by magnitude, freezes immediately (independent of any agent). `predictions.ts` synthesizes Core's ranking with whatever AI analysis exists into the one frozen `predictions` row.
- Role in new architecture: becomes **one registered model** in the new Model Registry — specifically the reference **"deterministic factor model"** baseline every future ML model must beat (brief §13, "baselines are mandatory"). Its actual scoring logic (`scoring.ts`) does not need to change; what changes is that its output must additionally satisfy the standardized prediction contract (model_id/version, cost=$0, environment=PRODUCTION) so it can sit in the same comparison table as a future logistic-regression or MLP model.
- Schema changes needed: none to `pmntx-core`'s own logic; `predictions.ts`'s freeze call needs to pass a `model_id` referencing a new "PMNTX_CORE" row in the model registry (additive column already exists on `predictions` — see §5/§10 below).
- Credential dependency: none (pure DB/arithmetic) — this is exactly why it's the right default baseline: it works with paid AI fully disabled.
- Existing tests: none (independence-firewall tests are called for in scope-lock §1 but absent — flagged as a pre-existing gap this pivot should not silently inherit further).
- Reusable directly: yes, logic unchanged; only the freeze call site gains a `model_id` argument.
- Migration risk: **low** — additive column + one new call-site argument.

## 3. Blind analysis — `src/lib/blind-analysis/`

**Classification: MODIFY**

- Files: `packet.ts`, `pipeline.ts`, `prompt.ts`.
- Responsibility today: builds one anonymized packet per security per run, calls two AI providers (`BLIND_ANALYST`, `INDEPENDENT_BLIND_ANALYST`) through the gateway for **every** Core-selected candidate, freezes each response immediately.
- Role in new architecture: repositioned downstream of the new cost-aware router (brief §18) — invoked only when routing criteria justify the cost (high rank, material disagreement, event-driven trigger), not automatically for all Core candidates. `packet.ts`'s anonymization logic and `pipeline.ts`'s gateway-calling mechanics do not need to change; what changes is **who calls `runBlindAnalysisForSecurity`** — today nothing calls it end-to-end (no orchestrator exists at all, see §15), so in practice this is a repositioning of an *intended* call site, not a rewrite of working call-flow.
- Schema changes needed: none.
- Credential dependency: OpenAI and/or Anthropic (per `ai_routes`).
- Existing tests: none.
- Reusable directly: yes, unchanged; only the (not-yet-existing) orchestration layer that decides *when* to call it changes.
- Migration risk: **low** — no code in this module changes; risk is entirely in the new router logic that gates the call.

## 4. Reveal analysis / narrative adjustment — `src/lib/reveal-analysis/`

**Classification: MODIFY** (identical reasoning to §3)

- File: `pipeline.ts`.
- Responsibility today: reveal packet (ticker/name included) + narrative-adjustment heuristic (`direction-flip * 1.0 + probability-drift * 0.5`), gated on Core being frozen, deduplicated via the gateway's fingerprint mechanism.
- Role in new architecture: same repositioning as blind analysis — invoked only after routing justifies it. Logic unchanged.
- Schema changes needed: none.
- Credential dependency: whichever provider `ai_routes` maps `REVEALED_ANALYST` to.
- Existing tests: none.
- Migration risk: **low**.

## 5. Prediction Warehouse / frozen predictions

**Classification: MODIFY** (additive columns only — this is the single most important "do not create a competing duplicate" decision in the whole pivot)

- Migration: `010_ideas_and_predictions.sql` (+ immutability trigger `reject_frozen_prediction_mutation`).
- `predictions` current columns: `id, idea_id, security_id, origin, research_run_id, agent_id, data_cutoff, reference_price, reference_price_at, direction, score, score_version, thesis, catalysts, risks, invalidation_criteria, best_horizon_label, regime_snapshot_id, ai_execution_id, prompt_version_id, supersedes_prediction_id, frozen_at, created_at`.
- Role in new architecture: this **is** the standardized prediction contract the pivot brief asks for (§10) — it already has the right shape (immutable-once-frozen, per-security, per-horizon via `prediction_horizons`, regime-tagged, AI-execution-linked). What it's missing against the brief's required field list: `model_id`/`model_version` (currently only `agent_id`, which doesn't cover a bare quant model or PMNTx Core itself), `environment/mode` (PRODUCTION vs SHADOW vs EXPERIMENT — critical for §23 Shadow Mode), `estimated_inference_cost`/`actual_inference_cost` (currently cost lives only on `ai_executions`, one hop away and not always 1:1 with a prediction), `input_feature_snapshot/reference` (nothing currently pins a prediction to the exact feature values used to make it — a real point-in-time-integrity gap the new feature store must close). All of these are **additive nullable columns** — no existing column changes shape or meaning.
- `prediction_outcomes` current columns: `id, prediction_horizon_id, status, actual_price, actual_return, benchmark_return, excess_return, direction_correct, forecast_error, max_favorable_excursion, max_adverse_excursion, resolved_at, created_at`. This already matches brief §26's outcome-recording needs; no changes required.
- Schema changes needed: additive columns on `predictions` (model_id, environment, cost fields, feature snapshot reference) — detailed in the companion architecture doc.
- Credential dependency: none (this is a pure data table).
- Existing tests: none (required by scope-lock §1, absent).
- Reusable directly: yes — this is the anchor the brief explicitly says to reuse rather than duplicate.
- Migration risk: **low-medium** — the immutability trigger must continue to work unchanged (new columns are set at insert time only, same as every existing column); the risk is entirely in getting new-column defaults right so historical rows remain valid (`model_id null` for pre-pivot rows must not break anything reading them).

## 6. Outcome resolution — `src/lib/outcomes/resolution.ts`

**Classification: KEEP**

- Responsibility today: resolves `prediction_horizons` against real `market_prices`, calendar-day horizon approximation (not real trading-day counting — documented existing limitation), never backfills/guesses, upserts `prediction_outcomes`.
- Role in new architecture: unchanged — this is horizon-agnostic and model-agnostic already (it resolves against `prediction_horizons`, which any model type writes into via the shared warehouse). The vertical slice's "synthetic outcome resolution" step (brief §27) reuses this exact function against mocked/synthetic `market_prices` fixture rows rather than needing a parallel resolver.
- Schema changes needed: none.
- Credential dependency: indirectly Market Data (Schwab or Alpha Vantage) via `market_prices` — but the vertical slice satisfies this with fixture rows, no live call.
- Existing tests: none.
- Migration risk: **none**.

## 7. Investor/firm agents — `src/lib/agents/pipeline.ts`

**Classification: MODIFY** (Buffett/Gerstner, the only two implemented) · **N/A** for the other 8 (Millennium, Citadel, Jane Street, HRT, Optiver, Jump, Druckenmiller, ARK/Cathie Wood) — these exist only as inactive `agents` rows with no `agent_versions`, no `AiRole` mapping, and no invokable code; there is nothing to classify because nothing was built. They remain exactly as deferred by `docs/PHASE_1A_SCOPE_LOCK.md`/`docs/NEXT_PHASE.md`, untouched by this pivot.

- Responsibility today: `runAgentForDate` — one AI call per Core-selected candidate per active agent, every day, unconditionally.
- Role in new architecture: repositioned as **specialist second-stage reviewers** (brief §18) — invoked only for candidates the router flags as relevant to that agent's mandate (e.g. Gerstner for growth/tech setups), not every Core candidate every day. Logic inside `pipeline.ts` (packet building, gateway call, `agent_daily_lists` write, prediction freeze) does not need to change; the change is entirely in *what decides to call it*.
- Schema changes needed: none to this module. The model registry gains `AGENT_BUFFETT`/`AGENT_GERSTNER` rows so they're comparable in the same cost/value ledger as quant models.
- Credential dependency: Anthropic and/or OpenAI.
- Existing tests: none.
- Migration risk: **low**.

## 8. Morning Brief — `src/lib/morning-brief/queries.ts`

**Classification: MODIFY** (light extension, not required this phase but flagged for completeness)

- Responsibility today: pure read-only assembly of 4 distinct sections (Core picks, agent picks, PMNTx's agent-pick selections, Meta consensus) — never conflated, RLS-respecting.
- Role in new architecture: could eventually gain a 5th section (candidate-funnel summary: universe → scored → candidates → routed → deep-analyzed), but this is explicitly **not required** by the pivot's stop conditions. No change made in this phase.
- Migration risk: **none** (no change in this phase).

## 9. AI gateway — `src/lib/ai/`

**Classification: KEEP** (foundational — this is the thing the new router sits *upstream* of, never bypasses)

- Confirmed enforcement order in `gateway.ts`: kill switch → duplicate fingerprint → reasoning-round ceiling → route resolution → token clamp/estimate → 5-scope pre-flight budget check (run/day/month/agent-day/security) → request/workflow-token ceilings → bounded retry+backoff with wall-clock ceiling → record `ai_executions` → non-blocking warning thresholds. Fails closed at every step (missing budget row ⇒ zero allowance, not unlimited).
- `AiRole` enum: `BLIND_ANALYST | INDEPENDENT_BLIND_ANALYST | REVEALED_ANALYST | RED_TEAM | AGENT_BUFFETT | AGENT_GERSTNER | PMNTX_AGENT_SELECTION`.
- Role in new architecture: **unchanged and untouchable**. The new cost-aware router is a *pre-flight decision layer that sits in front of* `requestAiCompletion`, deciding whether to call it at all — it must never be given a path that bypasses the gateway's own checks. This is the single hardest invariant to preserve correctly in this pivot.
- Schema changes needed: none to the gateway's own tables. The cost ledger (brief §20) is additive/derived reporting over `ai_executions` + a new non-AI cost table for quant/feature compute — it does not change how `ai_executions` is written.
- Credential dependency: OpenAI, Anthropic (Telnyx has a provider row but no adapter — dead weight, not touched).
- Existing tests: none.
- Migration risk: **none if untouched** — the audit's explicit recommendation is zero code changes to `gateway.ts`/`router.ts` in this phase.

## 10. Schwab integration + broker/proposed-trades — `src/lib/integrations/schwab/`, `src/lib/broker/`

**Classification: KEEP** (entirely orthogonal to the ML pivot)

- All 8 Schwab files and all 4 broker files confirmed present and functioning exactly as documented in `docs/SCHWAB_INTEGRATION.md` and prior session commits: OAuth with CSRF protection, read-only market/account data, `AsyncLocalStorage`-gated MOCK-vs-LIVE validation (`schwab_validation_runs`), a hard-disabled `submitOrder()` stub, and a full `ProposedTrade` risk/policy/approval pipeline (`READ_ONLY` default, `execution_enabled=false`, `guarded_auto_unlocked` never set true anywhere in code).
- Role in new architecture: this is the **execution side** of a completely separate concern from the **research side** this pivot touches. The pivot brief's own diagram confirms this — `BROKER / EXECUTION CONTROLS` sits at the very end of the pipeline, downstream of `PORTFOLIO / RISK`, itself downstream of `PREDICTION WAREHOUSE`. Nothing about how predictions get made should ever need to touch this layer's code.
- One forward-compatibility requirement (brief §22): when Schwab credentials eventually arrive, `SchwabMarketDataProvider`/`SchwabAccountProvider` must be able to feed the new point-in-time feature store **without an architectural rewrite**. This is already satisfied by design — `market-data-router.ts` (§11 below) is the single seam between provider and consumer; the feature store's ingestion adapters read from `market_prices`/`schwab_quotes`, the same tables Schwab already writes, not from Schwab's SDK directly.
- Schema changes needed: none.
- Credential dependency: SCHWAB (not required this phase; nothing in this pivot touches it).
- Existing tests: none committed (a mock harness was run in a prior session and caught a real design bug, but was a throwaway script per this repo's established pattern — not present in the tree).
- Migration risk: **none** — zero changes.

## 11. Data-provider interfaces — `src/lib/ingestion/`

**Classification: MODIFY** (additive adapter, no changes to existing provider files)

- Files: `runs.ts`, `market-data-router.ts`, `securities.ts`, `providers/{market-data,sec-edgar,quiver}.ts`.
- Responsibility today: `market-data-router.ts` is the one real `MarketDataProvider` abstraction — tries Schwab first (if connected), falls back to Alpha Vantage. `providers/*.ts` do the actual HTTP calls and write to `source_records`/`market_prices`. Notably: `source_records` **already carries point-in-time discipline** — `event_date` (observation), `public_date` (when it became knowable to an investor — functionally identical in spirit to the pivot's `available_at`), `ingested_at`, `transformation_version`. This is a materially useful precedent: the raw-ingestion layer was already built point-in-time-aware, even though no *feature* layer sits on top of it yet.
- Role in new architecture: becomes the raw-data source layer beneath the new feature store. A new adapter module reads `source_records`/`market_prices`/`hunter_results` and computes derived numeric features into the new `feature_values` table, using each source row's existing `public_date`/`event_date`/timestamp fields to populate `available_at` correctly — no changes to the ingestion providers themselves.
- Schema changes needed: none to `data_ingestion_runs`/`source_records`/`market_prices`.
- Credential dependency: QUIVER, SEC_EDGAR (env var, not a secret), MARKET_DATA (Alpha Vantage), SCHWAB (indirect).
- Existing tests: none.
- Migration risk: **low** — purely additive new consumer.

## 12. Admin system — `src/app/(app)/admin/`

**Classification: MODIFY** (add new observability pages, do not touch existing ones)

- Existing pages confirmed: `/admin` (Integrations), `/admin/usage` (AI budgets + kill switch), `/admin/schwab` (Schwab connection). Notably absent despite being "must build now" in scope-lock §1: Data Health, AI Routing, a "Run Morning Research Now" trigger, a Research Jobs page — none of that exists today, confirming the pipeline has never been run end-to-end inside the running app, only via ad hoc scripts.
- Role in new architecture: brief §25 asks for minimal Models / Experiments / Candidate Funnel / Costs views. These are new, additive pages under `/admin` — no existing page's code changes.
- Schema changes needed: none beyond what's needed to populate the new pages (reads from new tables).
- Credential dependency: none (admin-only reads).
- Migration risk: **none** to existing pages; new pages are net-additive.

## 13. Supabase schema (overall)

**Classification: MODIFY** (additive migrations `029+` only; zero changes to migrations `001`–`028`)

- 69 tables across 28 migrations today. Two pre-existing "architect only" schemas are directly relevant and should be **extended, not duplicated**:
  - `experiments`/`experiment_runs` (migration `013_edge_foundation.sql`) — currently a loose, untyped skeleton (`status text`, `features jsonb`, no lifecycle enum, no chronological-split enforcement, no dataset/model-version persistence, zero application code references them anywhere in the repo today). This is the right table to **extend** into the brief's §12 Experiment Framework rather than create a parallel `ml_experiments` table — but it needs real typed columns (dataset window, split boundaries, seed, benchmark, promotion decision) added.
  - `edges`/`edge_versions`/`edge_evidence`/`edge_performance` (same migration) — a **separate, unrelated** concept (discovered trading-edge/strategy tracking for a future Edge Lab), not to be confused with ML model experiments. **KEEP, untouched** — do not conflate with the new model registry.
  - `regimes`/`regime_snapshots` (migration `014`) — already exactly matches brief §24's regime-segmentation requirement (`predictions.regime_snapshot_id` already wired). **KEEP, untouched.**
  - `research_runs.origin_type` is a strict 2-value enum (`PMNTX_CORE | AGENT`) with no slot for a bare quant/ML model run. Recommended approach: add a third enum value (`MODEL`) and a new `model_runs` join table mirroring the existing `agent_runs` pattern exactly (the migration 007 comment explicitly explains *why* `agent_runs` exists as a separate join table — "to avoid a circular reference between this table and agents" — the identical reasoning applies to a new `models` table).
- Migration risk: **low**, provided every change is additive (new tables, new nullable columns, new enum values appended — never removing/renarrowing an existing enum or column).

## 14. Scheduled/background jobs

**Classification: N/A this phase** — confirmed none exist (`scheduled_jobs`/`job_runs` tables exist with one seeded-but-inert row; no cron, no `vercel.json` cron entry, no admin trigger button, nothing reads `scheduled_jobs` and invokes anything). Building a scheduler is not in this pivot's deliverable list and is explicitly out of scope — noted here only so it's clear the vertical slice (§27 of the brief) must be exercised via a direct script/test invocation, exactly like every other pipeline stage has been exercised in this repo to date.

## 15. Audit/validation infrastructure

**Classification: KEEP + reuse the pattern** — `schwab_validation_runs`' MOCK-vs-LIVE distinction (§10 above) is the one existing precedent for exactly the discipline brief §22 asks for generally ("Never represent mock validation as live validation... NOT_CONFIGURED / MOCK/FIXTURE / LIVE / ERROR"). The new model-registry/experiment infrastructure should adopt the same *architectural* guarantee — not just a status-string convention, but a genuine code-level gate (mirroring `live-context.ts`'s `AsyncLocalStorage` pattern) so a mocked backtest/experiment run cannot mark itself `PRODUCTION`-promoted or `LIVE`-validated by accident, the same class of bug that was caught and fixed in the Schwab work.

---

## Summary table

| Subsystem | Classification | Code changes | Schema changes | Risk |
|---|---|---|---|---|
| Hunters | KEEP | none | none | low |
| PMNTx Core ranking | MODIFY | 1 call-site arg | additive column | low |
| Blind analysis | MODIFY | none (repositioned caller) | none | low |
| Reveal/narrative adjustment | MODIFY | none (repositioned caller) | none | low |
| Prediction Warehouse | MODIFY | none to existing logic | additive columns | low-medium |
| Outcome resolution | KEEP | none | none | none |
| Buffett/Gerstner agents | MODIFY | none (repositioned caller) | none | low |
| Other 8 agents | N/A | — nothing built — | — | — |
| Morning Brief | MODIFY (deferred) | none this phase | none | none |
| AI gateway | KEEP | **none — do not touch** | none | none |
| Schwab + broker | KEEP | none | none | none |
| Data-provider interfaces | MODIFY | new adapter only | none | low |
| Admin system | MODIFY | new pages only | none | none |
| Supabase schema overall | MODIFY | — | additive migrations only | low |
| Scheduler | N/A this phase | — | — | — |
| Validation-status pattern | KEEP + extend concept | new module (new domain) | new tables | low |

## Where the current architecture materially conflicts with the proposed one

The single real conflict: **Core, blind/reveal analysis, and both agents currently run unconditionally for every candidate** (Core ranks everything Hunters surface; agents/blind-analysis would run for every Core-selected candidate if anything actually triggered them, which nothing does today). The proposed architecture requires a cost-justification gate *before* expensive stages. Since no orchestrator currently wires these stages together at all (§14/§15), there is no working end-to-end call chain to break — the "smallest migration path" here is that the new cost-aware router becomes the **first-ever orchestrator** connecting these already-correct individual stages, rather than a rewrite of any one stage. This is a favorable position: additive by construction, not a retrofit onto working automation.

No broad rewrite is warranted or performed. See `docs/architecture/PMNTX_ML_ARCHITECTURE.md` for the concrete new-architecture design this audit feeds into.
