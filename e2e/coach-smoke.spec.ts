import { test, expect } from "../playwright-fixture";

// Authenticated smoke over the coach surface. Runs only in the `chromium-coach`
// project (real session from auth.setup) and skips cleanly without credentials.
// Each route must render the coach shell — asserted via the persistent sidebar
// landmark `aria-label="Impostazioni"` — on an EMPTY backend (no seed needed).
// `/coach/athlete/:id` is intentionally excluded: it requires a real athlete,
// which a roster-empty backend cannot provide.

const HAS_CREDS = !!process.env.E2E_COACH_EMAIL && !!process.env.E2E_COACH_PASSWORD;

const COACH_ROUTES = [
  "/coach",
  "/coach/athletes",
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

test.describe("Coach surface smoke — authenticated", () => {
  test.skip(!HAS_CREDS, "E2E_COACH_EMAIL / E2E_COACH_PASSWORD non impostate");

  for (const route of COACH_ROUTES) {
    test(`${route} renders the coach shell`, async ({ page }) => {
      const fatal: string[] = [];
      page.on("pageerror", (err) => {
        // Ignore Supabase network noise (empty backend / RLS on missing rows).
        if (!/supabase\.co/.test(err.message)) fatal.push(err.message);
      });

      await page.goto(route);
      await expect(page.getByLabel("Impostazioni").first()).toBeVisible({ timeout: 15_000 });

      expect(fatal, `Errori pagina non filtrati:\n${fatal.join("\n")}`).toEqual([]);
    });
  }
});
