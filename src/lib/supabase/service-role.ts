import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 *
 * `server-only` import guarantees a build error if any client bundle ever
 * tries to pull this in. Use ONLY for:
 *   - decrypting/using integration credentials (src/lib/credentials)
 *   - system-level writes that must not be gated by a user's RLS policies
 *     (e.g. writing Hunter results, freezing predictions from a cron job)
 *
 * Never use this client to serve a request on behalf of a specific user's
 * request unless you have independently verified their authorization —
 * this client has no concept of "the current user."
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not configured. " +
        "This is a bootstrap credential — see README.md."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
