// Base URLs per docs/SCHWAB_INTEGRATION.md — the commonly-documented
// value across third-party clients (schwab-py, sudowealth/schwab-api),
// NOT independently confirmed against the primary docs (developer.schwab.com
// blocks automated fetches). Env-overridable so a wrong guess doesn't
// require a code change to fix once verified against a real registered app.
export const SCHWAB_API_BASE_URL = process.env.SCHWAB_API_BASE_URL ?? "https://api.schwabapi.com";
export const SCHWAB_AUTH_BASE_URL = process.env.SCHWAB_AUTH_BASE_URL ?? "https://api.schwabapi.com/v1/oauth";

// schwab-py / community sources: access tokens ~30min, refresh tokens
// ~7 days with a hard limit (cannot be extended). Refresh proactively
// well before either boundary.
export const ACCESS_TOKEN_LIFETIME_SECONDS = 30 * 60;
export const REFRESH_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

// Commonly cited across third-party clients, unverified against Schwab's
// own current published limit (see docs/SCHWAB_INTEGRATION.md §6) — throttle
// well under it.
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 120;
export const CONSERVATIVE_REQUESTS_PER_MINUTE = 60;
