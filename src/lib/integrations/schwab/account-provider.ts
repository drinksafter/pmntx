import "server-only";

import { encryptCredential } from "@/lib/credentials/encryption";
import { getOrCreateSecurityByTicker } from "@/lib/ingestion/securities";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { SCHWAB_API_BASE_URL } from "./config";
import { maskAccountNumber } from "./masking";
import { getValidAccessToken } from "./oauth";

// Endpoint paths follow the commonly-documented Schwab Trader API
// accounts/trading shape (trader/v1/accounts...) — see the same
// unverified-paths caveat in market-data-provider.ts and
// docs/SCHWAB_INTEGRATION.md.
const ACCOUNT_NUMBERS_PATH = "/trader/v1/accounts/accountNumbers";
const ACCOUNTS_PATH = "/trader/v1/accounts";

export type SchwabProviderResult =
  | { status: "NOT_CONFIGURED" }
  | { status: "OK"; accountsSynced: number }
  | { status: "ERROR"; message: string };

type AccountNumberMapping = { accountNumber: string; hashValue: string };

type SchwabAccountResponse = {
  securitiesAccount?: {
    accountNumber?: string;
    type?: string;
    currentBalances?: { cashBalance?: number; buyingPower?: number; liquidationValue?: number };
    positions?: {
      instrument?: { symbol?: string };
      longQuantity?: number;
      shortQuantity?: number;
      averagePrice?: number;
      marketValue?: number;
    }[];
  };
};

/**
 * `SchwabAccountProvider` — read-only. There is deliberately no method
 * here that places, modifies, or cancels an order; see
 * docs/NEXT_PHASE.md for the future SchwabBrokerProvider, which is a
 * distinct, not-yet-built module by design (build brief §2/§8).
 *
 * Discovers linked accounts (mapping Schwab's own opaque account hash —
 * never the raw account number — for use in every subsequent call) and
 * records a balances/positions snapshot for each. Raw account numbers are
 * masked before they're ever written to a row PMNTx displays; the hash
 * itself is encrypted at rest as defense in depth even though Schwab's
 * own design already avoids exposing the raw number through it.
 */
export const SchwabAccountProvider = {
  async syncAccounts(): Promise<SchwabProviderResult> {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return { status: "NOT_CONFIGURED" };

    const supabase = createServiceRoleClient();

    try {
      const mappingResponse = await fetch(`${SCHWAB_API_BASE_URL}${ACCOUNT_NUMBERS_PATH}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!mappingResponse.ok) throw new Error(`HTTP ${mappingResponse.status} fetching account numbers`);
      const mappings = (await mappingResponse.json()) as AccountNumberMapping[];

      await supabase.from("schwab_connection").update({ last_account_data_request_at: new Date().toISOString() }).eq("id", true);

      let accountsSynced = 0;
      for (const mapping of mappings) {
        const masked = maskAccountNumber(mapping.accountNumber);

        const { data: account, error: upsertError } = await supabase
          .from("schwab_accounts")
          .upsert(
            { account_number_masked: masked, encrypted_account_hash: encryptCredential(mapping.hashValue), is_active: true },
            { onConflict: "account_number_masked" }
          )
          .select("id")
          .single();
        if (upsertError || !account) throw new Error(upsertError?.message ?? "Failed to upsert schwab_accounts row.");

        await syncOneAccount(supabase, account.id, mapping.hashValue, accessToken);
        accountsSynced += 1;
      }

      return { status: "OK", accountsSynced };
    } catch (err) {
      return { status: "ERROR", message: err instanceof Error ? err.message : "Unknown Schwab account sync error." };
    }
  },
};

async function syncOneAccount(
  supabase: ReturnType<typeof createServiceRoleClient>,
  schwabAccountId: string,
  accountHash: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`${SCHWAB_API_BASE_URL}${ACCOUNTS_PATH}/${encodeURIComponent(accountHash)}?fields=positions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching account ${accountHash.slice(0, 6)}…`);

  const data = (await response.json()) as SchwabAccountResponse;
  const account = data.securitiesAccount;
  if (!account) return;

  const asOf = new Date().toISOString();

  await supabase.from("schwab_account_snapshots").insert({
    schwab_account_id: schwabAccountId,
    as_of: asOf,
    cash: account.currentBalances?.cashBalance ?? null,
    buying_power: account.currentBalances?.buyingPower ?? null,
    total_value: account.currentBalances?.liquidationValue ?? null,
    raw: account.currentBalances ?? null,
  });

  for (const position of account.positions ?? []) {
    const symbol = position.instrument?.symbol;
    if (!symbol) continue;

    const securityId = await getOrCreateSecurityByTicker(symbol);
    const quantity = (position.longQuantity ?? 0) - (position.shortQuantity ?? 0);

    await supabase.from("schwab_positions").insert({
      schwab_account_id: schwabAccountId,
      as_of: asOf,
      symbol,
      security_id: securityId,
      quantity,
      average_cost: position.averagePrice ?? null,
      market_value: position.marketValue ?? null,
      raw: position,
    });
  }
}

export type SchwabAccountSummary = {
  id: string;
  accountNumberMasked: string;
  accountType: string | null;
  isActive: boolean;
  latestSnapshot: { asOf: string; cash: number | null; buyingPower: number | null; totalValue: number | null } | null;
  positionCount: number;
};

/** Admin-facing read of the last-synced account state — never decrypts or returns the account hash. */
export async function listAccountSummaries(): Promise<SchwabAccountSummary[]> {
  const supabase = createServiceRoleClient();
  const { data: accounts } = await supabase.from("schwab_accounts").select("id, account_number_masked, account_type, is_active");

  const summaries: SchwabAccountSummary[] = [];
  for (const account of accounts ?? []) {
    const { data: snapshot } = await supabase
      .from("schwab_account_snapshots")
      .select("as_of, cash, buying_power, total_value")
      .eq("schwab_account_id", account.id)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: positionCount } = await supabase
      .from("schwab_positions")
      .select("id", { count: "exact", head: true })
      .eq("schwab_account_id", account.id);

    summaries.push({
      id: account.id,
      accountNumberMasked: account.account_number_masked,
      accountType: account.account_type,
      isActive: account.is_active,
      latestSnapshot: snapshot
        ? { asOf: snapshot.as_of, cash: snapshot.cash, buyingPower: snapshot.buying_power, totalValue: snapshot.total_value }
        : null,
      positionCount: positionCount ?? 0,
    });
  }
  return summaries;
}
