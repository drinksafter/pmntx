"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import type { IntegrationService } from "@/lib/supabase/types";

import { saveCredential, setCredentialEnabled } from "./store";

export type CredentialActionState = { error: string | null; success?: boolean };

export async function saveCredentialAction(
  _prevState: CredentialActionState,
  formData: FormData
): Promise<CredentialActionState> {
  const admin = await requireAdmin();

  const service = String(formData.get("service") ?? "") as IntegrationService;
  const value = String(formData.get("value") ?? "").trim();

  if (!service) return { error: "Missing service." };
  if (!value) return { error: "Enter a value before saving." };

  try {
    await saveCredential(service, value, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save credential." };
  }

  revalidatePath("/admin");
  return { error: null, success: true };
}

export async function toggleCredentialAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const service = String(formData.get("service") ?? "") as IntegrationService;
  const isEnabled = formData.get("isEnabled") === "true";
  if (!service) return;

  await setCredentialEnabled(service, isEnabled);
  revalidatePath("/admin");
}
