import path from "node:path";

import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "server-only": path.resolve(rootDir, "./src/lib/testing/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30_000,
  },
});
