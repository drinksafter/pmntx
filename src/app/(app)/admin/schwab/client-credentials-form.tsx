"use client";

import { useActionState } from "react";

import { saveSchwabClientCredentialsAction, type SchwabActionState } from "./actions";

const initialState: SchwabActionState = { error: null };

export function ClientCredentialsForm({ hasCredentials }: { hasCredentials: boolean }) {
  const [state, formAction, pending] = useActionState(saveSchwabClientCredentialsAction, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-border p-4">
      <h2 className="mb-1 font-mono text-sm font-bold">APP CREDENTIALS</h2>
      <p className="mb-4 text-xs text-neutral-500">
        From your app&apos;s page at developer.schwab.com/dashboard/apps, once it shows &quot;Ready for
        Use.&quot; These are the app-level Client ID/Secret — separate from the account authorization
        below, and required before &quot;Connect&quot; will work.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="clientId" className="mb-1 block text-xs font-medium text-neutral-400">
            Client ID (App Key)
          </label>
          <input
            id="clientId"
            name="clientId"
            type="password"
            autoComplete="off"
            placeholder={hasCredentials ? "Rotate…" : "Paste…"}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label htmlFor="clientSecret" className="mb-1 block text-xs font-medium text-neutral-400">
            Client Secret
          </label>
          <input
            id="clientSecret"
            name="clientSecret"
            type="password"
            autoComplete="off"
            placeholder={hasCredentials ? "Rotate…" : "Paste…"}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {state.error ? <p className="mt-3 text-sm text-accent-short">{state.error}</p> : null}
      {state.success ? <p className="mt-3 text-sm text-accent-long">Saved.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="focus-ring mt-4 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : hasCredentials ? "Rotate credentials" : "Save credentials"}
      </button>
    </form>
  );
}
