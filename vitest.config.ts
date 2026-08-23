import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests in environment "node" (decision 2026-07-14). One deliberate
// exception: DailyCheckin.boundary.test.ts opts into jsdom via per-file
// pragma — the form→mutation wiring cannot be exercised without a DOM.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
