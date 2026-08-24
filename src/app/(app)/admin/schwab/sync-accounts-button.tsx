"use client";

import { useActionState } from "react";

import { syncSchwabAccountsAction, type SchwabActionState } from "./actions";

const initialState: SchwabActionState = { error: null };

export function SyncAccountsButton() {
  const [state, formAction, pending] = useActionState(syncSchwabAccountsAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="focus-ring rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync accounts now"}
      </button>
      {state.error ? <span className="text-xs text-accent-short">{state.error}</span> : null}
      {state.success ? <span className="text-xs text-accent-long">Synced.</span> : null}
    </form>
  );
}
