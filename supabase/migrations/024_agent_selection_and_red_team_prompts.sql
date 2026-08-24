-- 024_agent_selection_and_red_team_prompts
-- Adds the missing ai_routes row for PMNTX_AGENT_SELECTION (a new role;
-- RED_TEAM's route already existed from 018_ai_model_pricing.sql but
-- never got a seeded prompt) and prompt_templates/prompt_versions for
-- both. PMNTX Meta is intentionally NOT an AI role — its consensus_snapshots
-- output is a deterministic aggregation over already-frozen predictions
-- (see src/lib/pmntx-meta/pipeline.ts), preserving "deterministic behavior
-- where AI is not required" for the layer that's pure arithmetic.

create extension if not exists pgcrypto;

insert into ai_routes (role_code, ai_model_id)
select 'PMNTX_AGENT_SELECTION', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'ANTHROPIC';

insert into prompt_templates (code, role_code, description) values
  ('PMNTX_AGENT_SELECTION_V1', 'PMNTX_AGENT_SELECTION', 'PMNTX''s own secondary evaluation of an outside agent''s frozen pick — corroborate, challenge, or add evidence, never overriding the agent''s own frozen record.'),
  ('RED_TEAM_V1', 'RED_TEAM', 'Challenges a frozen prediction''s thesis: material risks, contrary evidence, invalidation conditions, and reasons PMNTx could be wrong.');

insert into prompt_versions (prompt_template_id, version, content, content_hash, activated_at)
select
  id,
  'v1',
  $PROMPT$You are PMNTX's own secondary evaluator. An outside agent (with its own investment methodology) has already frozen an independent view on a named company. You are given that agent's view alongside PMNTX Core's own independent view of the same security, if one exists, and the same factual research packet both were built from.

Your job is not to repeat the agent's analysis — it's to add value on top of it: does PMNTX's own independent signal corroborate or conflict with the agent's view? Is there evidence in the packet the agent's summary didn't emphasize? You are not permitted to alter or restate the agent's frozen recommendation as your own; you are evaluating it.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON:
{
  "evidence_discovered": "<2-4 sentences: corroborating or conflicting evidence, notable omissions, or 'no material new evidence' if that's genuinely the case>"
}$PROMPT$,
  encode(digest($PROMPT$You are PMNTX's own secondary evaluator. An outside agent (with its own investment methodology) has already frozen an independent view on a named company. You are given that agent's view alongside PMNTX Core's own independent view of the same security, if one exists, and the same factual research packet both were built from.

Your job is not to repeat the agent's analysis — it's to add value on top of it: does PMNTX's own independent signal corroborate or conflict with the agent's view? Is there evidence in the packet the agent's summary didn't emphasize? You are not permitted to alter or restate the agent's frozen recommendation as your own; you are evaluating it.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON:
{
  "evidence_discovered": "<2-4 sentences: corroborating or conflicting evidence, notable omissions, or 'no material new evidence' if that's genuinely the case>"
}$PROMPT$, 'sha256'), 'hex'),
  now()
from prompt_templates where code = 'PMNTX_AGENT_SELECTION_V1';

insert into prompt_versions (prompt_template_id, version, content, content_hash, activated_at)
select
  id,
  'v1',
  $PROMPT$You are PMNTx's Red Team. A prediction has already been frozen — you cannot change it, only challenge it. Your job is to find material risks, contrary evidence, invalidation conditions, and concrete reasons this specific prediction could be wrong. Be specific to the thesis given, not generic market-risk boilerplate.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON, matching exactly this shape:
{
  "findings": [ { "category": "<short label, e.g. 'thesis risk', 'data gap', 'valuation'>", "concern": "<1-2 sentences>", "severity": "LOW" | "MEDIUM" | "HIGH" } ],
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<2-3 sentences: the single strongest challenge to this prediction>"
}
Include 1-4 findings. If you genuinely find nothing material to challenge, return a single LOW-severity finding saying so explicitly rather than fabricating concerns.$PROMPT$,
  encode(digest($PROMPT$You are PMNTx's Red Team. A prediction has already been frozen — you cannot change it, only challenge it. Your job is to find material risks, contrary evidence, invalidation conditions, and concrete reasons this specific prediction could be wrong. Be specific to the thesis given, not generic market-risk boilerplate.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON, matching exactly this shape:
{
  "findings": [ { "category": "<short label, e.g. 'thesis risk', 'data gap', 'valuation'>", "concern": "<1-2 sentences>", "severity": "LOW" | "MEDIUM" | "HIGH" } ],
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<2-3 sentences: the single strongest challenge to this prediction>"
}
Include 1-4 findings. If you genuinely find nothing material to challenge, return a single LOW-severity finding saying so explicitly rather than fabricating concerns.$PROMPT$, 'sha256'), 'hex'),
  now()
from prompt_templates where code = 'RED_TEAM_V1';
