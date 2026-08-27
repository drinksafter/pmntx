# PMNTx ML Architecture

Written last, after every checkpoint below was built, tested, and committed. This document describes what actually exists after the ML pivot, not an aspiration. See `docs/architecture/PMNTX_ML_PIVOT_AUDIT.md` for the subsystem-by-subsystem inventory this design is built on.

## Old architecture

PMNTx's Phase 1A architecture ran on one assumption: expensive LLM reasoning analyzes every candidate Hunters surface, unconditionally. Hunters feed PMNTx Core's deterministic ranking; Core's selected candidates would each get two independent blind-provider AI analyses, a revealed analysis, and (if the pipeline were ever wired to run automatically, which it never was — see the audit's §14/§15) both active investor agents' review — every day, for every candidate, with no cost-justification gate. This works, and is preserved unchanged; it just isn't selective.

## New architecture

```
DATA
  -> POINT-IN-TIME FEATURE STORE          (new)
  -> CHEAP QUANTITATIVE SCREENING          (PMNTx Core, now one registered model among several)
  -> ML / NEURAL MODEL SCORING             (baseline models this phase; real neural models are Phase 2)
  -> CANDIDATE RANKING                     (extended, multi-model)
  -> COST-AWARE AGENT ROUTER               (new — the actual pivot)
  -> SELECTIVE LLM / SPECIALIST RESEARCH    (existing blind/reveal/agent pipelines, now gated)
  -> ENSEMBLE / META-MODEL                 (existing PMNTx Meta, untouched)
  -> PREDICTION WAREHOUSE                  (extended, not duplicated)
  -> OUTCOME RESOLUTION                    (existing, untouched)
  -> PORTFOLIO / RISK                      (existing broker/paper-portfolio infrastructure, untouched)
  -> BROKER / EXECUTION CONTROLS           (existing Schwab/broker code, untouched)
```

Cheap models (today: PMNTx Core's deterministic factor score and a hand-rolled logistic-regression baseline) score the broad universe. A deterministic router decides, per candidate, whether the existing expensive blind-analysis/agent pipelines are worth invoking — by rank, confidence, model disagreement, a material-change flag, and remaining budget. Nothing about how the expensive pipelines themselves work changed; what changed is that something now decides whether to call them at all.

## What was preserved

Per the architecture audit's KEEP/MODIFY classification — reused with **zero logic changes**:

- **AI gateway** (`src/lib/ai/gateway.ts`, `router.ts`) — the sole path for every paid AI call, its full enforcement chain (kill switch → duplicate fingerprint → reasoning-round ceiling → route resolution → token clamp → 5-scope budget check → request/workflow ceilings → bounded retry) untouched. The new router sits entirely upstream of it and never imports it.
- **Hunters, blind analysis, reveal analysis, both live agents (Buffett/Compounder, Gerstner/Technology Growth)** — same code, repositioned as inputs/specialists the new router decides whether to invoke, not automatic participants.
- **Outcome resolution** (`src/lib/outcomes/resolution.ts`) — the exact same `resolveDueOutcomes()` resolves both PMNTx Core's and the new baseline model's predictions; it's model-agnostic by construction (resolves against `prediction_horizons`, not against any model-specific table).
- **Schwab integration and broker/proposed-trades pipeline** — zero files touched. Confirmed orthogonal: this pivot changes how predictions get made, not how (eventually) approved trades execute.
- **Morning Brief and PMNTx Meta** — same queries, same origin-type filters. Their existing `origin_type='PMNTX_CORE'`/`origin_type='AGENT'` scoping is precisely what makes a new `MODEL`-origin research run invisible to them without any code change — verified directly (`src/lib/models/shadow-mode.test.ts` calls both functions for real and asserts a shadow prediction never appears).

## What changed

- **Prediction Warehouse** (`predictions` table) gained additive columns (`model_id`, `model_version_id`, `environment`, `estimated_inference_cost_usd`, `actual_inference_cost_usd`) and a new `prediction_feature_snapshot` join table — the same warehouse, not a competing one. The existing immutability trigger needed no code change.
- **`candidate_rankings`** gained additive columns for multi-model disagreement, novelty, and routing-tier recommendation — same table PMNTx Core has always written.
- **`experiments`/`experiment_runs`** (previously an unused "architect only" skeleton from Phase 1A) became the real experiment framework, since nothing referenced them before this pivot.
- **`research_run_origin`** gained a `MODEL` value alongside `PMNTX_CORE`/`AGENT`, and **`idea_origin`** gained an `ML_MODEL` value — the latter closing a real gap found while planning: PMNTx Meta's consensus eligibility check auto-admits anything with `origin==='PMNTX_CORE'` with no other gate, which would have wrongly let a baseline model's prediction leak into Meta consensus if it had been frozen under that origin.
- One line of pre-existing logic changed: `freezePmntxCorePredictionForSecurity` gained an optional `modelVersion` parameter (defaulting to a seeded `PMNTX_CORE` production model version), passed into its existing insert. `origin` still always resolves to `'PMNTX_CORE'`.

## Where ML/neural models plug in next

Any future model — gradient-boosted trees, an MLP, a temporal model, a transformer — implements exactly two things: (1) a scorer that reads `getFeaturesAsOf(securityId, asOfIso)` and returns a score, and (2) a `models`/`model_versions` registration. From there it can call the same `freezeStandardizedPrediction()`, the same `rankCandidates()`/`writeCandidateRankings()`, and be evaluated by the same experiment framework against the same naive/logistic baselines this phase built — no application code needs to know the difference between a hand-rolled logistic regression and a real neural network. This is the concrete meaning of "PMNTx must not assume neural networks are superior" (pivot brief §9): the registry and prediction contract don't have a privileged code path for any one `model_type`.

## Where LLM agents now sit

Buffett/Compounder and Gerstner/Technology Growth remain exactly as implemented — full LLM-reasoning specialist analysts. Their new role is downstream: the cost-aware router (`src/lib/router/`) decides, per candidate, whether their cost is justified by rank/confidence/disagreement/materiality/budget. The router never calls them directly — it calls an injectable `DeepAnalysisInvoker`, which in production would be the existing `runBlindAnalysisForSecurity`/`runAgentForDate` functions, unmodified. (No production wiring of that injector was added this phase — see Known Limitations.)

## Prediction lifecycle

Unchanged at its core: `ideas` → `predictions` (frozen once, immutable after) → `prediction_horizons` → `prediction_outcomes` (attached after the fact, unfrozen, gated only by its own unique constraint). New: every prediction now optionally carries `model_id`/`model_version_id`/`environment`/cost fields and an explicit feature-value snapshot (`prediction_feature_snapshot`) recording exactly which point-in-time feature values fed it.

## Model lifecycle

`EXPERIMENTAL → VALIDATED → SHADOW → PAPER → PRODUCTION → RETIRED`, tracked in `model_versions.status`. Every transition is logged to the append-only `model_promotion_events`. Promotion to `PRODUCTION` specifically requires running inside `runAsAdminPromotionAction()` (`src/lib/models/promotion-context.ts`) — an `AsyncLocalStorage` gate mirroring `src/lib/integrations/schwab/live-context.ts` exactly. Verified directly: calling `promoteModelVersion(id, 'PRODUCTION', ...)` outside that context throws; only `/admin/models`' server action wraps the call in it.

## Shadow lifecycle

A `SHADOW`-environment, `ML_MODEL`-origin prediction receives the same point-in-time features production would, gets frozen through the exact same standardized contract, and accumulates a real forward track record via the unmodified outcome resolver — but is structurally invisible to Morning Brief and Meta consensus (origin-type scoping) and to the broker/proposed-trades pipeline (nothing there scans `predictions` automatically today; `createProposedTrade` only ever takes a caller-supplied `predictionId`, so there's no feed for a shadow prediction to leak through even in principle). Verified empirically, not just by code inspection — see the vertical-slice and shadow-mode tests.

## Cost-aware routing

Deterministic, not learned, this phase (pivot brief §16). `decideRouting()` is a pure function: given a candidate's rank/confidence/disagreement/material-change flag and admin-editable tier thresholds (`routing_tier_configs`), plus remaining daily/monthly AI budget (read from the existing `src/lib/ai/usage-queries.ts`, never reimplemented), it returns INVOKE or SKIP with reasoning. Fails closed: absent a configured, met signal, the answer is SKIP. Every decision — INVOKE or SKIP — is written to `router_decisions`, an append-only audit trail.

## Credential-independent behavior

No file in `src/lib/{feature-store,models,predictions,candidates,experiments,router,cost-ledger}/` calls a paid provider, imports `src/lib/ai/gateway.ts`, or requires `OPENAI`/`ANTHROPIC`/`QUIVER`/`ALPHA_VANTAGE`/`SCHWAB` credentials to function. All 14 test files (56 tests total, including the vertical slice) run against either pure in-memory logic or a dedicated local Supabase stack seeded with synthetic fixtures — never the linked/production project, never a live provider. The one existing precedent for a genuine MOCK-vs-LIVE distinction (`schwab_validation_runs` + `live-context.ts`'s `AsyncLocalStorage` gate) is echoed here by `experiment_runs.is_mock` and the `promoteModelVersion`/`runAsAdminPromotionAction` gate — both are real architectural guarantees, not naming conventions.

## Point-in-time guarantees

`feature_values.available_at` is the single column every point-in-time read filters on (`getFeaturesAsOf(securityId, asOfIso)` uses `available_at <= asOfIso`), with a DB check constraint (`available_at >= observation_at`) making "known before it happened" structurally impossible, not just discouraged. Verified directly: a future-dated feature is invisible to a historical reconstruction, and a fact observed early but not published until later doesn't leak before its real publication date (`src/lib/feature-store/store.test.ts`). This mirrors — and reuses the naming precedent of — `source_records.event_date`/`public_date` from the pre-existing provenance layer (migration `004`).

## Known limitations

- **No production wiring of the router to the real LLM pipelines.** The router's `DeepAnalysisInvoker` seam is proven end-to-end in the vertical-slice test with a stub; nothing in production code yet calls `routeAndInvoke()` with the real `runBlindAnalysisForSecurity`/`runAgentForDate` as the invoker. This is a deliberate scope boundary, not an oversight — building that wiring means deciding exactly how/when the router runs in the actual daily pipeline, and there is still no scheduler or orchestrator that runs *any* pipeline stage automatically (a pre-existing gap the audit found, not something this pivot introduced or was asked to fix).
- **The one baseline model is intentionally trivial.** Hand-rolled logistic regression on two synthetic features. It exists to validate the lifecycle, not to be predictive — per the brief's own instruction, real model sophistication is Phase 2's job.
- **Migrations `029`–`038` are applied only to a local test stack, not the linked/production Supabase project.** Deploying them there is a separate, real decision (schema changes to a live database) intentionally left for explicit future authorization rather than bundled into this phase.
- **Survivorship bias**: the universe layer has no historical/delisted-security support yet — any research using today's `securities` table implicitly reflects only currently-listed names. `experiments.survivorship_bias_warning` exists as a column for labeling this per-experiment, but nothing populates it automatically yet.
- **No real event-driven reanalysis triggers** (earnings, filings, price/volume anomalies, analyst revisions) — `candidate_rankings.material_change_flag` and `routing_tier_configs.requires_material_change` exist and are honored by the router, but nothing yet sets that flag from a real event detector.
- **No corporate-actions engine** (splits, dividends, mergers, symbol changes) — unaddressed by this phase, as scoped.
- **`estimateFeatureComputeCostUsd()`/`estimateQuantScoringCostUsd()` both return 0** — honest for the current (trivial, local, synchronous) compute, but will need real estimation logic once training/inference compute has an actual marginal cost (e.g. a hosted job).
- **No real regime classifier** — `regimes`/`regime_snapshots` (pre-existing, migration `014`) still hold only the single placeholder regime; segmentation by volatility/trend/rate regime is schema-ready but not implemented.

## Deferred to Phase 2 (explicitly, not silently dropped)

Gradient-boosted trees, MLPs, temporal neural models, transformer architectures and any real model competition among them; a Python/compute service boundary (deliberately not introduced this phase — see the audit); local/open-weight inference providers; a real learned router (this phase's router is deterministic by design); real event-driven reanalysis; historical/delisted-security universe support; a real corporate-actions engine; the remaining 8 investor/firm agents (Millennium, Citadel, Jane Street, HRT, Optiver, Jump, Druckenmiller, ARK/Cathie Wood) — all pre-existing deferrals from `docs/PHASE_1A_SCOPE_LOCK.md`/`docs/NEXT_PHASE.md`, unaffected by and unrelated to this pivot.
