import { test, expect } from "../playwright-fixture";

// Static UI smoke for /auth after the passwordless rewrite: the primary path
// is email → link, password is a secondary collapsed option, and there is no
// public registration at all.

test.describe("Auth page UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
  });

  test("il percorso primario e' email + link, senza password", async ({ page }) => {
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ricevi il link di accesso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continua con Google" })).toBeVisible();
  });

  // La piattaforma e' su invito: una via di registrazione autonoma non deve
  // esistere, ne' come tab ne' come bottone.
  test("nessuna registrazione pubblica", async ({ page }) => {
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crea account", exact: true })).toHaveCount(0);
    await expect(page.getByText("Registrati", { exact: true })).toHaveCount(0);
  });

  test("la password e' secondaria: nascosta finche' non la si chiede", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /Accedi con password/ });

    await expect(page.locator("#login-password")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();

    await expect(page.locator("#login-password")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Accedi", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Password dimenticata?", exact: true }),
    ).toBeVisible();
  });

  test("il campo codice compare solo dopo aver chiesto il link", async ({ page }) => {
    await expect(page.locator("#login-code")).toHaveCount(0);
  });
});
