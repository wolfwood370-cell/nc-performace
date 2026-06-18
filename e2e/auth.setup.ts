import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Authenticated-project bootstrap. Logs in a real coach via the UI using
// credentials from the environment, then persists the browser storage state so
// the `chromium-coach` project can reuse the session.
//
// Credentials are NEVER hardcoded. When E2E_COACH_EMAIL / E2E_COACH_PASSWORD are
// absent we still write an EMPTY storage-state file (so the dependent project
// can load it) and skip — the coach specs then skip themselves too. This keeps
// the suite green out-of-the-box without secrets.

// Relative to the Playwright cwd (config dir) — matches `storageState` in
// playwright.config.ts. The project is ESM, so `__dirname` is unavailable.
const authFile = "e2e/.auth/coach.json";
const EMAIL = process.env.E2E_COACH_EMAIL;
const PASSWORD = process.env.E2E_COACH_PASSWORD;

setup("authenticate coach", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  if (!EMAIL || !PASSWORD) {
    // Empty (unauthenticated) state so `storageState` resolves; specs skip.
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "E2E_COACH_EMAIL / E2E_COACH_PASSWORD non impostate");
    return;
  }

  await page.goto("/auth");
  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();

  // Coach login resolves to /coach (resolveHomePath in Auth.tsx).
  await page.waitForURL(/\/coach/, { timeout: 20_000 });

  await page.context().storageState({ path: authFile });
});
