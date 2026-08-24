"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type LinkStatus = "verifying" | "ready" | "invalid";

// Landing page for Supabase recovery/invite links. Those links deliver the
// session via URL fragment (#access_token=...), which only client-side JS
// can read — a server route handler never sees it, since fragments aren't
// sent over HTTP (see the commit that added this file). The Supabase JS
// SDK parses that fragment asynchronously the moment its client is
// constructed, so the client must be created on mount (not inside the
// submit handler) and the page must wait for that to finish before
// calling updateUser — otherwise it races the SDK and updateUser fails
// with "Auth session missing", even though the link itself was valid.
export default function SetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setLinkStatus("ready");
    });

    // Fallback in case the PASSWORD_RECOVERY event already fired before
    // this listener was attached, or the SDK finishes parsing the URL
    // without emitting that specific event.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkStatus("ready");
    });

    const timeout = setTimeout(() => {
      if (!cancelled) setLinkStatus((current) => (current === "verifying" ? "invalid" : current));
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
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
            This link is invalid, expired, or already used. Recovery links are single-use — ask
            for a new one.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-neutral-500">Choose a password for your PMNTX account.</p>

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
