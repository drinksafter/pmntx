import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";

/**
 * Browser-side Supabase client. Uses the public anon key only — never the
 * service role key, which must never reach client code. Row-level security
 * is the enforcement boundary for anything reached through this client.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
