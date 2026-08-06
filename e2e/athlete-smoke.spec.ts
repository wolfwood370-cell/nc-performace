import { test, expect } from "../playwright-fixture";

// Authenticated smoke over the athlete surface. Runs only in the
// `chromium-athlete` project (real session from athlete.setup.ts) and skips
// cleanly without credentials. Everything runs on an EMPTY backend (no seed).
//
// Landmark of the athlete shell: the bottom nav with
// `aria-label="Navigazione principale atleta"` (src/components/athlete/
// AthleteLayout.tsx) — the counterpart of the coach sidebar's "Impostazioni".
//
// /athlete/nutrition is intentionally excluded: RequireNutritionEntitlement
// is fail-closed and silently redirects to /athlete when the tier lacks the
// 'nutrition' entitlement, so on an empty backend the route never renders.

const HAS_CREDS = !!process.env.E2E_ATHLETE_EMAIL && !!process.env.E2E_ATHLETE_PASSWORD;

const ATHLETE_ROUTES = ["/athlete", "/athlete/training", "/athlete/profile"];

test.describe("Athlete surface smoke — authenticated", () => {
  test.skip(!HAS_CREDS, "E2E_ATHLETE_EMAIL / E2E_ATHLETE_PASSWORD non impostate");

  for (const route of ATHLETE_ROUTES) {
    test(`${route} renders the athlete shell`, async ({ page }) => {
      const fatal: string[] = [];
      page.on("pageerror", (err) => {
        // Ignore Supabase network noise (empty backend / RLS on missing rows).
        if (!/supabase\.co/.test(err.message)) fatal.push(err.message);
      });

      await page.goto(route);
      await expect(
        page.getByRole("navigation", { name: "Navigazione principale atleta" }),
      ).toBeVisible({ timeout: 15_000 });

      expect(fatal, `Errori pagina non filtrati:\n${fatal.join("\n")}`).toEqual([]);
    });
  }

  test("index route renders content through the nested layout's Outlet", async ({ page }) => {
    await page.goto("/athlete");
    // "Apri profilo" is rendered by AthleteDashboard
    // (src/pages/athlete/AthleteDashboard.tsx), i.e. INSIDE the Outlet of
    // AthleteLayout: a broken Outlet leaves the shell as an empty husk, and
    // the nav-only check above would not notice.
    await expect(page.getByRole("link", { name: "Apri profilo" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Stripe return URL lands on /athlete and the payment outcome survives the redirect", async ({
    page,
  }, testInfo) => {
    // /athlete/dashboard is Stripe's success_url: DashboardRedirect
    // (src/App.tsx) forwards to /athlete CARRYING the query string. The app
    // then consumes ?payment=success on mount — usePaymentOutcome strips the
    // parameter immediately, by design — so the URL with the parameter is a
    // milliseconds-wide window no poll can assert. The durable witness that
    // the query survived the redirect is the success toast: it only fires
    // when ?payment=success is still in the URL AFTER the navigation.
    await page.goto("/athlete/dashboard?payment=success");

    await expect(page).toHaveURL(/\/athlete(\?|$)/, { timeout: 15_000 });
    await expect(page.getByText("Pagamento riuscito")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("navigation", { name: "Navigazione principale atleta" }),
    ).toBeVisible();

    await testInfo.attach("url-finale", { body: page.url(), contentType: "text/plain" });
  });

  test("exercise preview aperta senza stato di rotta rimanda al training, non inventa", async ({
    page,
  }) => {
    // A direct deep-link / refresh carries no location.state: the page
    // used to fall back to a hardcoded default exercise ("A1. Barbell
    // Back Squat, 4×6-8 @ 100 kg") rendered as if it were a coach
    // prescription. Honest behavior, pinned here: redirect to the
    // Training Hub. Read-only — nothing is written to the test backend.
    await page.goto("/athlete/exercise-preview");

    await expect(page).toHaveURL(/\/athlete\/training/, { timeout: 15_000 });
    await expect(
      page.getByRole("navigation", { name: "Navigazione principale atleta" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
