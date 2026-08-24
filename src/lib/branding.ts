/**
 * Single source of truth for the user-facing brand name and its
 * subsystem labels. Internal technical identifiers — database enum
 * values, TypeScript types, function names, env vars, provider/job
 * identifiers — intentionally keep the established PMNTX/pmntx casing and
 * are untouched by this file; only what's actually rendered to a user
 * goes through here. A future logo/wordmark component replaces the plain
 * string usage below without touching every call site.
 */
export const BRAND_NAME = "PMNTx";

export const BRAND_TAGLINE = "PRE-MARKET INTELLIGENCE";

export const BRAND_SUBSYSTEM_NAMES = {
  core: `${BRAND_NAME} Core`,
  meta: `${BRAND_NAME} Meta`,
} as const;
