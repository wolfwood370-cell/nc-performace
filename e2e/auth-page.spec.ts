import { test, expect } from "../playwright-fixture";

// Static UI smoke for /auth: tabs, login fields, forgot-password, and the
// signup role picker. `{ exact: true }` avoids the "Accedi" tab clashing with
// the "Accedi" submit button.

test.describe("Auth page UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
  });

  test("renders login and signup tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Accedi", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Registrati", exact: true })).toBeVisible();
  });

  test("login tab shows email, password, forgot-password and Google", async ({ page }) => {
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Password dimenticata?", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continua con Google" })).toBeVisible();
  });

  test("signup tab shows the role picker and submit", async ({ page }) => {
    await page.getByRole("tab", { name: "Registrati", exact: true }).click();
    await expect(page.getByText("Sono un...", { exact: true })).toBeVisible();
    await expect(page.getByText("Coach", { exact: true })).toBeVisible();
    await expect(page.getByText("Atleta", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crea account", exact: true })).toBeVisible();
  });
});
