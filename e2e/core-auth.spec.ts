import { test, expect } from "../playwright-fixture";

test.describe("Core Auth & Navigation", () => {
  // 1. Public Landing Load
  test("Public landing page loads with correct title and login button", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/NC Performance Hub/i);
    const loginLink = page.getByRole("link", { name: /accedi/i });
    await expect(loginLink).toBeVisible();
  });

  // 2. Auth page renders login form
  test("Auth page renders email and password fields", async ({ page }) => {
    await page.goto("/auth");
    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  // 3. Protected route /coach redirects unauthenticated users
  test("Protected route /coach redirects unauthenticated users", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/coach");
    await page
      .waitForURL((url) => url.pathname.includes("/auth") || url.pathname === "/coach", {
        timeout: 5000,
      })
      .catch(() => {});
    await page.waitForTimeout(2000);
    const url = page.url();
    const isOnAuth = url.includes("/auth");
    const hasLoginForm = await page
      .getByPlaceholder(/email/i)
      .isVisible()
      .catch(() => false);
    expect(isOnAuth || hasLoginForm).toBeTruthy();
  });

  // 4. Protected route /coach/programs redirects unauthenticated users
  test("Protected route /coach/programs redirects unauthenticated users", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/coach/programs");
    await page.waitForTimeout(2000);
    const url = page.url();
    const isOnAuth = url.includes("/auth");
    const hasLoginForm = await page
      .getByPlaceholder(/email/i)
      .isVisible()
      .catch(() => false);
    expect(isOnAuth || hasLoginForm).toBeTruthy();
  });

  // 5. Protected route /athlete redirects unauthenticated users
  test("Protected route /athlete redirects unauthenticated users", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/athlete");
    await page.waitForTimeout(2000);
    const url = page.url();
    const isOnAuth = url.includes("/auth");
    const hasLoginForm = await page
      .getByPlaceholder(/email/i)
      .isVisible()
      .catch(() => false);
    expect(isOnAuth || hasLoginForm).toBeTruthy();
  });

  // 6. 404 page renders for unknown routes
  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-route-xyz");
    await page.waitForTimeout(1000);
    const notFoundText = page.getByText(/404|non trovata|not found/i);
    await expect(notFoundText).toBeVisible();
  });
});
