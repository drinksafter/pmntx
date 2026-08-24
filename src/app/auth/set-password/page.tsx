"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/branding";

type LinkStatus = "verifying" | "ready" | "invalid";

// Landing page for Supabase recovery/invite links. Those links deliver the
// session via URL fragment (#access_token=...&refresh_token=...), which
// only client-side JS can read — a server route handler never sees it,
// since fragments aren't sent over HTTP.
//
// This parses the fragment itself and calls setSession() explicitly,
// rather than relying solely on the SDK's automatic detectSessionInUrl:
// that runs asynchronously the moment the client is constructed and
// historically raced with this page's own effects (see prior commits).
// Explicit parsing also lets a real Supabase-reported error
// (#error=...&error_code=...) surface as-is instead of a generic message,
// so "the link genuinely expired" and "the client-side handling is buggy"
// aren't indistinguishable.
export default function SetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("verifying");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);

      const hashError = params.get("error_description") ?? params.get("error");
      if (hashError) {
        if (!cancelled) {
          setLinkError(decodeURIComponent(hashError.replace(/\+/g, " ")));
          setLinkStatus("invalid");
        }
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Remove the tokens from the visible URL/history regardless of outcome.
        window.history.replaceState(null, "", window.location.pathname);

        if (cancelled) return;
        if (setSessionError) {
          setLinkError(setSessionError.message);
          setLinkStatus("invalid");
        } else {
          setLinkStatus("ready");
        }
        return;
      }

      // No tokens and no error in the hash — maybe a session already
      // exists from a previous successful load of this same link.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setLinkStatus("ready");
      } else {
        setLinkError(null);
        setLinkStatus("invalid");
      }
    }

    establishSession();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 font-mono text-lg font-bold tracking-tight">SET YOUR PASSWORD</h1>

        {linkStatus === "verifying" ? (
          <p className="text-sm text-neutral-500">Verifying your link…</p>
        ) : linkStatus === "invalid" ? (
          <p role="alert" className="text-sm text-red-400">
            {linkError
              ? `Link error: ${linkError}`
              : "This link is invalid, expired, or already used."}{" "}
            Recovery links are single-use — ask for a new one.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-neutral-500">
              Choose a password for your {BRAND_NAME} account.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-400">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-1 block text-xs font-medium text-neutral-400"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-400"
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-md bg-white py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {pending ? "Saving…" : "Set password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
