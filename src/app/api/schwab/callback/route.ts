import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { runAsLiveSchwabCall } from "@/lib/integrations/schwab/live-context";
import { exchangeCodeForTokens } from "@/lib/integrations/schwab/oauth";

import { SCHWAB_OAUTH_STATE_COOKIE } from "../authorize/route";

// Schwab's OAuth redirect target — see docs/SCHWAB_INTEGRATION.md §3 for
// why this must be registered as the app's exact callback URL in the
// Schwab Developer Portal (this real HTTPS route, not a 127.0.0.1
// loopback — that pattern is for local personal-trader tooling, not a
// hosted web app like PMNTx).
export async function GET(request: Request) {
  const admin = await requireAdmin();

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(SCHWAB_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(SCHWAB_OAUTH_STATE_COOKIE);

  if (oauthError) {
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent("No authorization code returned by Schwab.")}`);
  }
  if (!expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(
      `${origin}/admin/schwab?error=${encodeURIComponent("OAuth state mismatch — possible CSRF attempt or an expired/reused login link. Try connecting again.")}`
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;

  try {
    await runAsLiveSchwabCall(() => exchangeCodeForTokens(code, redirectUri, admin.id));
    return NextResponse.redirect(`${origin}/admin/schwab?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete the Schwab OAuth exchange.";
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent(message)}`);
  }
}
