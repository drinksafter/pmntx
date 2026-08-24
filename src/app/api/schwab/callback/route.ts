import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { exchangeCodeForTokens } from "@/lib/integrations/schwab/oauth";

// Schwab's OAuth redirect target — see docs/SCHWAB_INTEGRATION.md §3 for
// why this must be registered as the app's exact callback URL in the
// Schwab Developer Portal (this real HTTPS route, not a 127.0.0.1
// loopback — that pattern is for local personal-trader tooling, not a
// hosted web app like PMNTx).
export async function GET(request: Request) {
  const admin = await requireAdmin();

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent("No authorization code returned by Schwab.")}`);
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;

  try {
    await exchangeCodeForTokens(code, redirectUri, admin.id);
    return NextResponse.redirect(`${origin}/admin/schwab?connected=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete the Schwab OAuth exchange.";
    return NextResponse.redirect(`${origin}/admin/schwab?error=${encodeURIComponent(message)}`);
  }
}
