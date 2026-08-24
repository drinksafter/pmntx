-- 018_ai_model_pricing
-- ai_executions.estimated_cost_usd (008) needs a per-model $/1M-token rate
-- to compute from — adds it to ai_models rather than hardcoding rates in
-- application code, so an admin can correct pricing without a deploy.
-- Seeds the two Phase 1A AI providers (ANTHROPIC, OPENAI) with one model
-- each and wires up ai_routes for every role_code Phase 1A actually calls
-- (docs/PHASE_1A_SCOPE_LOCK.md §1: blind/reveal analysis, Buffett/Compounder,
-- Gerstner/Technology Growth). Model codes and prices are best-effort
-- defaults — verify against the provider's current pricing page and correct
-- via SQL or a future Admin → AI Routing page before relying on cost figures.

alter table ai_models
  add column cost_input_per_million numeric(10, 4),
  add column cost_output_per_million numeric(10, 4);

update ai_providers set is_enabled = true where code in ('ANTHROPIC', 'OPENAI');

insert into ai_models (ai_provider_id, model_code, display_name, cost_input_per_million, cost_output_per_million)
select id, 'claude-sonnet-5', 'Claude Sonnet 5', 3.00, 15.00
from ai_providers where code = 'ANTHROPIC';

insert into ai_models (ai_provider_id, model_code, display_name, cost_input_per_million, cost_output_per_million)
select id, 'gpt-4o', 'GPT-4o', 2.50, 10.00
from ai_providers where code = 'OPENAI';

-- Blind analysis independence (brief §5's "two providers must not see each
-- other's output") is why BLIND_ANALYST and INDEPENDENT_BLIND_ANALYST are
-- pinned to different providers, not just different prompt versions.
insert into ai_routes (role_code, ai_model_id)
select 'BLIND_ANALYST', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'ANTHROPIC';
insert into ai_routes (role_code, ai_model_id)
select 'INDEPENDENT_BLIND_ANALYST', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'OPENAI';
insert into ai_routes (role_code, ai_model_id)
select 'REVEALED_ANALYST', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'ANTHROPIC';
insert into ai_routes (role_code, ai_model_id)
select 'RED_TEAM', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'OPENAI';
insert into ai_routes (role_code, ai_model_id)
select 'AGENT_BUFFETT', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'ANTHROPIC';
insert into ai_routes (role_code, ai_model_id)
select 'AGENT_GERSTNER', m.id from ai_models m
  join ai_providers p on p.id = m.ai_provider_id where p.code = 'OPENAI';
