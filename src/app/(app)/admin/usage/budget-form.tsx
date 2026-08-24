"use client";

import { useActionState } from "react";

import { updateGlobalBudgetLimitsAction, type BudgetActionState } from "@/lib/ai/budget-actions";
import type { BudgetLimitsRow } from "@/lib/ai/usage-queries";

const FIELDS: { key: keyof BudgetLimitsRow; label: string; unit: string }[] = [
  { key: "max_cost_per_run_usd", label: "Max spend per research run", unit: "USD" },
  { key: "max_cost_per_day_usd", label: "Max spend per day", unit: "USD" },
  { key: "max_cost_per_month_usd", label: "Max spend per month", unit: "USD" },
  { key: "max_cost_per_agent_per_day_usd", label: "Max spend per agent per day", unit: "USD" },
  { key: "max_cost_per_security_analysis_usd", label: "Max spend per security analysis", unit: "USD" },
  { key: "max_requests_per_workflow", label: "Max requests per workflow", unit: "requests" },
  { key: "max_requests_per_security", label: "Max requests per security", unit: "requests" },
  { key: "max_input_tokens_per_request", label: "Max input tokens per request", unit: "tokens" },
  { key: "max_output_tokens_per_request", label: "Max output tokens per request", unit: "tokens" },
  { key: "max_total_tokens_per_workflow", label: "Max total tokens per workflow", unit: "tokens" },
  { key: "max_retries_per_request", label: "Max retries per request", unit: "retries" },
  { key: "max_reasoning_rounds", label: "Max reasoning/debate rounds", unit: "rounds" },
  { key: "max_execution_time_seconds", label: "Max execution time", unit: "seconds" },
];

const initialState: BudgetActionState = { error: null };

export function BudgetForm({ limits }: { limits: BudgetLimitsRow }) {
  const [state, formAction, pending] = useActionState(updateGlobalBudgetLimitsAction, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-border p-4">
      <h2 className="mb-1 font-mono text-sm font-bold">GLOBAL BUDGET LIMITS</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Empty = no limit for that dimension. Changes apply to every future AI call immediately — the
        gateway re-reads this table on every request, nothing is cached.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="mb-1 block text-xs font-medium text-neutral-400">
              {field.label} <span className="text-neutral-600">({field.unit})</span>
            </label>
            <input
              id={field.key}
              name={field.key}
              type="number"
              step="any"
              min="0"
              defaultValue={limits[field.key] ?? ""}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            />
          </div>
        ))}
      </div>

      {state.error ? <p className="mt-3 text-sm text-accent-short">{state.error}</p> : null}
      {state.success ? <p className="mt-3 text-sm text-accent-long">Saved.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="focus-ring mt-4 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save limits"}
      </button>
    </form>
  );
}
