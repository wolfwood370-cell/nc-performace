> ⚠️ **NOTA 2026-07-12:** campagna già **ESEGUITA** (2026-06-18, v. `docs/D13_AUDIT_REPORT.md`). I rail **R8** (hand-patch `types.ts`/`appointments`) e **R9** (security = report-only/defer Lovable) sono **SUPERATI** — vedi `.claude/methodology/00-CORE.md` §9 e `CLAUDE.md` legge 11. **Anche il rail R3 («MAI push») è superato** dalla legge #8 rivista 2026-08-01: push consentito SOLO verso rami `claude/*`, chiusura via PR (`00-CORE.md §6`).

# D13 — Campagna autonoma "ultracode" per Claude Code

> **Preparato:** Cowork (planning, read-only) — esecuzione: **Claude Code** in modalità ultracode/automatica.
> Obiettivo: lavoro intenso e autonomo al massimo, **dentro i rail** di `CLAUDE.md`/`COWORK.md`.
> Decisioni Nick: scope = tutti gli stream attuabili · autonomia = **max nei rail** · parallelismo = **worktree**.
> Fonti: 2 agenti di planning read-only (moduli WIP + E2E) + analisi Cowork (hygiene + audit).

---

## 0. Come si usa

Code lavora per **Epic** (A→B→C→D), ognuno in **worktree isolato** (`.claude/worktrees/<slug>`, branch `claude/<slug>`). Ogni Epic è autosufficiente; gli stream sono per lo più indipendenti → parallelizzabili. Il prompt di kickoff è in §7.

**Modalità autonomia (max nei rail):** Code **decide e procede**; si ferma (STOP&ASK) **solo** sui casi `CLAUDE.md §5` → vedi §1. A fine di ogni Epic: riepilogo + reminder 5-step GHD a Nick. **Mai push.**

---

## 1. Rail globali (non negoziabili, valgono per OGNI commit)

| #   | Rail                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Build gate**: `npx tsc --noEmit -p tsconfig.app.json` **verde** prima di ogni commit.                                                                     |
| R2  | **Commit atomici** `tipo(area): descrizione` in italiano + `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. 1 commit = 1 intervento.              |
| R3  | **Worktree-isolated**, branch `claude/<slug>`, **mai su main**, **MAI push** (sincronizza Nick via GHD).                                                    |
| R4  | **Verifica commit** subito dopo: `git log --oneline -1` + `git status` (working tree clean).                                                                |
| R5  | **Audit gate** dopo ogni edit di `knip.config.ts`/scollegamento WIP: `npm run audit:all` → nessun **nuovo** orfano, nessun "unused ignore pattern".         |
| R6  | **Aura/theme compliance**: Coach = token Aura, Athlete = `.theme-athlete`. Mai mescolare. **Hook order**: tutti gli hook prima di ogni return early.        |
| R7  | **Empty-state ovunque**: backend nuovo con tabelle a 0 righe + **libreria esercizi vuota (SENTINEL)**. Nessuna UI deve assumere dati reali.                 |
| R8  | **Hand-patch** `types.ts`: dopo ogni merge da `origin/main`, verifica blocco `appointments` (`00-CORE §9`).                                                 |
| R9  | **Security = report-only** (legge #11, defer Lovable). **Secrets/`.env`/Stripe/Google = Nick.** Mai `git stash drop`/distruttivo senza ispezione read-only. |

**STOP & ASK (unici motivi per fermarsi)** — `CLAUDE.md §5`: possibile **data-loss**; **architettura cross-cutting ambigua** (>3 file / store nuovo); **breaking change su API pubblica** (componente in 10+ posti); **security/RLS/Stripe destructive**; conflitto fra istruzioni. Tutto il resto: **decidi, dichiara in 1 riga, procedi**.

---

## 2. Grafo dipendenze & ordine d'esecuzione

```
A (hygiene+doc)  ─┐
                  ├─►  C1 QuotaAI ─► C2 Gating ─► C3 Nutrizione ─► C4 FMS ─► C5 Periodizzazione ─►  D (E2E)  ─►  B-final (audit report)
B (audit gate) ───┘        (C1 prima di C2: condividono la superficie "pagine AI")
```

- **A** per primo (veloce, basso rischio, mette in salvo doc a rischio e ripulisce lo stato).
- **B** è un **gate continuo** (R5) + un report finale.
- **C** moduli mutuamente indipendenti → ordine consigliato **C1→C2→C3→C4→C5** (dal più isolato al più invasivo). Parallelizzabili in worktree distinti se si vuole throughput.
- **D** dopo C (lo smoke copre anche le nuove route) **oppure** in parallelo su branch proprio.

| Epic                 | Branch slug                               | Rischio     | Dipendenze         | Commit attesi |
| -------------------- | ----------------------------------------- | ----------- | ------------------ | ------------- |
| A · Hygiene & doc    | `recover-stashed-docs`, `handoff-refresh` | basso       | —                  | ~3            |
| C1 · Quota AI        | `wip-ai-quota`                            | basso       | —                  | 3             |
| C2 · Gating          | `wip-feature-gating`                      | basso/medio | C1 (superficie AI) | 3 (+1 opz)    |
| C3 · Nutrizione      | `wip-nutrition`                           | medio       | —                  | 3-4           |
| C4 · FMS/Salute      | `wip-fms-health`                          | medio/alto  | —                  | 4             |
| C5 · Periodizzazione | `wip-periodization`                       | medio/alto  | —                  | 4             |
| D · E2E smoke        | `e2e-smoke`                               | basso       | (ideale dopo C)    | 6             |

---

## 3. Epic A — Hygiene & doc recovery (FAI PER PRIMO)

**A1 — Recupero doc dagli stash GHD** (branch `claude/recover-stashed-docs`). 3 stash residui contengono le **uniche copie** di doc referenziati in `HANDOFF §7`:

- `coach-guard` → `docs/D10_COACH_ROUTE_GUARD.md`
- `e2e-native` → `docs/D9_E2E_PLAYWRIGHT_NATIVE.md` (+ artefatti Playwright, **ignorabili**)
- `oauth-migration` → **`.env` (NON committare)** + `D2,D3,D7,D8,PRODUCT_SPEC,ROADMAP,SECRETS_SETUP,DB_MIGRATION_FASE1_REPORT`

Passi: **non assumere la numerazione** (`git stash list`); gli untracked GHD stanno nel **3° parent** → `git show 'stash@{N}^3' --stat` per identificarli, poi `git checkout 'stash@{N}^3' -- docs/<file>`. Verifica dimensioni. `git add docs/ + commit` `docs: recupera D2/D3/D7/D8/D9/D10/PRODUCT_SPEC/ROADMAP dagli stash GHD`. **NON** committare `.env` (→ Nick) né gli artefatti Playwright. **`SECRETS_SETUP.md`**: ispeziona che non contenga valori segreti letterali prima di trackarlo (se sì → STOP&ASK). Droppare i 3 stash **solo dopo** conferma doc tracked + Nick ha messo al sicuro `.env`.

**A2 — Fix coerenza + refresh handoff** (branch `claude/handoff-refresh`):

- `COWORK.md §5` bullet "Code → Cowork": sostituisci _"io aggiorno HANDOFF…"_ con _"preparo il delta HANDOFF (chat/scratchpad) e lo passo a Code, che lo committa — Cowork non scrive nel repo nemmeno per HANDOFF (vedi §2.2)"_ (risolve la contraddizione §2.2↔§5).
- `docs/HANDOFF.md` refresh: D12 Set A fatto+pushato (`6dcd2fc`); stash-loop chiuso (`f6bd4b2`); dual-agent (`69e8a4a`); + questa campagna D13.
- Commit `docs: fix coerenza COWORK.md §5 + refresh stato HANDOFF`.

---

## 4. Epic B — Audit gate (continuo + report finale)

- Dopo **ogni** scollegamento WIP (R5): `npm run audit:all` → conferma che il modulo non è più orfano e che non sono comparsi nuovi export morti.
- **Report finale** (branch `claude/audit-report`, report-only): output `audit:all` annotato.
- **Set B dead-code** (`readinessMath.ts` + `constants.ts`): **NON rimuovere** — roadmap documentata (decisione D12). Rimozione solo su **conferma esplicita di Nick** → STOP&ASK.

---

## 5. Epic C — Moduli WIP (ordine C1→C5)

> Pattern card athlete-scoped da imitare: `src/components/coach/analytics/AcwrGauge.tsx` (prop `athleteId` → Skeleton → fallback su `null`). Host tab: `AthleteDetail.tsx` (trigger ~3086-3130, content ~3135-3187). Host card roster: `CoachAnalytics.tsx` (selettore atleta già presente, area libera ~riga 99). Ogni modulo collegato → **rimuovilo da `knip.config.ts` e `docs/WIP_MODULES.md`** (commit `chore(wip):`).

### C1 — Quota AI · `useAiQuota` · **S**

Dati server già scritti (`ai_usage_tracking`). Nuovo `src/components/coach/ai/AiQuotaBadge.tsx` (pill "N/limite", warning vicino al limite) reso in `MasterCopilot.tsx` + `KnowledgeBase.tsx`.
| # | Commit |
|---|---|
| 1 | `feat(coach): AiQuotaBadge (useAiQuota)` |
| 2 | `feat(coach): mostra quota AI in MasterCopilot e KnowledgeBase` |
| 3 | `chore(wip): scollega useAiQuota da knip + WIP_MODULES` |
Rischio: allineare `daily_limit` default hook (20) con la edge fn `chat-with-coach`.

### C2 — Gating · `useFeatureAccess` · **S/M**

Nuovo `src/components/common/FeatureGate.tsx` (`<FeatureGate feature="video_feedback">`). Applica a: upload video, feature AI quando `tier==='free'`, `max_active_programs` nel ProgramBuilder.
| # | Commit |
|---|---|
| 1 | `feat(auth): componente FeatureGate (useFeatureAccess)` |
| 2 | `feat(coach): gating feature premium (video/AI/programmi) via FeatureGate` |
| 3 | `chore(wip): scollega useFeatureAccess da knip + WIP_MODULES` |
Rischio: con backend nuovo i profili sono `free` → premium lockate (atteso; testa con profilo `pro` fittizio). **`src/types/database.ts`** è tipi JSONB generici **non** legati a Stripe → task separato (commit opz. `refactor(types):`), **non** confonderlo col gating.

### C3 — Nutrizione · `useCoachNutritionAnalytics` + `foodApi` · **M**

Hook empty-safe già pronto. Nuovo `src/components/coach/analytics/NutritionAdherenceCard.tsx` reso nella tab **Strategia** esistente (`StrategyContent.tsx`, coabita con la prescrizione). Opz. `FoodSearchDialog.tsx` (Open Food Facts).
| # | Commit |
|---|---|
| 1 | `feat(coach): NutritionAdherenceCard (useCoachNutritionAnalytics)` |
| 2 | `feat(coach): integra aderenza nutrizionale nella tab Strategia` |
| 3 | `feat(coach): FoodSearchDialog su Open Food Facts (foodApi)` _(opz.)_ |
| 4 | `chore(wip): scollega nutrizione da knip + WIP_MODULES` |
Rischio: tabelle a 0 righe → empty-state; `foodApi` rete esterna (CORS/errori).

### C4 — FMS/Salute · `useAthleteHealthProfile` + `useFmsAlerts` · **M/L**

`FmsScreening` = capture; questi hook = **analisi/alert** (no duplicato). Nuovo `HealthProfileTab.tsx` (semaforo) in `AthleteDetail` + `FmsContraindicationBadge.tsx` nel **ProgramBuilder**.
| # | Commit |
|---|---|
| 1 | `feat(coach): HealthProfileTab semaforo clinico (useAthleteHealthProfile)` |
| 2 | `feat(coach): aggancia tab Salute in AthleteDetail` |
| 3 | `feat(coach): warning controindicazioni FMS nel Program Builder (useFmsAlerts)` |
| 4 | `chore(wip): scollega FMS/salute da knip + WIP_MODULES` |
Rischio: il commit 3 dipende dalla struttura del render-row esercizio in ProgramBuilder (non ancora ispezionata) → se complesso, fai 1+2 e lascia `useFmsAlerts` in WIP fino al 3.

### C5 — Periodizzazione · `usePeriodization` + `useCoachTrainingBlocks` · **M/L**

`usePeriodization` (CRUD `training_phases`, `athleteId`) → nuovo `PeriodizationTab.tsx` in `AthleteDetail`. `useCoachTrainingBlocks` (roster) → `TrainingBlocksTimeline.tsx` in `CoachAnalytics`.
| # | Commit |
|---|---|
| 1 | `feat(coach): PeriodizationTab con CRUD fasi (usePeriodization)` |
| 2 | `feat(coach): aggancia tab Periodizzazione in AthleteDetail` |
| 3 | `feat(coach): card TrainingBlocksTimeline in CoachAnalytics (useCoachTrainingBlocks)` (aggiorna docstring hook: rimuovi ref MacroCycleTimeline) |
| 4 | `chore(wip): scollega periodizzazione da knip + WIP_MODULES` |
Rischio: verifica il nome constraint FK `training_phases_athlete_id_fkey` (il join fallisce a runtime se diverso); 0 righe → empty-state. **`useCyclePhasing`** (ciclo mestruale, athlete-side) resta **WIP** (fuori scope coach).

---

## 6. Epic D — E2E smoke Playwright

`testDir = ./e2e` (NON `tests/`), 1 sola spec esistente (`core-auth.spec.ts`, 6 test unauth). Nessun `data-testid` → selettori URL/`aria-label`/`getByRole`. Utente test **`test@test.com` (coach, D3 §6)** per la fixture, credenziali via **env** (`E2E_COACH_EMAIL`/`PASSWORD`) — **mai** hardcoded; se assenti, i project autenticati fanno **skip** pulito.

| #   | Commit                                                          | Contenuto                                                                                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `test(e2e): rafforza guard redirect unauth (no waitForTimeout)` | `e2e/guards-redirect.spec.ts` (15 coach + 6 atleta, `waitForURL`)                                            |
| 2   | `test(e2e): smoke UI pagina /auth`                              | `e2e/auth-page.spec.ts` (tab, role picker, forgot-pw; `{exact:true}`)                                        |
| 3   | `chore(e2e): project autenticato + auth.setup + .gitignore`     | `e2e/auth.setup.ts`, `playwright.config.ts` (project `setup`+`chromium-coach`), `e2e/.auth/` in `.gitignore` |
| 4   | `test(e2e): smoke 15 route coach (roster vuoto safe)`           | `e2e/coach-smoke.spec.ts` (landmark `aria-label="Impostazioni"`; filtra errori rete `*.supabase.co`)         |
| 5   | `test(e2e): redirect role-mismatch coach→/coach`                | `e2e/role-guard.spec.ts` (caso atleta gated/skip)                                                            |
| 6   | `test(e2e): smoke statico onboarding` _(opz.)_                  | `e2e/onboarding-smoke.spec.ts`                                                                               |

Esecuzione: `npx playwright install chromium` (una tantum) → `npx playwright test`. Regola: smoke = render + redirect/guard + landmark; **nessuna scrittura DB**, niente dipendenza da seed. Mitigazioni flakiness: `waitForURL`/web-first assertions, `{exact:true}`, filtro `pageerror` su domini Supabase.

---

## 7. Definition of Done & STOP&ASK per unità

**DoD** (ogni commit): R1 `tsc` verde · R5 audit pulito (se tocca knip) · feature **renderizza con empty-state** su backend vuoto · R4 commit verificato · branch corretto, no push.
**DoD** (ogni Epic): riepilogo a Nick (file toccati, hash commit, delta righe) + reminder 5-step GHD.

**Fuori scope / a Nick** (non agire senza conferma): `.env` (recupero/uso) · popolamento **libreria esercizi** · rimozione **Set B** (readinessMath/constants) · `useCyclePhasing` · `src/types/database.ts` (task tipi JSONB separato) · qualsiasi **security/RLS/Stripe** destructive.

---

## 8. Prompt di kickoff — Claude Code (ultracode)

```
Ultracode / automatic. Esegui la campagna autonoma docs/D13_AUTONOMOUS_CAMPAIGN.md su nc-performance-hub.
Leggi PRIMA: CLAUDE.md + .claude/methodology/00-CORE.md + D13. Per ogni Epic apri il file di metodologia
rilevante (01-COACH-PLATFORM per i moduli WIP; 05-DEAD-CODE per audit; 02-ATHLETE-APP se tocchi athlete).

Modalità: MAX AUTONOMIA NEI RAIL. Decidi e procedi; STOP&ASK solo sui casi CLAUDE.md §5
(data-loss, architettura cross-cutting ambigua, security/RLS/Stripe, breaking API pubblica).
Per ogni unità: worktree .claude/worktrees/<slug> + branch claude/<slug>; build gate
tsc --noEmit -p tsconfig.app.json verde; commit atomico italiano + Co-Authored-By; npm run audit:all
dopo i bookkeeping; verifica commit (git log -1 + git status). MAI push. Empty-state ovunque
(backend vuoto + libreria esercizi SENTINEL). Security report-only; secrets/.env = Nick.

Ordine: A (hygiene+doc) → C1 QuotaAI → C2 Gating → C3 Nutrizione → C4 FMS → C5 Periodizzazione → D E2E
→ audit report finale. A fine di OGNI Epic: riepilogo (hash, file, delta) + reminder 5-step GitHub Desktop.
Inizia da Epic A e procedi; fermati a fine Epic per il mio merge/push, poi continua col successivo.
```

---

_D13 — campagna autonoma. Draft Cowork (scratchpad); committare in repo via Code se serve come riferimento persistente. Esecuzione: Code ultracode._
