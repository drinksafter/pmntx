import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildAuthorizationUrl } from "@/lib/integrations/schwab/oauth";

// Starts the Schwab OAuth flow — the "Connect" button in Admin -> System ->
// Schwab links here. Redirects the admin's browser to Schwab's own hosted
// login/consent page; PMNTx never sees Schwab credentials.
export async function GET() {
  await requireAdmin();

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/schwab/callback`;

  try {
    const authorizationUrl = await buildAuthorizationUrl(redirectUri);
    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start the Schwab OAuth flow.";
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/schwab?error=${encodeURIComponent(message)}`
    );
  }
}
