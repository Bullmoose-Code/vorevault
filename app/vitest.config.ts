import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // pg clients hold connections past pool.end() when testcontainers stops
    // Postgres — every teardown emits "terminating connection due to
    // administrator command" as an unhandled rejection. Tests pass, but vitest
    // exits non-zero. Tolerate until the teardown race is fixed properly.
    dangerouslyIgnoreUnhandledErrors: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
