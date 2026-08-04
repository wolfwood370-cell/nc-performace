import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Authenticated-project bootstrap for the ATHLETE surface — mirror of
// auth.setup.ts (coach). Logs in a real athlete via the UI using credentials
// from the environment, then persists the browser storage state so the
// `chromium-athlete` project can reuse the session.
//
// Credentials are NEVER hardcoded. When E2E_ATHLETE_EMAIL / E2E_ATHLETE_PASSWORD
// are absent we still write an EMPTY storage-state file (so the dependent
// project can load it) and skip — the athlete specs then skip themselves too.
// This keeps the suite green out-of-the-box without secrets.
//
// Prerequisite (self-revealing): the athlete behind the secrets must have
// onboarding_completed=true. pickHomePath (src/lib/auth/homePath.ts) routes a
// non-onboarded athlete straight to /onboarding, which never matches the wait
// below — so this setup fails loudly instead of saving a session that would
// strand every spec on the wrong surface.

// Relative to the Playwright cwd (config dir) — matches `storageState` in
// playwright.config.ts. The project is ESM, so `__dirname` is unavailable.
const authFile = "e2e/.auth/athlete.json";
const EMAIL = process.env.E2E_ATHLETE_EMAIL;
const PASSWORD = process.env.E2E_ATHLETE_PASSWORD;

setup("authenticate athlete", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  if (!EMAIL || !PASSWORD) {
    // Empty (unauthenticated) state so `storageState` resolves; specs skip.
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "E2E_ATHLETE_EMAIL / E2E_ATHLETE_PASSWORD non impostate");
    return;
  }

  await page.goto("/auth");
  await page.locator("#login-email").fill(EMAIL);
  // Password login is the SECONDARY path since the passwordless rewrite: the
  // field is not mounted until the toggle is opened.
  await page.getByRole("button", { name: /Accedi con password/ }).click();
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();

  // Athlete login resolves to /athlete (pickHomePath in src/lib/auth/homePath.ts).
  await page.waitForURL(/\/athlete(\?|$)/, { timeout: 20_000 });

  await page.context().storageState({ path: authFile });
});
