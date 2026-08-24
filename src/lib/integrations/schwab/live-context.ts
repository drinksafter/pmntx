import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A test harness that mocks `fetch` and calls exchangeCodeForTokens /
 * getValidAccessToken / getQuotes / getDailyPriceHistory / syncAccounts
 * directly cannot distinguish itself from a real call at the HTTP layer —
 * so recordValidation("LIVE", ...) must not be gated on anything those
 * functions can observe about the request/response. Instead it's gated on
 * *how the call was reached*: only the three genuine production entry
 * points (the OAuth callback route, the admin "sync accounts" action, the
 * market-data ingestion router) wrap their call in runAsLiveSchwabCall.
 * Everything downstream — including a getValidAccessToken refresh
 * triggered deep inside a sync — inherits that context via
 * AsyncLocalStorage. A script that imports and calls the provider
 * functions directly (as every mock test in this codebase does) never
 * enters this context, so isLiveSchwabInvocation() is false and no LIVE
 * row is ever written, regardless of what the mocked fetch returns.
 */
const liveInvocationContext = new AsyncLocalStorage<true>();

export function runAsLiveSchwabCall<T>(fn: () => Promise<T>): Promise<T> {
  return liveInvocationContext.run(true, fn);
}

export function isLiveSchwabInvocation(): boolean {
  return liveInvocationContext.getStore() === true;
}
