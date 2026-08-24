import Link from "next/link";

import { requireAdmin } from "@/lib/auth/session";
import { listAccountSummaries } from "@/lib/integrations/schwab/account-provider";
import { getConnectionSummary } from "@/lib/integrations/schwab/oauth";
import { getValidationStatus } from "@/lib/integrations/schwab/validation";

import { disconnectSchwabAction } from "./actions";
import { ClientCredentialsForm } from "./client-credentials-form";
import { SyncAccountsButton } from "./sync-accounts-button";

const STATUS_STYLES: Record<string, string> = {
  CONNECTED: "text-accent-long border-accent-long/40",
  DISCONNECTED: "text-neutral-500 border-neutral-700",
  EXPIRED: "text-accent-watch border-accent-watch/40",
  ERROR: "text-accent-short border-accent-short/40",
};

const COMPONENT_LABELS: Record<string, string> = {
  OAUTH: "OAuth",
  MARKET_DATA: "Market data",
  ACCOUNT_DATA: "Account data",
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "never";
}

// Admin -> System -> Schwab. A dedicated, richer panel rather than a row
// in the generic Integrations list — Schwab needs two credential fields
// plus a full OAuth connect/reconnect flow plus per-account state, none
// of which fits the single-value credential form every other integration
// uses. READ-ONLY: there is no order-placement UI here, ever, in Phase 1A
// — see docs/NEXT_PHASE.md for the future SchwabBrokerProvider plan.
export default async function SchwabAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [connection, accounts, validation] = await Promise.all([
    getConnectionSummary(),
    listAccountSummaries(),
    getValidationStatus(),
  ]);

  const marketDataCapable = connection.status === "CONNECTED";
  const accountReadCapable = connection.status === "CONNECTED" && accounts.length > 0;

  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <Link href="/admin" className="text-xs text-neutral-500 hover:text-white">
          ← System
        </Link>
        <h1 className="mt-1 font-mono text-lg font-bold tracking-tight">SYSTEM — CHARLES SCHWAB</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Read-only market data and account data. See{" "}
          <code className="rounded bg-neutral-900 px-1 py-0.5">docs/SCHWAB_INTEGRATION.md</code> for
          verified API capabilities and setup steps.
        </p>
      </header>

      {params.error ? (
        <div className="mb-6 rounded-lg border border-accent-short bg-accent-short/10 p-3 text-sm text-accent-short">
          {decodeURIComponent(params.error)}
        </div>
      ) : null}
      {params.connected ? (
        <div className="mb-6 rounded-lg border border-accent-long bg-accent-long/10 p-3 text-sm text-accent-long">
          Connected successfully.
        </div>
      ) : null}

      <div className="mb-6 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-sm font-bold">CONNECTION</h2>
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLES[connection.status]}`}
            >
              {connection.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {connection.status === "CONNECTED" ? (
              <form action={disconnectSchwabAction}>
                <button
                  type="submit"
                  className="focus-ring rounded-md border border-accent-short px-3 py-1.5 text-xs font-semibold text-accent-short hover:bg-accent-short/10"
                >
                  Disconnect
                </button>
              </form>
            ) : (
              <a
                href="/api/schwab/authorize"
                className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold ${
                  connection.hasClientCredentials
                    ? "bg-white text-black"
                    : "pointer-events-none bg-neutral-800 text-neutral-500"
                }`}
              >
                {connection.status === "EXPIRED" ? "Reconnect" : "Connect"}
              </a>
            )}
          </div>
        </div>

        {!connection.hasClientCredentials ? (
          <p className="mt-2 text-xs text-neutral-600">
            Save your Client ID and Client Secret below before connecting.
          </p>
        ) : null}
        {connection.lastError ? (
          <p className="mt-2 text-xs text-accent-short">
            Last error ({formatDate(connection.lastErrorAt)}): {connection.lastError}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-neutral-600">Access token expires</dt>
            <dd className="font-mono text-neutral-300">{formatDate(connection.accessTokenExpiresAt)}</dd>
          </div>
          <div>
            <dt className="text-neutral-600">Refresh token expires</dt>
            <dd className={`font-mono ${connection.refreshExpiresWithin24h ? "text-accent-watch" : "text-neutral-300"}`}>
              {formatDate(connection.refreshTokenExpiresAt)}
              {connection.refreshExpiresWithin24h ? " (reauthorize soon — 7-day hard limit)" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-600">Last market-data request</dt>
            <dd className="font-mono text-neutral-300">{formatDate(connection.lastMarketDataRequestAt)}</dd>
          </div>
          <div>
            <dt className="text-neutral-600">Last account-data request</dt>
            <dd className="font-mono text-neutral-300">{formatDate(connection.lastAccountDataRequestAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">VALIDATION STATUS</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Distinguishes what&apos;s built from what&apos;s actually been proven. A mocked test can never
          set LIVE status — only a real successful call to Schwab&apos;s servers can.
        </p>
        <div className="mb-3 flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
          <span>Integration implemented</span>
          <span className="font-mono text-accent-long">YES</span>
        </div>
        <div className="mb-3 flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
          <span>Real account connected</span>
          <span className={`font-mono ${connection.status === "CONNECTED" ? "text-accent-long" : "text-accent-short"}`}>
            {connection.status === "CONNECTED" ? "YES" : "NO"}
          </span>
        </div>
        <div className="tablewrap overflow-x-auto rounded border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-neutral-500">
                <th className="px-3 py-2 font-normal">Component</th>
                <th className="px-3 py-2 font-normal">Mock-validated</th>
                <th className="px-3 py-2 font-normal">Live-validated</th>
              </tr>
            </thead>
            <tbody>
              {validation.map((v) => (
                <tr key={v.component} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono">{COMPONENT_LABELS[v.component]}</td>
                  <td className="px-3 py-2">
                    {v.mockValidated ? (
                      <span className={v.mockValidated.result === "PASSED" ? "text-accent-long" : "text-accent-short"}>
                        {v.mockValidated.result} <span className="text-neutral-600">({formatDate(v.mockValidated.at)})</span>
                      </span>
                    ) : (
                      <span className="text-neutral-500">not run</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {v.liveValidated ? (
                      <span className={v.liveValidated.result === "PASSED" ? "text-accent-long" : "text-accent-short"}>
                        {v.liveValidated.result} <span className="text-neutral-600">({formatDate(v.liveValidated.at)})</span>
                      </span>
                    ) : (
                      <span className="font-mono text-accent-watch">NOT COMPLETED</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border p-4">
        <h2 className="mb-3 font-mono text-sm font-bold">CAPABILITIES</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
            <span>Market data</span>
            <span className={marketDataCapable ? "text-accent-long" : "text-neutral-500"}>
              {marketDataCapable ? "enabled" : "not available"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
            <span>Account read</span>
            <span className={accountReadCapable ? "text-accent-long" : "text-neutral-500"}>
              {accountReadCapable ? "enabled" : "not available"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded border border-accent-short/40 bg-accent-short/5 px-3 py-2 text-xs">
            <span>Trading</span>
            <span className="font-mono text-accent-short">NOT ENABLED</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <ClientCredentialsForm hasCredentials={connection.hasClientCredentials} />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold">LINKED ACCOUNTS</h2>
          <SyncAccountsButton />
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No accounts synced yet. {connection.status === "CONNECTED" ? "Click “Sync accounts now.”" : "Connect first."}
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{account.accountNumberMasked}</span>
                  <span className="text-xs text-neutral-500">{account.accountType ?? "—"}</span>
                </div>
                {account.latestSnapshot ? (
                  <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                    <span>Cash: {account.latestSnapshot.cash ?? "—"}</span>
                    <span>Buying power: {account.latestSnapshot.buyingPower ?? "—"}</span>
                    <span>Total value: {account.latestSnapshot.totalValue ?? "—"}</span>
                    <span>{account.positionCount} position(s)</span>
                    <span className="text-neutral-600">as of {formatDate(account.latestSnapshot.asOf)}</span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-neutral-600">No balance snapshot yet.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
