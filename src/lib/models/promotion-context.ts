import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Mirrors src/lib/integrations/schwab/live-context.ts exactly: only a
 * genuine admin-triggered production entry point (the Admin -> Models
 * "Promote to Production" server action) should ever run inside this
 * context. registry.ts's promoteModelVersion() refuses to promote to
 * PRODUCTION unless isAdminPromotionAction() is true — so an experiment
 * runner, a test script, or any other caller that just imports and calls
 * promoteModelVersion() directly cannot self-promote to production,
 * regardless of what result it computed.
 */
const adminPromotionContext = new AsyncLocalStorage<true>();

export function runAsAdminPromotionAction<T>(fn: () => Promise<T>): Promise<T> {
  return adminPromotionContext.run(true, fn);
}

export function isAdminPromotionAction(): boolean {
  return adminPromotionContext.getStore() === true;
}
