import { test, expect } from "../playwright-fixture";

// Role-mismatch redirect. An authenticated coach who navigates to an athlete
// route is bounced to /coach (ProtectedAthleteRoute: role !== "athlete" →
// `<Navigate to="/coach">`), never to /auth. Runs in the `chromium-coach`
// project; skips cleanly without coach credentials. The mirror case
// (athlete → /coach surface → /athlete) needs an athlete session and is left
// to a future athlete-storageState project.

const HAS_CREDS = !!process.env.E2E_COACH_EMAIL && !!process.env.E2E_COACH_PASSWORD;

test.describe("Role-mismatch redirect — coach", () => {
  test.skip(!HAS_CREDS, "E2E_COACH_EMAIL / E2E_COACH_PASSWORD non impostate");

  test("coach on /athlete is redirected to /coach (not /auth)", async ({ page }) => {
    await page.goto("/athlete");
    await page.waitForURL(/\/coach/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/coach/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("coach on /athlete/training is redirected to /coach", async ({ page }) => {
    await page.goto("/athlete/training");
    await page.waitForURL(/\/coach/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/coach/);
  });
});
