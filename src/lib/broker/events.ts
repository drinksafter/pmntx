import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ProposedTradeEventType } from "@/lib/supabase/types";

/** Append-only by convention — no update/delete is ever performed on this table. */
export async function recordProposedTradeEvent(
  proposedTradeId: string,
  eventType: ProposedTradeEventType,
  detail?: Record<string, unknown>,
  actor?: string | null
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("proposed_trade_events").insert({
    proposed_trade_id: proposedTradeId,
    event_type: eventType,
    detail: detail ?? null,
    actor: actor ?? null,
  });
}
