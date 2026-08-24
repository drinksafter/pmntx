"use client";

import { useState } from "react";

import { setPaidAiKillSwitchAction } from "@/lib/ai/budget-actions";
import { BRAND_NAME } from "@/lib/branding";

export function KillSwitch({ enabled, reason }: { enabled: boolean; reason: string | null }) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (enabled) {
    return (
      <div className="mb-6 rounded-lg border border-accent-short bg-accent-short/10 p-4">
        <p className="font-mono text-sm font-bold text-accent-short">PAID AI DISABLED</p>
        {reason ? <p className="mt-1 text-xs text-neutral-400">{reason}</p> : null}
        <form action={setPaidAiKillSwitchAction} className="mt-3">
          <input type="hidden" name="disabled" value="false" />
          <button
            type="submit"
            className="focus-ring rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-900"
          >
            Re-enable paid AI
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-sm font-semibold">Paid AI is enabled</p>
          <p className="mt-1 text-xs text-neutral-500">
            Deterministic {BRAND_NAME} (ingestion, Hunters, ranking) is unaffected by this switch
            either way.
          </p>
        </div>
        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="focus-ring rounded-md border border-accent-short px-3 py-1.5 text-xs font-semibold text-accent-short hover:bg-accent-short/10"
          >
            Disable all paid AI
          </button>
        ) : null}
      </div>

      {showConfirm ? (
        <form action={setPaidAiKillSwitchAction} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="disabled" value="true" />
          <input
            type="text"
            name="reason"
            placeholder="Reason (optional)"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white outline-none focus:border-neutral-400"
          />
          <button
            type="submit"
            className="focus-ring rounded-md bg-accent-short px-3 py-1.5 text-xs font-semibold text-white"
          >
            Confirm disable
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="focus-ring rounded-md border border-border px-3 py-1.5 text-xs text-neutral-400"
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}
