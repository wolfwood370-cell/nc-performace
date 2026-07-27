# Fetta 2 — checkout test-mode

**Task:** Chiudere il giro pagamento → entitlement in test-mode
**Data:** 2026-07-20
**Strumento di destinazione:** ☑ Claude Code
**Branch:** `claude/checkout-test-mode`

## 1. Obiettivo (perché)

Oggi un atleta può pagare e non ottenere nulla: il webhook Stripe scrive sulla cache
profilo valori fuori enum ignorando l'errore, deriva il tier dal NOME del piano, e legge
campi che l'API Basil ha spostato. Questa fetta rende il pagamento un fatto osservabile:
si paga → l'accesso si accende, si smette → si spegne.

## 2. Contratto

- **Input:** eventi Stripe firmati (5 tipi già gestiti), API version `2025-08-27.basil`.
- **Output atteso:** `athlete_subscriptions` allineata, cache `profiles`
  {`tier`, `subscription_tier`, `subscription_status`} coerente, UI atleta per comprare e
  gestire l'abbonamento.
- **Contratti request/response INVARIATI:** checkout `{plan_id, athlete_id} → {url}` ·
  portal `{} → {url}` · webhook 2xx/4xx/5xx · `corsHeaders` · frontend del coach.

**Invarianti:**

1. Mai 2xx con lavoro DB fallito. Il 2xx spegne i retry di Stripe: un 2xx bugiardo è un
   abbonamento perso in silenzio.
2. Mai valori fuori dagli enum di destinazione. Sono due e diversi:
   `subscription_status` {active, past_due, canceled, trial, none} e `billing_sub_status`
   {active, past_due, canceled, incomplete, canceling}.
3. Estrattori Basil mai in throw, forma nuova E legacy: la forma la decide l'API version
   dell'ENDPOINT webhook, non l'SDK importato.
4. Tier = DATO (colonna con CHECK, valori = chiavi di `tier_entitlements`), mai derivato da
   stringhe di presentazione.
5. Whitelist origini (F1), `_shared/apiKeys.ts`, `_shared/origins.ts`, `supabase/config.toml`
   intatti. Zero policy RLS nuove, zero `SECURITY DEFINER` nuove, `stripe_events` senza policy.
6. Determinismo nei moduli puri: niente `Date.now`/`Math.random` (i timestamp sono I/O).
7. Niente dati carta nel DB (PCI = Stripe). Stringhe utente in italiano.

## 3. File

**Nuovi:** `supabase/functions/_shared/billing.ts` · `_shared/billing.test.ts` ·
`supabase/migrations/20260720150000_billing_plans_tier_canonico.sql` ·
`supabase/migrations/20260720150100_athlete_subscriptions_unique.sql` ·
`src/lib/billing/access.ts` · `src/lib/billing/__tests__/access.test.ts` ·
`src/hooks/athlete/usePaymentOutcome.ts` · `src/components/athlete/SubscriptionSection.tsx` ·
questo prompt-file.

**Modificati:** `stripe-webhook/index.ts` · `create-checkout-session/index.ts` (SOLO il
blocco insert, deroga circoscritta) · `useBillingPlans.ts` · `useNutritionEntitlement.ts` ·
`AthleteProfile.tsx` · `AthleteDashboard.tsx` · `App.tsx` (alias di rotta).

**VIETATI:** `create-portal-session/**` · `release-autonomous-program/**` ·
`_shared/apiKeys*` · `_shared/origins*` · `_shared/email|method|nutrition/**` ·
`supabase/config.toml` · `src/components/auth/SubscriptionGuard.tsx` · frontend del coach.

## 4. Decisioni prese durante la fetta (superano la spec originale)

| #   | Decisione                                                                                                                                                                                                                                                                     | Perché                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `hasActiveAccess` = `coaching_mode='coached'` OPPURE `access_until` strettamente nel futuro _(testo corretto il 2026-07-27: la versione originale citava `subscription_status ∈ {active,trial}`, contratto superato dal flip del predicato — sess.87, fetta accesso-lettura)_ | Gli atleti coached li fattura il coach fuori piattaforma: senza il ramo coached li chiuderemmo fuori dalle loro funzioni.                                                                                                     |
| D2  | `profiles.tier` è la colonna canonica; `subscription_tier` resta come specchio legacy                                                                                                                                                                                         | `tier_entitlements` è chiavata su `tier`. Lo specchio serve alla vista Business del coach (MRR): verificato che scriverci il valore canonico non cambia comportamento (`coach_products` è a 0 righe → già oggi fallback €50). |
| D3  | `billing_plans.tier` NOT NULL DEFAULT 'monthly' + guardia anti-declassamento                                                                                                                                                                                                  | La UI coach non scrive ancora la colonna: ogni piano nasce 'monthly', incluso uno chiamato "Premium". La guardia impedisce che un atleta premium venga declassato.                                                            |
| D4  | 2 indici UNIQUE su `athlete_subscriptions` + upsert idempotente nel checkout                                                                                                                                                                                                  | Senza vincolo, un doppio click crea due righe e il webhook fail-fast entra in 500-loop con l'abbonamento pagato e mai attivato.                                                                                               |
| D5  | success_url risolta con un **alias di rotta**, non toccando la fn                                                                                                                                                                                                             | `/athlete/dashboard` non esisteva (la index è `/athlete`): si atterrava sulla 404.                                                                                                                                            |
| D6  | Gate abbonamento sul rilascio autonomo **rinviato a F4**                                                                                                                                                                                                                      | È il tema di F4 (enforcement server-side su tutte le funzioni, un pattern solo). `gate:true` è il segnale CLINICO §0 e non va diluito da un blocco commerciale.                                                               |

## 5. Acceptance

- ☑ `npx deno test --no-lock supabase/functions/_shared/` → 241/241 (63 nuovi)
- ☑ `npx deno check --no-lock --node-modules-dir=none` su `stripe-webhook/index.ts` e
  `create-checkout-session/index.ts`
- ☑ `npx tsc --noEmit -p tsconfig.app.json` verde
- ☑ `npm test` → 104/104 su 9 file
- ☑ `git diff` su `create-checkout-session` = un solo hunk contiguo (il blocco insert)
- ☐ **Smoke (Nick, post-deploy):** acquisto test → riga `active` + profilo scritto → **il tab
  Nutrizione compare senza reload** (meccanismo `refreshSession`: da PROVARE, non assumere)
- ☐ **Smoke:** ri-consegna dello stesso evento dalla dashboard Stripe → 2xx e ZERO effetti
- ☐ **Smoke:** `invoice.payment_failed` → `past_due` su riga e profilo → il tab sparisce

## 6. Ordine di rilascio (vincolante)

1. Cowork applica le 2 migration (version concordata; SQL byte-identica ai file-specchio).
2. `npm run gen:types`.
3. Deploy `stripe-webhook` + `create-checkout-session`.

L'ordine non è invertibile: entrambe le funzioni usano `onConflict` su
`(athlete_id, plan_id)`, che senza l'indice UNIQUE fallisce con `42P10`.

## 7. Chiusura

Commit atomici su branch, verifica-commit immediata, RETRO in `docs/auto-miglioramento.md`.
Merge/push = Nick.
