import { test, expect } from "../playwright-fixture";

// Unauthenticated access to any guarded route must land on /auth.
// ProtectedCoachRoute / ProtectedAthleteRoute both `<Navigate to="/auth">`
// when there is no user. We assert via web-first `waitForURL` (no fixed
// waitForTimeout) so the test is robust to the guard's loading frame.

const COACH_ROUTES = [
  "/coach",
  "/coach/athletes",
  "/coach/athlete/00000000-0000-0000-0000-000000000000",
  "/coach/programs",
  "/coach/calendar",
  "/coach/messages",
  "/coach/library",
  "/coach/exercises",
  "/coach/analytics",
  "/coach/business",
  "/coach/inbox",
  "/coach/fms",
  "/coach/knowledge",
  "/coach/copilot",
  "/coach/settings",
];

const ATHLETE_ROUTES = [
  "/athlete",
  "/athlete/training",
  "/athlete/profile",
  "/athlete/daily-checkin",
];

test.describe("Guard redirects — unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  for (const route of COACH_ROUTES) {
    test(`coach ${route} → /auth`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/auth/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/auth/);
    });
  }

  for (const route of ATHLETE_ROUTES) {
    test(`athlete ${route} → /auth`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/auth/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/auth/);
    });
  }
});
