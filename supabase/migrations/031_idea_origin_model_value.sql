-- 031_idea_origin_model_value
-- Standalone (ALTER TYPE ... ADD VALUE cannot share a transaction with
-- anything that uses the new value). A baseline/experiment prediction
-- must never be frozen with origin='PMNTX_CORE' — src/lib/pmntx-meta's
-- eligibility check (isEligibleForMeta) auto-admits anything with that
-- exact origin into Meta consensus with no other gate, which would wrongly
-- surface an ML model's shadow prediction as if it were Core's own. This
-- new value gives model-origin predictions a distinct, correctly-excluded
-- identity.
alter type idea_origin add value 'ML_MODEL';
