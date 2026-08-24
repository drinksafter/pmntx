# Admin Integrations

How to configure each external service PMNTX integrates with, via Admin → System → Integrations (credentials) and Admin → System → Usage (AI budget limits and the kill switch).

## AI cost control is defense in depth, not a single layer

PMNTX's own gateway (`src/lib/ai/gateway.ts`) enforces budget/request/token/retry/time limits on every call before it reaches a provider. That's the primary control. The provider-side settings below are the **second, independent layer** — they protect you even if PMNTX's own guardrails have a bug, are misconfigured, or a database issue lets a request through that should have been blocked. Configure both; don't rely on either alone.

### OpenAI

- **Usage limits**: platform.openai.com → Settings → Limits. Set a monthly budget and a per-minute/per-day request cap independent of what PMNTX's own `ai_budget_limits` table enforces.
- **Billing alerts**: Settings → Billing → set an email alert threshold below your hard monthly cap, so you're notified before either PMNTX's or OpenAI's limit is reached.
- **API key scope**: create a project-scoped key (not an org-wide key) for PMNTX specifically, so a compromised key's blast radius is limited to this project.

### Anthropic

- **Usage/spend limits**: console.anthropic.com → Settings → Limits. Set a workspace spend limit.
- **Billing alerts**: configure email notifications for spend thresholds.
- **API key scope**: use a workspace-scoped key dedicated to PMNTX, same reasoning as OpenAI above.

### Telnyx

- Telnyx is part of the `AiProvider` abstraction (`src/lib/ai/providers/`) and has a seeded `ai_providers` row, but is **disabled by default** in Phase 1A (`is_enabled = false`, no route configured) — see `docs/PHASE_1A_SCOPE_LOCK.md`. Before an admin enables it and routes any role to it:
  - Set a spend/usage cap in the Telnyx portal, same as above.
  - Confirm PMNTX's `ai_budget_limits` are still appropriate for Telnyx's pricing, which may differ significantly from OpenAI/Anthropic per-token rates.

## Credential rotation

Every credential in `integration_credentials` is AES-256-GCM encrypted at rest (`src/lib/credentials/encryption.ts`) and never re-displayed after saving — rotating means pasting a new value in Admin → System → Integrations, not editing the old one. If a key is ever exposed (committed to git, logged, shared in plaintext), rotate it at the provider first, then update it in PMNTX — in that order, so there's no window where the old leaked key is still live.

## AI budget limits — what "fail closed" means here

If `ai_budget_limits` has no GLOBAL row, or a query needed to evaluate a limit fails for any reason, the gateway treats every configurable limit as **zero** (nothing allowed) rather than unlimited. A misconfigured or partially-broken budget system blocks AI spend; it never silently permits unrestricted spend. If paid AI stops working unexpectedly, check Admin → System → Usage for a `BLOCKED_*` event before assuming a provider outage.

## Global kill switch

Admin → System → Usage → "Disable all paid AI" stops every future AI call immediately (checked first, before any other gateway logic). It does not cancel a request already in flight. Deterministic PMNTX — data ingestion, Hunters, PMNTX Core ranking, the Prediction Warehouse, outcome resolution — is unaffected either way; only paid inference (blind/reveal analysis, agents) stops.
