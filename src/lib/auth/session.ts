import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

export type SessionUser = {
  id: string;
  email: string | null;
  role: UserRole;
  displayName: string | null;
};

/**
 * Loads the current user + their PMNTX role (from `profiles`, not just
 * Supabase auth metadata). Returns null if unauthenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("user_id", user.id)
    .single();

  // Middleware already guarantees a session exists for protected routes;
  // a missing profile row here means the handle_new_user trigger hasn't
  // run yet (race on very first sign-up) — default to USER rather than
  // failing the request.
  return {
    id: user.id,
    email: user.email ?? null,
    role: profile?.role ?? "USER",
    displayName: profile?.display_name ?? null,
  };
}

/** Use in Server Components/Actions that require any authenticated user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Use in Server Components/Actions that require the ADMIN role. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
