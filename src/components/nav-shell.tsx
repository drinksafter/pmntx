import Link from "next/link";

import { signOut } from "@/lib/auth/actions";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Primary navigation. Trimmed to what Phase 1A actually ships — see
 * docs/PHASE_1A_SCOPE_LOCK.md §3 for the full list of nav destinations
 * (Opportunities, Agent Desk, Watchlists, Portfolio, Edge Lab, Ask PMNTX,
 * etc.) deferred to docs/NEXT_PHASE.md. Don't add a nav item here without
 * a page behind it.
 */
export function NavShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="focus-ring font-mono text-sm font-bold tracking-tight">
              PMNTX
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
              <Link href="/" className="focus-ring text-neutral-400 hover:text-white">
                Today
              </Link>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className="focus-ring text-neutral-400 hover:text-white"
                >
                  System
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>{user.email}</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono uppercase">
              {user.role}
            </span>
            <form action={signOut}>
              <button type="submit" className="focus-ring hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
