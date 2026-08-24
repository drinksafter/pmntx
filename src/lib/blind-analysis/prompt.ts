import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { AiRole } from "@/lib/ai/types";

export type ActivePromptVersion = { id: string; content: string };

/** Looks up the currently-activated prompt_version for a role_code (see supabase/migrations/021_blind_analysis_prompts.sql). */
export async function getActivePromptVersion(roleCode: AiRole): Promise<ActivePromptVersion | null> {
  const supabase = createServiceRoleClient();

  const { data: template } = await supabase
    .from("prompt_templates")
    .select("id")
    .eq("role_code", roleCode)
    .single();
  if (!template) return null;

  const { data: version } = await supabase
    .from("prompt_versions")
    .select("id, content")
    .eq("prompt_template_id", template.id)
    .not("activated_at", "is", null)
    .is("retired_at", null)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return version ? { id: version.id, content: version.content } : null;
}
