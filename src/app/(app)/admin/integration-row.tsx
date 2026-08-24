"use client";

import { useActionState } from "react";

import {
  saveCredentialAction,
  toggleCredentialAction,
  type CredentialActionState,
} from "@/lib/credentials/actions";
import type { IntegrationStatusRow } from "@/lib/credentials/store";

const HEALTH_STYLES: Record<IntegrationStatusRow["health"], string> = {
  NOT_CONFIGURED: "text-neutral-500 border-neutral-700",
  OK: "text-accent-long border-accent-long/40",
  DEGRADED: "text-accent-watch border-accent-watch/40",
  ERROR: "text-accent-short border-accent-short/40",
};

const initialState: CredentialActionState = { error: null };

export function IntegrationRow({ integration }: { integration: IntegrationStatusRow }) {
  const [state, formAction, pending] = useActionState(saveCredentialAction, initialState);

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{integration.displayName}</span>
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${HEALTH_STYLES[integration.health]}`}
            >
              {integration.health.replace("_", " ")}
            </span>
            {integration.isConfigured ? (
              <span className="text-[10px] uppercase text-neutral-500">
                {integration.isEnabled ? "enabled" : "disabled"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-xl text-xs text-neutral-500">{integration.purpose}</p>
          {integration.lastErrorMessage ? (
            <p className="mt-1 text-xs text-accent-short">{integration.lastErrorMessage}</p>
          ) : null}
          {integration.lastRotatedAt ? (
            <p className="mt-1 text-[11px] text-neutral-600">
              Last rotated {new Date(integration.lastRotatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        {integration.isConfigured ? (
          <form action={toggleCredentialAction}>
            <input type="hidden" name="service" value={integration.service} />
            <input type="hidden" name="isEnabled" value={(!integration.isEnabled).toString()} />
            <button
              type="submit"
              className="focus-ring rounded border border-border px-2 py-1 text-xs text-neutral-400 hover:text-white"
            >
              {integration.isEnabled ? "Disable" : "Enable"}
            </button>
          </form>
        ) : null}
      </div>

      <form action={formAction} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="service" value={integration.service} />
        <input
          type="password"
          name="value"
          placeholder={integration.isConfigured ? "Rotate credential…" : "Paste credential…"}
          autoComplete="off"
          className="w-72 max-w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={pending}
          className="focus-ring rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error ? <span className="text-xs text-accent-short">{state.error}</span> : null}
        {state.success ? <span className="text-xs text-accent-long">Saved.</span> : null}
      </form>
    </div>
  );
}
