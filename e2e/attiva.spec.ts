import { test, expect } from "../playwright-fixture";

// /attiva e' la landing di ogni action link auth. Qui si verifica il caso che
// il task chiamava «mai un /auth muto»: un link scaduto o aperto a mano deve
// spiegare cosa e' successo e offrire la via d'uscita.

test.describe("Landing /attiva", () => {
  test("link scaduto o gia' usato: lo dice, e riporta a chiedere un accesso", async ({ page }) => {
    await page.goto(
      "/attiva#error=access_denied&error_code=otp_expired" +
        "&error_description=Email+link+is+invalid+or+has+expired",
    );

    await expect(page.getByText("Questo link non è più valido")).toBeVisible();

    await page.getByRole("button", { name: "Richiedi un nuovo accesso" }).click();
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("aperta a mano, senza credenziali: nessuna pagina bianca", async ({ page }) => {
    await page.goto("/attiva");

    await expect(page.getByText("Link non valido")).toBeVisible();
    await expect(page.getByRole("button", { name: "Richiedi un nuovo accesso" })).toBeVisible();
  });

  test("errore non di scadenza: messaggio proprio, non quello del link scaduto", async ({
    page,
  }) => {
    await page.goto("/attiva#error=access_denied&error_code=validation_failed");

    await expect(page.getByText("Accesso non completato")).toBeVisible();
    await expect(page.getByText("Questo link non è più valido")).toHaveCount(0);
  });
});
