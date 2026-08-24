import "server-only";

import { decryptCredential, encryptCredential } from "@/lib/credentials/encryption";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SchwabConnectionStatus } from "@/lib/supabase/types";

import { REFRESH_TOKEN_LIFETIME_SECONDS, SCHWAB_AUTH_BASE_URL } from "./config";
import { isLiveSchwabInvocation } from "./live-context";
import { recordValidation } from "./validation";

/** Records a LIVE validation outcome only when reached through a genuine production entry point — see live-context.ts. */
async function recordLiveOauth(result: "PASSED" | "FAILED", detail?: Record<string, unknown>): Promise<void> {
  if (!isLiveSchwabInvocation()) return;
  await recordValidation("OAUTH", "LIVE", result, detail);
}

export type SchwabConnectionSummary = {
  status: SchwabConnectionStatus;
  hasClientCredentials: boolean;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  refreshExpiresWithin24h: boolean;
  connectedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastMarketDataRequestAt: string | null;
  lastAccountDataRequestAt: string | null;
};

/** Admin-facing connection status — never returns token values, only metadata about them. */
export async function getConnectionSummary(): Promise<SchwabConnectionSummary> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("schwab_connection").select("*").eq("id", true).single();

  const refreshExpiresAt = data?.refresh_token_expires_at ? new Date(data.refresh_token_expires_at) : null;
  const refreshExpiresWithin24h = refreshExpiresAt ? refreshExpiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000 : false;

  return {
    status: data?.status ?? "DISCONNECTED",
    hasClientCredentials: !!data?.encrypted_client_id && !!data?.encrypted_client_secret,
    accessTokenExpiresAt: data?.access_token_expires_at ?? null,
    refreshTokenExpiresAt: data?.refresh_token_expires_at ?? null,
    refreshExpiresWithin24h,
    connectedAt: data?.connected_at ?? null,
    lastError: data?.last_error ?? null,
    lastErrorAt: data?.last_error_at ?? null,
    lastMarketDataRequestAt: data?.last_market_data_request_at ?? null,
    lastAccountDataRequestAt: data?.last_account_data_request_at ?? null,
  };
}

/** Saves the app-level Client ID/Secret from Schwab Developer Portal app registration. Does not start the OAuth flow. */
export async function saveClientCredentials(clientId: string, clientSecret: string, adminProfileId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("schwab_connection")
    .update({
      encrypted_client_id: encryptCredential(clientId),
      encrypted_client_secret: encryptCredential(clientSecret),
      client_credentials_set_at: new Date().toISOString(),
      client_credentials_set_by: adminProfileId,
    })
    .eq("id", true);
  if (error) throw error;
}

async function loadClientCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("schwab_connection")
    .select("encrypted_client_id, encrypted_client_secret")
    .eq("id", true)
    .single();
  if (!data?.encrypted_client_id || !data?.encrypted_client_secret) return null;
  return {
    clientId: decryptCredential(data.encrypted_client_id),
    clientSecret: decryptCredential(data.encrypted_client_secret),
  };
}

/**
 * Builds the URL to redirect the admin's browser to for Schwab's hosted
 * login/consent page. Throws if Client ID isn't configured yet. `state`
 * is the CSRF-protection nonce — the caller generates it, stores it
 * server-side (a short-lived cookie; see src/app/api/schwab/authorize),
 * and must verify the callback's `state` query param matches before
 * trusting the returned authorization code.
 */
export async function buildAuthorizationUrl(redirectUri: string, state: string): Promise<string> {
  const credentials = await loadClientCredentials();
  if (!credentials) {
    throw new Error("Schwab Client ID/Secret are not configured yet — set them in Admin → System → Schwab first.");
  }

  const url = new URL(`${SCHWAB_AUTH_BASE_URL}/authorize`);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
};

/** Exchanges an OAuth authorization code (from the callback query string) for an access/refresh token pair, and stores them encrypted. */
export async function exchangeCodeForTokens(code: string, redirectUri: string, adminProfileId: string): Promise<void> {
  const credentials = await loadClientCredentials();
  if (!credentials) {
    throw new Error("Schwab Client ID/Secret are not configured — cannot complete the OAuth exchange.");
  }

  const supabase = createServiceRoleClient();
  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`${SCHWAB_AUTH_BASE_URL}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error during token exchange.";
    await recordError(message);
    await recordLiveOauth("FAILED", { stage: "exchange", message });
    throw new Error(message);
  }

  if (!response.ok) {
    const body = await response.text();
    const message = `Schwab token exchange failed: HTTP ${response.status} ${body.slice(0, 300)}`;
    await recordError(message);
    await recordLiveOauth("FAILED", { stage: "exchange", status: response.status });
    throw new Error(message);
  }

  const tokens = (await response.json()) as TokenResponse;
  const now = Date.now();

  const { error } = await supabase
    .from("schwab_connection")
    .update({
      status: "CONNECTED",
      encrypted_access_token: encryptCredential(tokens.access_token),
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      encrypted_refresh_token: encryptCredential(tokens.refresh_token),
      refresh_token_expires_at: new Date(now + REFRESH_TOKEN_LIFETIME_SECONDS * 1000).toISOString(),
      scope: tokens.scope ?? null,
      connected_at: new Date().toISOString(),
      connected_by: adminProfileId,
      last_error: null,
      last_error_at: null,
    })
    .eq("id", true);
  if (error) throw error;

  await recordLiveOauth("PASSED", { stage: "exchange" });
}

/**
 * Returns a valid access token, refreshing it first if it's expired or
 * close to expiring. Returns null (never throws) if disconnected or the
 * refresh token itself has lapsed — callers must treat that as
 * "reauthorization required," not retry indefinitely.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("schwab_connection").select("*").eq("id", true).single();

  if (!data || data.status === "DISCONNECTED" || !data.encrypted_access_token || !data.encrypted_refresh_token) {
    return null;
  }

  const accessExpiresAt = data.access_token_expires_at ? new Date(data.access_token_expires_at).getTime() : 0;
  const stillValid = accessExpiresAt - Date.now() > 60_000; // refresh 60s before actual expiry
  if (stillValid) return decryptCredential(data.encrypted_access_token);

  const refreshExpiresAt = data.refresh_token_expires_at ? new Date(data.refresh_token_expires_at).getTime() : 0;
  if (refreshExpiresAt <= Date.now()) {
    await supabase
      .from("schwab_connection")
      .update({ status: "EXPIRED", last_error: "Refresh token has passed its 7-day hard limit — reauthorization required.", last_error_at: new Date().toISOString() })
      .eq("id", true);
    return null;
  }

  const credentials = await loadClientCredentials();
  if (!credentials) return null;

  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const refreshToken = decryptCredential(data.encrypted_refresh_token);

  let response: Response;
  try {
    response = await fetch(`${SCHWAB_AUTH_BASE_URL}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error during token refresh.";
    await recordError(message);
    await recordLiveOauth("FAILED", { stage: "refresh", message });
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    await recordError(`Schwab token refresh failed: HTTP ${response.status} ${body.slice(0, 300)}`);
    await supabase.from("schwab_connection").update({ status: "ERROR" }).eq("id", true);
    await recordLiveOauth("FAILED", { stage: "refresh", status: response.status });
    return null;
  }

  const tokens = (await response.json()) as TokenResponse;
  const now = Date.now();

  await supabase
    .from("schwab_connection")
    .update({
      status: "CONNECTED",
      encrypted_access_token: encryptCredential(tokens.access_token),
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      // Schwab may or may not rotate the refresh token on every refresh;
      // if it did, store the new one, otherwise keep the existing one and
      // its original 7-day window.
      encrypted_refresh_token: tokens.refresh_token ? encryptCredential(tokens.refresh_token) : data.encrypted_refresh_token,
      last_error: null,
      last_error_at: null,
    })
    .eq("id", true);

  await recordLiveOauth("PASSED", { stage: "refresh" });
  return tokens.access_token;
}

/** Revokes the local connection (does not call a Schwab revocation endpoint — none is confirmed in docs/SCHWAB_INTEGRATION.md; this clears PMNTx's own stored tokens). */
export async function disconnect(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("schwab_connection")
    .update({
      status: "DISCONNECTED",
      encrypted_access_token: null,
      access_token_expires_at: null,
      encrypted_refresh_token: null,
      refresh_token_expires_at: null,
      scope: null,
      connected_at: null,
      connected_by: null,
    })
    .eq("id", true);
  if (error) throw error;
}

async function recordError(message: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("schwab_connection")
    .update({ last_error: message, last_error_at: new Date().toISOString() })
    .eq("id", true);
}
