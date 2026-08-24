import "server-only";

import { createHash } from "node:crypto";

import { computeFreshness } from "@/lib/integrations/schwab/freshness";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ProposedTradeOrderType, ProposedTradeSide } from "@/lib/supabase/types";

import { getBrokerControls } from "./controls";
import { recordProposedTradeEvent } from "./events";

// A single position may not exceed this fraction of total account value —
// a simple, fixed default rather than an admin-configurable risk model;
// see docs/NEXT_PHASE.md for a real Risk Engine.
const MAX_POSITION_CONCENTRATION = 0.2;
// An APPROVED trade must be staged/filled within this window or it's
// treated as stale approval and invalidated, requiring a fresh proposal.
const APPROVAL_VALID_WINDOW_MS = 15 * 60 * 1000;
// If the reference price has moved more than this since risk review, the
// approval no longer reflects the market it was evaluated against.
const MATERIAL_PRICE_MOVE_FRACTION = 0.02;

export type CreateProposedTradeInput = {
  securityId: string;
  side: ProposedTradeSide;
  quantity: number;
  orderType?: ProposedTradeOrderType;
  limitPrice?: number | null;
  predictionId?: string | null;
  rationale?: string | null;
};

export type CreateProposedTradeResult =
  | { status: "CREATED"; proposedTradeId: string }
  | { status: "DUPLICATE"; existingId: string };

function computeFingerprint(input: CreateProposedTradeInput, dayKey: string): string {
  const raw = [
    input.securityId,
    input.side,
    input.quantity,
    input.orderType ?? "MARKET",
    input.limitPrice ?? "",
    input.predictionId ?? "",
    dayKey,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * The only broker-related function AI code (agents, Red Team, PMNTx Meta,
 * user-facing chat) may call. Everything past this point — risk review,
 * policy review, approval, staging/paper-fill — is a separate step an
 * admin (or a deterministic scheduled process, for the review stages)
 * drives explicitly. Creating a proposal never talks to Schwab. Same
 * symbol/side/quantity/order shape on the same calendar day collapses to
 * the existing row via `fingerprint`, so a re-run (e.g. PMNTx Meta running
 * twice) can't silently create duplicate proposals.
 */
export async function createProposedTrade(input: CreateProposedTradeInput): Promise<CreateProposedTradeResult> {
  const controls = await getBrokerControls();
  const supabase = createServiceRoleClient();

  const dayKey = new Date().toISOString().slice(0, 10);
  const fingerprint = computeFingerprint(input, dayKey);

  const { data: existing } = await supabase.from("proposed_trades").select("id").eq("fingerprint", fingerprint).maybeSingle();
  if (existing) return { status: "DUPLICATE", existingId: existing.id };

  const { data: trade, error } = await supabase
    .from("proposed_trades")
    .insert({
      prediction_id: input.predictionId ?? null,
      rationale: input.rationale ?? null,
      security_id: input.securityId,
      side: input.side,
      order_type: input.orderType ?? "MARKET",
      quantity: input.quantity,
      limit_price: input.limitPrice ?? null,
      execution_mode: controls.mode,
      fingerprint,
    })
    .select("id")
    .single();
  if (error || !trade) throw error ?? new Error("Failed to create proposed trade.");

  await recordProposedTradeEvent(trade.id, "CREATED", { side: input.side, quantity: input.quantity, executionMode: controls.mode });
  return { status: "CREATED", proposedTradeId: trade.id };
}

export type RiskReviewResult = { passed: boolean; detail: Record<string, unknown> };

/**
 * Evaluates the proposal against the connected Schwab account's real
 * (read-only) balances/positions — not PMNTx's own research paper
 * portfolios (paper_portfolios), which track the four research products'
 * simulated performance, not a real account's actual buying power. If no
 * real account is connected, this honestly fails as UNVERIFIED rather
 * than fabricating a pass — see docs/SCHWAB_INTEGRATION.md §9.
 */
export async function runRiskReview(proposedTradeId: string): Promise<RiskReviewResult> {
  const supabase = createServiceRoleClient();
  const { data: trade } = await supabase.from("proposed_trades").select("*").eq("id", proposedTradeId).single();
  if (!trade) throw new Error("Proposed trade not found.");

  const { data: quote } = await supabase
    .from("schwab_quotes")
    .select("last_price, quote_timestamp")
    .eq("security_id", trade.security_id)
    .order("quote_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const freshness = quote ? computeFreshness(quote.quote_timestamp) : "UNAVAILABLE";
  if (freshness === "STALE" || freshness === "UNAVAILABLE") {
    return finishRiskReview(proposedTradeId, false, { reason: "STALE_OR_UNAVAILABLE_QUOTE", freshness });
  }

  const { data: account } = await supabase.from("schwab_accounts").select("id").eq("is_active", true).limit(1).maybeSingle();
  if (!account) {
    return finishRiskReview(proposedTradeId, false, {
      reason: "NO_REAL_ACCOUNT_CONNECTED",
      note: "Cannot verify buying power/concentration against a real account — UNVERIFIED, not a pass.",
    });
  }

  const { data: snapshot } = await supabase
    .from("schwab_account_snapshots")
    .select("cash, buying_power, total_value")
    .eq("schwab_account_id", account.id)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshot || snapshot.total_value === null) {
    return finishRiskReview(proposedTradeId, false, {
      reason: "NO_ACCOUNT_SNAPSHOT",
      note: "Account is connected but has no synced balance snapshot yet.",
    });
  }

  const referencePrice = quote?.last_price ?? trade.limit_price;
  if (!referencePrice) {
    return finishRiskReview(proposedTradeId, false, { reason: "NO_REFERENCE_PRICE" });
  }

  const notional = referencePrice * Number(trade.quantity);

  if (trade.side === "BUY") {
    const buyingPower = snapshot.buying_power ?? 0;
    if (notional > buyingPower) {
      return finishRiskReview(proposedTradeId, false, { reason: "INSUFFICIENT_BUYING_POWER", notional, buyingPower });
    }
  }

  const { data: existingPosition } = await supabase
    .from("schwab_positions")
    .select("market_value")
    .eq("schwab_account_id", account.id)
    .eq("security_id", trade.security_id)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingValue = existingPosition?.market_value ?? 0;
  const projectedValue = trade.side === "BUY" ? existingValue + notional : Math.max(existingValue - notional, 0);
  const concentration = snapshot.total_value > 0 ? projectedValue / snapshot.total_value : 1;

  if (trade.side === "BUY" && concentration > MAX_POSITION_CONCENTRATION) {
    return finishRiskReview(proposedTradeId, false, { reason: "CONCENTRATION_LIMIT_EXCEEDED", concentration, limit: MAX_POSITION_CONCENTRATION });
  }

  return finishRiskReview(proposedTradeId, true, {
    referencePrice,
    quoteTimestamp: quote?.quote_timestamp,
    notional,
    buyingPower: snapshot.buying_power,
    concentration,
  });
}

async function finishRiskReview(proposedTradeId: string, passed: boolean, detail: Record<string, unknown>): Promise<RiskReviewResult> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("proposed_trades")
    .update({
      risk_review_passed: passed,
      risk_review_detail: detail,
      status: passed ? "RISK_REVIEWED" : "REJECTED",
      reviewed_against_quote_at: typeof detail.quoteTimestamp === "string" ? detail.quoteTimestamp : null,
    })
    .eq("id", proposedTradeId);
  await recordProposedTradeEvent(proposedTradeId, "RISK_REVIEWED", detail);
  return { passed, detail };
}

export type PolicyReviewResult = { passed: boolean; detail: Record<string, unknown> };

export async function runPolicyReview(proposedTradeId: string): Promise<PolicyReviewResult> {
  const supabase = createServiceRoleClient();
  const { data: trade } = await supabase.from("proposed_trades").select("status, side").eq("id", proposedTradeId).single();
  if (!trade) throw new Error("Proposed trade not found.");

  if (trade.status !== "RISK_REVIEWED") {
    return { passed: false, detail: { reason: "RISK_REVIEW_NOT_PASSED_YET", currentStatus: trade.status } };
  }

  const controls = await getBrokerControls();

  if (!controls.executionEnabled) {
    return finishPolicyReview(proposedTradeId, false, { reason: "EXECUTION_DISABLED", note: "Admin kill switch — broker execution is off." });
  }
  if (controls.mode === "READ_ONLY") {
    return finishPolicyReview(proposedTradeId, false, {
      reason: "READ_ONLY_MODE",
      note: "Proposals may be created and risk-reviewed but never advance past that in READ_ONLY mode.",
    });
  }
  if (controls.closeOnlyMode && trade.side === "BUY") {
    return finishPolicyReview(proposedTradeId, false, {
      reason: "CLOSE_ONLY_MODE",
      note: "Only SELL orders reducing an existing position are allowed while close-only mode is active.",
    });
  }

  return finishPolicyReview(proposedTradeId, true, { executionMode: controls.mode });
}

async function finishPolicyReview(proposedTradeId: string, passed: boolean, detail: Record<string, unknown>): Promise<PolicyReviewResult> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("proposed_trades")
    .update({ policy_review_passed: passed, policy_review_detail: detail, status: passed ? "PENDING_APPROVAL" : "REJECTED" })
    .eq("id", proposedTradeId);
  await recordProposedTradeEvent(proposedTradeId, "POLICY_REVIEWED", detail);
  if (passed) await recordProposedTradeEvent(proposedTradeId, "APPROVAL_REQUESTED", {});
  return { passed, detail };
}

export async function approveProposedTrade(proposedTradeId: string, adminProfileId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: trade } = await supabase.from("proposed_trades").select("status").eq("id", proposedTradeId).single();
  if (!trade) throw new Error("Proposed trade not found.");
  if (trade.status !== "PENDING_APPROVAL") {
    throw new Error(`Cannot approve a trade in status ${trade.status} — must be PENDING_APPROVAL.`);
  }

  const { error } = await supabase
    .from("proposed_trades")
    .update({ status: "APPROVED", approved_by: adminProfileId, approved_at: new Date().toISOString() })
    .eq("id", proposedTradeId);
  if (error) throw error;
  await recordProposedTradeEvent(proposedTradeId, "APPROVED", {}, adminProfileId);
}

export async function rejectProposedTrade(proposedTradeId: string, adminProfileId: string, reason: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("proposed_trades").update({ status: "REJECTED" }).eq("id", proposedTradeId);
  if (error) throw error;
  await recordProposedTradeEvent(proposedTradeId, "REJECTED", { reason }, adminProfileId);
}

type ApprovalValidity = { valid: boolean; reason?: string };

/** Invalidates a stale or moved-away-from approval rather than letting staging/fill proceed on outdated review. */
async function checkApprovalStillValid(proposedTradeId: string): Promise<ApprovalValidity> {
  const supabase = createServiceRoleClient();
  const { data: trade } = await supabase.from("proposed_trades").select("*").eq("id", proposedTradeId).single();
  if (!trade || trade.status !== "APPROVED") return { valid: false, reason: "NOT_APPROVED" };

  const approvedAt = trade.approved_at ? new Date(trade.approved_at).getTime() : 0;
  if (Date.now() - approvedAt > APPROVAL_VALID_WINDOW_MS) {
    await invalidateApproval(proposedTradeId, "APPROVAL_EXPIRED", `More than ${APPROVAL_VALID_WINDOW_MS / 60_000} minutes elapsed since approval.`);
    return { valid: false, reason: "APPROVAL_EXPIRED" };
  }

  const reviewDetail = trade.risk_review_detail as Record<string, unknown> | null;
  const referencePrice = typeof reviewDetail?.referencePrice === "number" ? reviewDetail.referencePrice : null;

  const { data: latestQuote } = await supabase
    .from("schwab_quotes")
    .select("last_price, quote_timestamp")
    .eq("security_id", trade.security_id)
    .order("quote_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  const freshness = latestQuote ? computeFreshness(latestQuote.quote_timestamp) : "UNAVAILABLE";
  if (freshness === "STALE" || freshness === "UNAVAILABLE") {
    await invalidateApproval(proposedTradeId, "STALE_DATA", "Quote data is stale or unavailable at advancement time.");
    return { valid: false, reason: "STALE_DATA" };
  }

  if (referencePrice !== null && latestQuote?.last_price) {
    const moveFraction = Math.abs(latestQuote.last_price - referencePrice) / referencePrice;
    if (moveFraction > MATERIAL_PRICE_MOVE_FRACTION) {
      await invalidateApproval(proposedTradeId, "MATERIAL_PRICE_MOVE", `Price moved ${(moveFraction * 100).toFixed(1)}% since risk review.`);
      return { valid: false, reason: "MATERIAL_PRICE_MOVE" };
    }
  }

  return { valid: true };
}

async function invalidateApproval(proposedTradeId: string, reasonCode: string, reason: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("proposed_trades")
    .update({ status: "INVALIDATED", approval_invalidated_at: new Date().toISOString(), approval_invalidated_reason: reason })
    .eq("id", proposedTradeId);
  await recordProposedTradeEvent(proposedTradeId, "INVALIDATED", { reasonCode, reason });
}

export type AdvanceResult = { status: "STAGED" | "FILLED_PAPER"; price?: number } | { status: "BLOCKED"; reason: string };

/** STAGED and HUMAN_APPROVAL modes both resolve here — a human places the order manually outside PMNTx; no Schwab order endpoint is ever called. */
export async function stageProposedTrade(proposedTradeId: string): Promise<AdvanceResult> {
  const { valid, reason } = await checkApprovalStillValid(proposedTradeId);
  if (!valid) return { status: "BLOCKED", reason: reason ?? "INVALID" };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("proposed_trades")
    .update({ status: "STAGED", staged_at: new Date().toISOString() })
    .eq("id", proposedTradeId);
  if (error) throw error;
  await recordProposedTradeEvent(proposedTradeId, "STAGED", {
    note: "Human must place this order manually outside PMNTx — no Schwab order endpoint is called.",
  });
  return { status: "STAGED" };
}

/** PAPER mode only. Writes a simulated fill directly on the proposed_trades row — never calls SchwabBrokerProvider.submitOrder or any real Schwab endpoint. */
export async function fillProposedTradePaper(proposedTradeId: string): Promise<AdvanceResult> {
  const { valid, reason } = await checkApprovalStillValid(proposedTradeId);
  if (!valid) return { status: "BLOCKED", reason: reason ?? "INVALID" };

  const supabase = createServiceRoleClient();
  const { data: trade } = await supabase.from("proposed_trades").select("execution_mode, security_id").eq("id", proposedTradeId).single();
  if (!trade) throw new Error("Proposed trade not found.");
  if (trade.execution_mode !== "PAPER") return { status: "BLOCKED", reason: "NOT_PAPER_MODE" };

  const { data: quote } = await supabase
    .from("schwab_quotes")
    .select("last_price")
    .eq("security_id", trade.security_id)
    .order("quote_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!quote?.last_price) return { status: "BLOCKED", reason: "NO_REFERENCE_PRICE" };

  const { error } = await supabase
    .from("proposed_trades")
    .update({ status: "FILLED_PAPER", filled_paper_at: new Date().toISOString(), filled_paper_price: quote.last_price })
    .eq("id", proposedTradeId);
  if (error) throw error;

  await recordProposedTradeEvent(proposedTradeId, "FILLED_PAPER", {
    price: quote.last_price,
    note: "Simulated fill only — never calls a real Schwab endpoint.",
  });
  return { status: "FILLED_PAPER", price: quote.last_price };
}

export async function cancelProposedTrade(proposedTradeId: string, reason: string, actor?: string | null): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("proposed_trades")
    .update({ status: "CANCELLED", cancelled_at: new Date().toISOString(), cancelled_reason: reason })
    .eq("id", proposedTradeId);
  if (error) throw error;
  await recordProposedTradeEvent(proposedTradeId, "CANCELLED", { reason }, actor);
}
