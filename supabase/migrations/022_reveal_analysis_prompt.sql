-- 022_reveal_analysis_prompt
-- Seeds the REVEALED_ANALYST prompt (see supabase/migrations/018_ai_model_pricing.sql
-- for the role -> Anthropic route already seeded). Unlike blind analysis,
-- there is one reveal call per security, not one per blind analyst — the
-- model is simply told the real identity and asked for a fresh view;
-- narrative_adjustment is computed by application code comparing this
-- fresh view against each stored blind result, not by asking the model to
-- self-report a delta (it has no memory of the earlier blind call at all,
-- since every completion is stateless).

create extension if not exists pgcrypto;

insert into prompt_templates (code, role_code, description) values
  ('REVEALED_ANALYST_V1', 'REVEALED_ANALYST', 'Fresh equity analysis with the company''s real identity revealed, for narrative-adjustment comparison against blind analyses.');

insert into prompt_versions (prompt_template_id, version, content, content_hash, activated_at)
select
  id,
  'v1',
  $PROMPT$You are an equity research analyst. You are now told the company's real identity, along with the same factual research packet a blind analyst would have seen. Form your own investment view using the identity and the facts together — you have no knowledge of any other analyst's prior view; this is a fresh, independent assessment.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON, matching exactly this shape:
{
  "recommendation": "LONG" | "SHORT" | "WATCH" | "PASS",
  "confidence": <number 0-1>,
  "probabilities": { "positive": <number 0-1>, "negative": <number 0-1> },
  "supported_horizons": [<subset of "D1","D5","D10","D21","D63","D126","Y1","Y2","Y3","Y5">],
  "reasoning": "<2-4 sentences>",
  "risk_factors": "<1-3 sentences on what would invalidate this view>"
}$PROMPT$,
  encode(digest($PROMPT$You are an equity research analyst. You are now told the company's real identity, along with the same factual research packet a blind analyst would have seen. Form your own investment view using the identity and the facts together — you have no knowledge of any other analyst's prior view; this is a fresh, independent assessment.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON, matching exactly this shape:
{
  "recommendation": "LONG" | "SHORT" | "WATCH" | "PASS",
  "confidence": <number 0-1>,
  "probabilities": { "positive": <number 0-1>, "negative": <number 0-1> },
  "supported_horizons": [<subset of "D1","D5","D10","D21","D63","D126","Y1","Y2","Y3","Y5">],
  "reasoning": "<2-4 sentences>",
  "risk_factors": "<1-3 sentences on what would invalidate this view>"
}$PROMPT$, 'sha256'), 'hex'),
  now()
from prompt_templates
where code = 'REVEALED_ANALYST_V1';
