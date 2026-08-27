-- 033_research_run_model_origin_enum
-- Standalone (ALTER TYPE ... ADD VALUE cannot share a transaction with
-- anything that uses the new value). Gives a bare quant/ML model's daily
-- research pass its own research_runs.origin_type, distinct from
-- PMNTX_CORE and AGENT — Morning Brief's queries already filter
-- explicitly on both of those values (src/lib/morning-brief/queries.ts),
-- so a MODEL-origin run is invisible there with zero code change.
alter type research_run_origin add value 'MODEL';
