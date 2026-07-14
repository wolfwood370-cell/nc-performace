import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only (pure modules) — no jsdom on purpose (decision 2026-07-14).
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
