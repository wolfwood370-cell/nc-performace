import { test, expect } from "../playwright-fixture";

test.describe("Core Auth & Navigation", () => {
  // 1. Root redirects unauthenticated users to /auth (nessuna landing pubblica — App.tsx)
  test("Root redirects unauthenticated users to /auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth/);
    await expect(page).toHaveTitle(/NC Performance Hub/i);
  });

  // 2. Auth page renders login form (label "Email"/"Password"; i placeholder sono esempi)
  test("Auth page renders email and password fields", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
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

  // 6. 404 page renders for unknown routes (la NotFound mostra "404" + "Pagina non trovata")
  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-route-xyz");
    await expect(page.getByText(/pagina non trovata/i)).toBeVisible();
  });
});
