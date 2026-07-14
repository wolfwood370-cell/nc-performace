# Task: Form intake Fase 2 — config-driven, modality-aware, submit via edge fn

**Data:** 2026-07-14
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** `claude/intake-form-fase2`

---

## 1. Obiettivo (perché)

Un atleta invitato (con `coaching_mode`/`tier` già settati dall'invito) fa login, viene mandato a `/onboarding` (guard esistente) e compila UN form che si adatta a `coaching_mode`; al submit il payload va alla edge fn `submit-intake` — MAI più una `profiles.update` client-side. L'UI mostra l'esito REALE della edge fn. Il ritiro del write client sblocca l'hardening Cowork su `medical_clearance_required`/`red_flags`/`fms_exclusion_zones` (gate di go-live, HANDOFF §0).

## 2. Contratto

- **Input:** contratto payload = `supabase/functions/submit-intake/intake/validate.ts` + `validateParts.ts` + `validateSpec.ts` (single-source, NON toccati). Risposta = `submit-intake/index.ts`: `gate.routedOut===true` SEMPRE prioritario e indipendente da `ok`; solo il caso minore è `ok:false` a 200 senza persistenza; poi 401/403/409/400/413/500 con codici macchina.
- **Output:** modulo `src/features/intake/**` — config tipizzata (struttura=dato, valori dai single-source importati), `buildPayload` puro, `submit.ts` I/O (`FunctionsHttpError.context` per i body non-2xx), shell UI `.theme-athlete` mobile-first, esiti renderizzati.
- **Invarianti:** zero scritture DB client nel percorso intake · gate solo-server (nessun import dei moduli di scoring/semaforo lato client; solo costanti pure) · niente enum ricopiati a mano · stringhe-utente IT, valori-macchina come nel validator · art. 9: nessun dato salute in log/errori · neurotipo: ordine q01→q30 vincolante, lettere A-E, mai etichette di gruppo (copy paginazione neutro).

## 3. File

- **NUOVI:** `src/features/intake/{config/{model,labels,stepsCore,stepsProfile,intakeForm,neurotypeItems},state,store,validation,buildPayload,submit,IntakeForm,IntakeOutcome}.{ts,tsx}` · `components/{OptionButtons,FieldRenderer,StringListField}.tsx` · `steps/{ConsentsStep,FieldsStep,InjuriesStep,NeurotypeStep}.tsx` · `__tests__/{buildPayload,config,validation}.test.ts` · `vitest.config.ts` · questo prompt-file.
- **MODIFICATI:** `src/App.tsx` (rotta `/onboarding` → `IntakeForm`) · `src/integrations/supabase/types.ts` (regen post-apply) · `src/hooks/useAuth.tsx` (`Profile` + `coaching_mode`/`tier`/`objective`) · `package.json` (vitest, script `test`).
- **RITIRATI:** `src/pages/onboarding/OnboardingWizard.tsx` (write client `profiles`/`coach_alerts`) · `src/types/onboarding.ts` (`analyzeOnboarding` + set 15-Q) · `src/components/onboarding/**` (5 componenti, incluso `StepIndicator` — v. deviazioni).
- **VIETATI:** `supabase/functions/**` · migrazioni/DDL · `generate-program` · `zoneMap.ts` · `stripe-webhook` · `daily_readiness` · `subscription_tier` · `invite-athlete` · il trigger. (Rispettato: la fetta è solo FE + regen tipi.)

## 4. Acceptance (falsificabili)

- [x] `npx tsc --noEmit -p tsconfig.app.json` verde a ogni commit.
- [x] `npx vitest run` verde (28 test), inclusa la **parità col validatore server reale** (`validateIntakePayload` importato nei test): payload coached e autonomous accettati; coached NON passa la validazione autonomous.
- [x] Grep = 0: `analyzeOnboarding` · import `types/onboarding` · `components/onboarding` · scritture `update/insert/upsert` in `src/features/intake/**`.
- [x] `types.ts` rigenerato contiene: `coaching_mode`/`tier`/`objective` (profiles), `pregnancy`/`cycle_status` (athlete_cycle_settings), `consents`/`audit_log`/`method_config`/`tier_entitlements`, RPC `submit_intake`; diff solo-additivo, `appointments` intatto.
- [x] Zero hex raw e zero token Aura coach in `src/features/intake/**` (solo `var(--nc-*)` + shadcn neutri).
- [x] `npm run build` (produzione) verde.

## 5. Verifica

- Build gate + vitest a ogni commit; smoke browser su dev server worktree: `/onboarding` da anonimo → redirect ad accesso senza errori console.
- Review avversariale multi-agente di fine fetta (4 lenti: contratto, security/art.9, React/stato, refuter-test) + verificatori scettici sui finding — esiti nell'Addendum.
- **E2E col submit reale: Nick lo chiude sul primo invito reale** (nessun atleta di test disponibile; l'invio è one-shot per atleta e il flusso autenticato non è raggiungibile da anonimo — non bloccante, decisione 2026-07-14).

## 6. Chiusura

Commit atomici in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`; aggiornati `docs/HANDOFF.md §0` + RETRO in `docs/auto-miglioramento.md`; merge/push = Nick (GitHub Desktop). Post-merge (Cowork, benestare Nick): hardening `medical_clearance_required`/`red_flags`/`fms_exclusion_zones` ora sbloccato.

---

## ADDENDUM ESECUZIONE — decisioni all'OK (Nick, 2026-07-14) e deviazioni

**Decisioni A–F:**

- **A** — Testi PAR-Q ×7: verbatim da `nc-questionnaire/docs/intake-contract.md §B2` (accenti sistemati), ordine/concetti 1:1 con `PARQ_KEYS`. NON derivati dalle chiavi.
- **B** — Testi dolore/calo-peso/condition/medications approvati, con correzione: **`condition` senza esempi tra parentesi** (una lista su un campo-gate invita falsi "no").
- **C** — Consensi: testi nc-questionnaire riusati come bozza `hub-v1`, poi **APPROVATI tutti e 6 da Nick il 2026-07-14** (medical_sharing riformulato da lui in `2bb5c23` + nota privacy/art. 9 nello step).
- **D** — Copy routed-out approvato (minore/gravidanza/DCA, neutro, zero punteggi).
- **E** — **vitest** aggiunto (primo runner unit FE): solo unit, environment node, niente jsdom.
- **F** — Tema: wrapper `.theme-athlete` + var `--nc-*`.

**Deviazioni dichiarate in esecuzione:**

1. **`StepIndicator` NON riusato ed eliminato col legacy**: il nuovo flusso ha 12–17 passi (contro 8) — una fila di cerchi non sta su mobile; sostituito da header "Passo X di Y" + barra di progresso. Se Nick lo rivuole, è recuperabile da git.
2. **Neurotipo = 5 step-pagina** (`neurotipo-1..5`, 6 affermazioni l'una) invece di un singolo step paginato internamente: navigazione e validazione per pagina native della shell. Copy neutro "Pagina X di 5".
3. **`buildIntakePayload(state)` senza parametro mode**: la modalità governa solo cosa la UI raccoglie; il server rilegge `coaching_mode` dal profilo.
4. Regen tipi via **connettore OAuth** (CLI `supabase` non installata — lezione 2026-07-05 riconfermata); pre-flight `list_migrations`: le 3 migration intake E `20260714101458` (hardening mode/tier) risultano **applicate live**.
5. `.env.local` **copiato** (non committato) dal checkout principale al worktree per lo smoke del dev server.
6. Campi client-required oltre il minimo server (dichiarati): `full_name`, `experience_level`, `max_days_week`, `stress_level`, `sleep_quality` — alimentano motore/semaforo (parità col wizard legacy su stress/sonno).

**Esito review avversariale (fine fetta, 4 lenti + verificatori scettici):** 19 finding grezzi → 4 major CONFERMATI, 0 refutati, 11 minor. Tutti chiusi nel commit `12a0ecf` tranne un no-fix dichiarato: jump per-pagina sugli errori server `neurotype_answers` (il validatore non emette mai il campo per-item; il gate client rende il caso irraggiungibile). Major chiusi: (1) draft cancellato su authError in contraddizione con la copy → pulizia solo su esiti terminali; (2) draft art. 9 non user-scoped né rimosso al signOut → `claimOwner()` + rimozione chiave in `signOut` + purge su onboarding-completato-altrove + deep-merge anti-crash sul persist; (3) ordine 30-Q pinnato solo primo/ultimo → pin integrale dell'array; (4) mapping risposta→esito non testato → estratto puro in `outcome.ts` + 4 test dedicati (dominanza routedOut inclusa).
