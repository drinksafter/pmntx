# Schwab Integration — Verified API Capabilities & Setup

Researched against developer.schwab.com and corroborating primary-adjacent sources (`developer.schwab.com` itself returned HTTP 403 to automated fetches — likely bot protection — so several details below are sourced from `schwab-py`, a widely-used, actively-maintained unofficial Python wrapper whose maintainers track the official docs closely, cross-checked against multiple independent write-ups). Where a detail could not be independently confirmed, it's marked **unverified — confirm in your own developer.schwab.com app dashboard**, not presented as fact.

This document covers **read-only market data and account data only**. Trading endpoints are documented for awareness in §7, but PMNTx does not implement them — see `docs/NEXT_PHASE.md` for the future `SchwabBrokerProvider` plan.

## 1. What Schwab actually is, for this purpose

Schwab's developer offering is the **Schwab Trader API** (the successor to TD Ameritrade's developer API, migrated after the Schwab/TDA merger). It's aimed at self-directed retail traders building personal tools, not an institutional market-data vendor — this shapes several of the constraints below (loopback OAuth patterns in most sample code, per-individual app registration, modest rate limits).

Portal: `developer.schwab.com` (dashboard at `/dashboard/apps`).

## 2. App registration & entitlements

- Register as an **individual developer** (no company required) at developer.schwab.com.
- When creating an app, choose one or both **API products**:
  - **Market Data Production** — quotes, price history, movers, market hours, options chains, instrument search. No brokerage account required to use.
  - **Accounts and Trading Production** — account balances, positions, orders, transactions. Requires linking a real Schwab brokerage account you (or your organization) control.
- New apps enter an **"Approved – Pending"** status and take **a few days** of manual review before becoming **"Ready for Use."** This is not instant — plan for a multi-day lead time before any real call can succeed.
- Registration produces a **Client ID ("App Key")** and **Client Secret** — these are what PMNTx needs, entered through Admin, never here.

## 3. OAuth 2.0 flow (verified via schwab-py + community write-ups)

Three-legged authorization-code flow:

1. Redirect the user to Schwab's hosted login/consent page.
2. User authenticates directly with Schwab (PMNTx never sees Schwab credentials) and approves account access.
3. Schwab redirects back to **your app's registered callback URL** with an authorization code in the query string.
4. Your server exchanges that code for an **access token** + **refresh token**.

**Callback URL**: must be HTTPS, must match your Developer Portal app configuration *exactly* (including trailing slash — a mismatch fails with a security error), and must respond within ~30 seconds. Most personal/local sample tooling (schwab-py, and various open-source wrappers) uses `https://127.0.0.1:<port>` because they're built for a developer running a script on their own machine with a self-signed cert. **That pattern does not apply to PMNTx** — as a hosted web app, PMNTx registers its own real public HTTPS callback (`${NEXT_PUBLIC_APP_URL}/api/schwab/callback`), the same pattern already used for Supabase's auth callback. For local development against a real Schwab app, you'll need either a temporary public tunnel (e.g. ngrok) or a locally-registered `127.0.0.1` app used only for dev.

**Token lifetimes** (schwab-py, corroborated by multiple sources):
- Access token: **~30 minutes**.
- Refresh token: **~7 days, hard limit — cannot be extended.** If unused for 7 days, the refresh call itself fails (`invalid_client`) and the user must fully re-authenticate from step 1. This is the single most operationally important constraint: a connection left completely idle for a week silently goes stale and needs manual reconnection, not just an automated refresh.

## 4. Market data capabilities (Market Data Production)

| Capability | Notes |
|---|---|
| Real-time quotes (multi-symbol) | Last price, bid/ask, volume, quote timestamp |
| Price history / bars | Minute through weekly granularity; per-minute history limited to recent history (~48 days per schwab-py); daily/weekly extends much further back for many symbols |
| Options chains | Full chain with strategy filters |
| Market movers | Top movers per index |
| Market hours | Equity, option, bond, futures, forex |
| Instrument search | Symbol/CUSIP lookup |
| Streaming | WebSocket-based real-time streaming exists as a separate capability from the REST endpoints above — **not implemented by PMNTx in this pass**; polling via REST quotes is what's built now |

## 5. Account data capabilities (Accounts and Trading Production)

| Capability | Notes |
|---|---|
| Account numbers → account hashes | Schwab does not accept raw account numbers in most API calls — you first call an endpoint that maps your real account number(s) to an opaque **account hash**, then use that hash everywhere else. This is Schwab's own privacy mechanism, and PMNTx additionally masks the raw account number anywhere it's displayed (§7 of the build brief) |
| Balances | Cash, buying power |
| Positions | Symbol, quantity, average cost, current market value where available |
| Orders / transactions | Full read access to order and transaction history |
| User preferences | Account-level settings |

## 6. Rate limits

Commonly cited across third-party clients: **~120 requests/minute**. This is **unverified — confirm the current figure in your own app's dashboard once registered**; Schwab does not appear to publish a single canonical number in generally-accessible documentation, and limits may differ by product/endpoint. PMNTx's client throttles conservatively below this regardless.

## 7. Trading endpoints (documented for awareness only — NOT implemented)

The Accounts and Trading product also exposes: place order, replace order, cancel order, across equities and options. **None of this is implemented in PMNTx.** See `docs/NEXT_PHASE.md` for the `SchwabBrokerProvider` architecture placeholder and the required future flow (Research → Risk Engine → Portfolio Engine → Proposed Order → Execution Policy → human approval → SchwabBrokerProvider) before any order-placement code is ever written.

## 8. What PMNTx needs from you to connect a real account

1. Register an individual developer app at developer.schwab.com, requesting both API products.
2. Wait for "Ready for Use" status (a few days).
3. In PMNTx, go to **Admin → System → Integrations → Charles Schwab** and enter the **Client ID** and **Client Secret** from your Schwab app.
4. Register `${NEXT_PUBLIC_APP_URL}/api/schwab/callback` as the app's callback URL in the Schwab Developer Portal (exact match required).
5. Click **Connect** in Admin — this starts the OAuth flow; you'll authenticate directly with Schwab, never with PMNTx.
6. PMNTx stores the resulting tokens encrypted, and will prompt for reauthorization automatically once the 7-day refresh window is at risk of lapsing.

## 9. Real account validation — DEFERRED

As of this writing, **no real Schwab account has been connected to PMNTx.** Everything in §§1-9 is implemented and has been exercised against mocked/fixture HTTP responses only (`schwab_validation_runs` records these as `MOCK` per component — see Admin → System → Schwab for the live status grid). This is a deliberate, intermediate state, not an error: the read-only integration (OAuth, market data, account data) and the `SchwabBrokerProvider` execution-policy framework were both built and tested without requiring the user's real account, per an explicit build directive. Nothing below should be started until the user decides to connect a real account in a separate, later step.

### What real-account validation will require

1. **A registered Schwab developer app**, "Ready for Use" status (see §2 — a few days of manual review after registration).
2. **Client ID and Client Secret** entered via **Admin → System → Schwab** (never in chat, never committed to Git — the existing encrypted-credential-storage path already built handles this).
3. **The callback URL registered exactly**: `${NEXT_PUBLIC_APP_URL}/api/schwab/callback`, matching what's registered in the Schwab Developer Portal (§8).
4. **Account authorization**: clicking Connect in Admin starts the real OAuth flow; the user authenticates directly with Schwab (never with PMNTx), and Schwab redirects back with an authorization code that PMNTx exchanges for tokens.

### What "LIVE-VALIDATED" means and how it's guaranteed honest

`schwab_validation_runs.mode = 'LIVE'` is written only from inside the three genuine production entry points — the OAuth callback route, the Admin "Sync accounts" action, and the market-data ingestion router (see `src/lib/integrations/schwab/live-context.ts`) — via an `AsyncLocalStorage` context that a test script calling the provider functions directly never enters. A mock/fixture test can call `exchangeCodeForTokens`, `getQuotes`, `syncAccounts`, etc. directly and get `PASSED`/`FAILED` results, but it structurally cannot cause a `LIVE` row to be written, because it never runs inside that context. This was verified directly: a first draft of the OAuth/market-data/account-data mock harness did (accidentally, before this guard existed) write real `LIVE` rows purely by calling the shared provider functions with a mocked `fetch` — that gap is exactly what `live-context.ts` closes, and the fixed harness now asserts as a permanent regression check that a fully-mocked run writes zero `LIVE` rows.

### Tests to run once a real account is connected

- **OAuth**: real authorize-URL redirect, real consent screen, real callback with a real authorization code, real token exchange, confirm `schwab_connection.status` becomes `CONNECTED` with real (encrypted) tokens, confirm the ~30 min access / ~7 day refresh lifetimes hold, force a real refresh near expiry, confirm reauthorization is correctly required once the 7-day refresh window lapses, confirm Disconnect revokes PMNTx's local session.
- **Market data**: real quotes for a handful of liquid, well-known symbols, confirm bid/ask/last/volume/timestamp look sane against a second real source, confirm freshness classifies as LIVE during market hours and DELAYED/STALE appropriately outside them, real daily price history for at least one symbol.
- **Account data**: real account discovery (masked correctly — only last 4 digits ever visible in PMNTx), real balances/buying power/positions for the connected account(s), confirm figures match Schwab's own UI at time of sync.
- **Broker/execution layer** (once `SchwabBrokerProvider` exists — see `docs/NEXT_PHASE.md`): PAPER mode against the real market-data feed but never a real order; only after extensive PAPER-mode validation would STAGED/HUMAN_APPROVAL modes be considered, and only with explicit, separate user approval — this document does not authorize that step.

None of the above should be attempted without the user explicitly initiating it in a later, separate session.

## 10. Sources

- [Charles Schwab Developer Portal](https://developer.schwab.com/) (portal itself blocks automated fetches; used for product/registration facts corroborated elsewhere)
- [schwab-py — Authentication and Client Creation](https://schwab-py.readthedocs.io/en/latest/auth.html)
- [schwab-py — HTTP Client](https://schwab-py.readthedocs.io/en/latest/client.html)
- [The (Unofficial) Guide to Charles Schwab's Trader APIs — Medium](https://medium.com/@carstensavage/the-unofficial-guide-to-charles-schwabs-trader-apis-14c1f5bc1d57)
- [sudowealth/schwab-api (TypeScript client)](https://github.com/sudowealth/schwab-api)
- [Schwab Trader API — Grokipedia](https://grokipedia.com/page/Schwab_Trader_API)
