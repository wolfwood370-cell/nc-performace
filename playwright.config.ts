import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Separate setup project on purpose: broken athlete credentials must fail
    // chromium-athlete alone, never drag the coach specs down with them.
    { name: "setup-athlete", testMatch: /athlete\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Unauthenticated specs only; the authenticated ones run in
      // chromium-coach / chromium-athlete.
      testIgnore: [
        /auth\.setup\.ts/,
        /athlete\.setup\.ts/,
        /coach-smoke\.spec\.ts/,
        /role-guard\.spec\.ts/,
        /athlete-smoke\.spec\.ts/,
      ],
    },
    {
      name: "chromium-coach",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/coach.json" },
      dependencies: ["setup"],
      testMatch: [/coach-smoke\.spec\.ts/, /role-guard\.spec\.ts/],
    },
    {
      name: "chromium-athlete",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/athlete.json" },
      dependencies: ["setup-athlete"],
      testMatch: /athlete-smoke\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
