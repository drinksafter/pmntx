import { describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

describe("vitest setup", () => {
  it("resolves the server-only alias and the @/ path alias without throwing", () => {
    expect(() => createServiceRoleClient()).not.toThrow();
  });

  it("loaded env vars pointing at the local test stack, not the linked/production project", () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toContain("127.0.0.1");
  });

  it("can issue a real query against the local Postgres stack", async () => {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("securities").select("id").limit(1);
    expect(error).toBeNull();
  });
});
