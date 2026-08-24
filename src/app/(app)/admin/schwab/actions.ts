"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { disconnect, saveClientCredentials } from "@/lib/integrations/schwab/oauth";
import { SchwabAccountProvider } from "@/lib/integrations/schwab/account-provider";

export type SchwabActionState = { error: string | null; success?: boolean };

export async function saveSchwabClientCredentialsAction(
  _prevState: SchwabActionState,
  formData: FormData
): Promise<SchwabActionState> {
  const admin = await requireAdmin();

  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!clientId || !clientSecret) {
    return { error: "Both Client ID and Client Secret are required." };
  }

  try {
    await saveClientCredentials(clientId, clientSecret, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save Schwab client credentials." };
  }

  revalidatePath("/admin/schwab");
  return { error: null, success: true };
}

export async function disconnectSchwabAction(): Promise<void> {
  await requireAdmin();
  await disconnect();
  revalidatePath("/admin/schwab");
}

export async function syncSchwabAccountsAction(
  _prevState: SchwabActionState,
  _formData: FormData
): Promise<SchwabActionState> {
  await requireAdmin();

  const result = await SchwabAccountProvider.syncAccounts();
  revalidatePath("/admin/schwab");

  if (result.status === "NOT_CONFIGURED") {
    return { error: "Not connected — connect to Schwab first." };
  }
  if (result.status === "ERROR") {
    return { error: result.message };
  }
  return { error: null, success: true };
}
