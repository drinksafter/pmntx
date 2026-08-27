// Tests run exclusively against a dedicated local Supabase stack
// (.env.test.local — see that file's header for exactly how it's started),
// never the linked/production project in .env.local. This file is
// deliberately the ONLY place that reads .env.test.local; nothing here
// falls back to .env.local, so a missing test-env file fails loudly
// instead of silently running against production data.
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(__dirname, ".env.test.local");
if (!fs.existsSync(envPath)) {
  throw new Error(
    ".env.test.local not found. Tests must run against a dedicated local Supabase " +
      "stack, never the linked/production project — see vitest.setup.ts."
  );
}

const lines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of lines) {
  if (!line.includes("=") || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim();
  if (key) process.env[key] = value;
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase.co")) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL in .env.test.local points at a hosted Supabase project, " +
      "not a local stack. Refusing to run tests against it."
  );
}
