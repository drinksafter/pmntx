import "server-only";

export type SubmitOrderResult = { status: "REFUSED"; reason: string };

/**
 * Hard-disabled by design. This exists to complete the BrokerProvider
 * architecture referenced in docs/NEXT_PHASE.md (Research → Risk Engine →
 * Portfolio Engine → Proposed Order → Execution Policy → human approval →
 * SchwabBrokerProvider), but it always refuses — regardless of execution
 * mode, admin configuration, approval state, or caller. There is no
 * parameter or admin setting anywhere in this codebase that changes this
 * function's return value. Real order submission (place/modify/cancel,
 * any asset class) requires a separate, deliberate future build step the
 * user explicitly authorizes — see docs/SCHWAB_INTEGRATION.md §9.
 */
export const SchwabBrokerProvider = {
  async submitOrder(): Promise<SubmitOrderResult> {
    return {
      status: "REFUSED",
      reason: "Real order submission is not implemented in PMNTx. No code path places, modifies, or cancels a live Schwab order.",
    };
  },
};
