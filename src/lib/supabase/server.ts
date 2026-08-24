import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client for use in Server Components, Server
 * Actions, and Route Handlers. Uses the public anon key — RLS still
 * applies. For privileged operations that must bypass RLS (credential
 * decryption, admin writes), use `createServiceRoleClient` instead, and
 * only from server-only code paths.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (not an Action/Route Handler).
            // Middleware refreshes the session cookie on every request, so
            // this is safe to ignore here.
          }
        },
      },
    }
  );
}
