> ⚠️ **STORICO — piano già ESEGUITO; non usare come piano.**
> Vedi `docs/stato-repo-2026-07-12.md` §2.

# D9 — E2E: config Playwright nativa (rimozione residuo Lovable)

> Cowork, 2026-06-14. Spec + prompt per Claude Code. Emerso dall'audit (flag #1).

## Problema

`playwright.config.ts` e `playwright-fixture.ts` importano `lovable-agent-playwright-config`, che **non è in `package.json`** e non è installato → la config E2E non si carica e **i test non girano**. È un residuo dell'ambiente Lovable.

Stato verificato:

- `playwright.config.ts` → `export default createLovableConfig({ ... })` (tutti gli override commentati: la config reale la dava il wrapper).
- `playwright-fixture.ts` → `export { test, expect } from "lovable-agent-playwright-config/fixture";`
- `e2e/core-auth.spec.ts` → 6 test smoke **non autenticati** (`page.goto("/")`, `/auth`, `/coach`, `/coach/programs`, `/athlete`, `/nonexistent`) con URL **relativi** → serve `baseURL`.
- `@playwright/test` è già in `devDependencies` (^1.57.0). Riferimenti a `lovable-agent-playwright-config`: solo i 2 file sopra.

## Soluzione (nativa, fedele)

Niente nuove dipendenze: si usa direttamente `@playwright/test`. App su **porta 8080** (da `vite.config.ts`).

**`playwright.config.ts` (nuovo):**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

**`playwright-fixture.ts` (nuovo):**

```ts
// Fixture nativo: nessun wrapper Lovable. I test usano solo `page`.
export { test, expect } from "@playwright/test";
```

Dopo: 0 riferimenti a `lovable-agent-playwright-config`; i test girano con `npx playwright test` (eventuale `npx playwright install chromium` per i browser).

## Fix minore — confetti duplicato (flag #2)

`src/components/celebration/Confetti.tsx` esporta `triggerConfetti` (riga 59) **ma è usato solo internamente** (riga 187, dentro `CelebrationOverlay`); l'export non è importato da nessuno (il `triggerConfetti` "vivo" usato altrove è `src/utils/ux.ts`). → **Togliere solo la parola `export`** alla riga 59 (NON cancellare la funzione, romperebbe `CelebrationOverlay`). `CelebrationOverlay` resta esportato e usato in `App.tsx`. Commit separato.

## Prompt di trasferimento — Claude Code

```
Prosecuzione nc-performance-hub — E2E config nativa + fix confetti. Leggi PRIMA docs/HANDOFF.md,
.claude/methodology/05-DEAD-CODE-AUDIT.md e docs/D9_E2E_PLAYWRIGHT_NATIVE.md.

Contesto: migrazione + cleanup già su main. Residuo Lovable: playwright.config.ts e
playwright-fixture.ts importano "lovable-agent-playwright-config" (NON in package.json, non
installato) → la config E2E non si carica, i test non girano. @playwright/test è già in devDependencies.

GUARDRAIL: italiano; lavora su un branch dedicato (es. claude/e2e-native); commit atomici;
build gate tsc --noEmit -p tsconfig.app.json verde; MAI push (sincronizzo io via GitHub Desktop);
non mescolare scope.

OBIETTIVO:
1) Sostituisci playwright.config.ts con config NATIVA @playwright/test (snippet in D9: testDir ./e2e,
   use.baseURL http://localhost:8080, webServer "npm run dev" su 8080 reuseExistingServer, project chromium).
2) Sostituisci playwright-fixture.ts con: export { test, expect } from "@playwright/test";
   (i test in e2e/core-auth.spec.ts usano solo `page`, nessun fixture custom).
3) Verifica con grep: 0 riferimenti residui a lovable-agent-playwright-config.
4) Esegui i test: `npx playwright install chromium` (se serve) poi `npx playwright test`. Riporta
   l'esito dei 6 test di e2e/core-auth.spec.ts.
5) (separato, minore) src/components/celebration/Confetti.tsx riga 59: togli SOLO `export` da
   triggerConfetti (usato internamente a riga 187; il vivo è utils/ux.ts). Non cancellare la funzione.
Commit atomici chore(...). Esplora→pianifica e proponi il piano PRIMA di modificare.
```

## Nota husky (da tenere a mente)

Il pre-commit (husky) fallisce nei commit da **GitHub Desktop** (`/bin/bash` non trovato), ma funziona quando committa **Claude Code**. Quindi: fa CC i commit, Nick fa merge/push. Se in futuro si vuole, si può rendere l'hook resiliente (task a parte).

## Rebranding → "NC Performance Hub" (aggiunto 2026-06-14)

La piattaforma va rinominata da **FitCoach / Coach Hub / CoachHub** → **"NC Performance Hub"**. Punti esatti (verificati):

| File                                                       | Riga/campo                                            | Da → A                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `index.html`                                               | 8 `<title>`                                           | → `NC Performance Hub`                                                       |
| `index.html`                                               | 10 meta author · 28 og:title · 29 twitter:title       | → `NC Performance Hub`                                                       |
| `index.html`                                               | 17 apple-mobile-web-app-title ("Coach Hub")           | → `NC Performance Hub`                                                       |
| `public/manifest.json`                                     | `name` ("Coach Hub") (+ `short_name` se presente)     | → `NC Performance Hub` (short_name può essere abbreviato, es. `NC Perf Hub`) |
| `src/components/MetaHead.tsx`                              | 10 `BASE_TITLE = "CoachHub"`                          | → `NC Performance Hub`                                                       |
| `src/components/layout/Footer.tsx`                         | 9 testo "CoachHub"                                    | → `NC Performance Hub`                                                       |
| `src/pages/Auth.tsx`                                       | 177 description · 184 `<CardTitle>`                   | → `NC Performance Hub`                                                       |
| `src/pages/legal/PrivacyPolicy.tsx` · `TermsOfService.tsx` | tutte le occorrenze "CoachHub" (nome entità + titoli) | → `NC Performance Hub`                                                       |
| `e2e/core-auth.spec.ts`                                    | 7 `toHaveTitle(/FitCoach/i)`                          | → `toHaveTitle(/NC Performance Hub/i)`                                       |

**NON cambiare in automatico (decisioni separate):** email `info@coachhub.app` / `privacy@coachhub.app` (Footer + legali) e handle twitter `@FitCoach` (index.html:26) — lasciare o aggiornare a valori reali su indicazione di Nick.

Commit dedicato `chore(branding)`, separato dai 2 commit E2E. Con questo rebrand, il test #1 (titolo) passa con `/NC Performance Hub/i`.

---

_D9 · Cowork · 2026-06-14. Spec per Claude Code; esecuzione + test lato locale._
