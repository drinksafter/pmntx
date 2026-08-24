import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildAuthorizationUrl } from "@/lib/integrations/schwab/oauth";

export const SCHWAB_OAUTH_STATE_COOKIE = "schwab_oauth_state";

// Starts the Schwab OAuth flow — the "Connect" button in Admin -> System ->
// Schwab links here. Redirects the admin's browser to Schwab's own hosted
// login/consent page; PMNTx never sees Schwab credentials. Generates a
// random CSRF state nonce, stored in a short-lived httpOnly cookie and
// verified against the callback's own `state` query param (see
// ../callback/route.ts) — without this, a forged callback with someone
// else's authorization code could otherwise be accepted.
export async function GET() {
  await requireAdmin();

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;
  const state = randomBytes(24).toString("hex");

  try {
    const authorizationUrl = await buildAuthorizationUrl(redirectUri, state);

    const cookieStore = await cookies();
    cookieStore.set(SCHWAB_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for a login redirect round-trip
      path: "/api/schwab",
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start the Schwab OAuth flow.";
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/schwab?error=${encodeURIComponent(message)}`
    );
  }
}
