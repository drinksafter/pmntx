"use client";

import { useActionState } from "react";

import { promoteModelVersionAction, type ModelActionState } from "./actions";

const initialState: ModelActionState = { error: null };

const STATUSES = ["VALIDATED", "SHADOW", "PAPER", "PRODUCTION", "RETIRED"] as const;

export function PromoteForm({ versionId, currentStatus }: { versionId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState(promoteModelVersionAction, initialState);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="modelVersionId" value={versionId} />
      <select name="toStatus" defaultValue={currentStatus} className="rounded border border-border bg-transparent px-2 py-1 text-xs">
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="reason"
        placeholder="Reason (required)"
        className="focus-ring rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="focus-ring rounded border border-border px-2 py-1 text-xs font-semibold hover:text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Update status"}
      </button>
      {state.error ? <span className="text-xs text-accent-short">{state.error}</span> : null}
      {state.success ? <span className="text-xs text-accent-long">Updated.</span> : null}
    </form>
  );
}
