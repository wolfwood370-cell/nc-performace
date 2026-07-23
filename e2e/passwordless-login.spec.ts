import { test, expect } from "../playwright-fixture";

// Flusso passwordless con la rete STUBBATA: deterministico e offline, cosi'
// verifica la UI e non la disponibilita' del backend. Il vero end-to-end
// (email reale, codice reale) resta lo smoke manuale — dichiarato.

const LOGIN_LINK_ROUTE = "**/functions/v1/request-login-link";

test.describe("Login passwordless", () => {
  test("chiesto il link, compare il campo codice col messaggio anti-enumerazione", async ({
    page,
  }) => {
    await page.route(LOGIN_LINK_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto("/auth");
    await page.locator("#login-email").fill("atleta@example.com");
    await page.getByRole("button", { name: "Ricevi il link di accesso" }).click();

    await expect(page.locator("#login-code")).toBeVisible();
    // La copia NON deve mai confermare che l'indirizzo esiste.
    await expect(page.getByText(/Se l'indirizzo è registrato/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Usa un altro indirizzo" })).toBeVisible();
  });

  test("il bottone Entra si sblocca solo con un codice completo", async ({ page }) => {
    await page.route(LOGIN_LINK_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto("/auth");
    await page.locator("#login-email").fill("atleta@example.com");
    await page.getByRole("button", { name: "Ricevi il link di accesso" }).click();

    const submit = page.getByRole("button", { name: "Entra", exact: true });
    await expect(submit).toBeDisabled();

    await page.locator("#login-code").fill("12345");
    await expect(submit).toBeDisabled();

    // 8 cifre: la lunghezza reale emessa da questo progetto.
    await page.locator("#login-code").fill("93391701");
    await expect(submit).toBeEnabled();
  });

  test("il campo codice tiene solo le cifre e non tronca a 6", async ({ page }) => {
    await page.route(LOGIN_LINK_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto("/auth");
    await page.locator("#login-email").fill("atleta@example.com");
    await page.getByRole("button", { name: "Ricevi il link di accesso" }).click();

    await page.locator("#login-code").fill("9339 1701");
    await expect(page.locator("#login-code")).toHaveValue("93391701");
  });

  test("rate limit: nessun campo codice, l'utente sa di dover attendere", async ({ page }) => {
    await page.route(LOGIN_LINK_ROUTE, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Troppe richieste. Riprova tra qualche minuto." }),
      }),
    );

    await page.goto("/auth");
    await page.locator("#login-email").fill("atleta@example.com");
    await page.getByRole("button", { name: "Ricevi il link di accesso" }).click();

    await expect(page.getByText(/Attendi qualche minuto/)).toBeVisible();
    await expect(page.locator("#login-code")).toHaveCount(0);
  });
});
