# HANDOFF — nc-performance-hub (trasferimento sessione)

> **Aggiornato:** 2026-06-18 (Claude Code). Migrazione Lovable→Supabase di proprietà avanzata: smoke AI 6/6, flusso invito→atleta verificato, fix cache roster, **`generate-program` cablata nella UI (D11)**, **D12 Set A pulizia dead-code ACWR fatto**, **dual-agent Code/Cowork formalizzato (`COWORK.md`, `69e8a4a`)**, **campagna autonoma D13 COMPLETA** (7 hook WIP collegati + E2E verde + audit pulito). Codice su `origin/main` (tip `2296074`).
> **Priorità aperta:** la **libreria esercizi è vuota** sul backend nuovo (buco di migrazione) → blocca il program-building reale (vedi §4 r.8).
> Scopo: riprendere da una chat nuova (Cowork **o** Claude Code) senza perdere contesto. Prompt pronti in §8 (Claude Code) e §9 (Cowork).
> ✅ **Stash-loop GitHub Desktop CHIUSO (2026-06-17):** `HANDOFF.md` + piani D11/D12 (`f6bd4b2`) e i doc di riferimento D2/D3/D7/D8/D9/D10/PRODUCT_SPEC/ROADMAP/… (recuperati dagli stash GHD, `1de3b7f`) sono ora **trackati**. Restano 3 stash GHD da droppare dopo che Nick mette al sicuro `.env` — vedi §5.

---

## 1. In una riga

Migrazione di **nc-performance-hub** (coaching dual-interface: Coach "Aura" web + Atleta PWA) da **Lovable Cloud** a **Supabase di proprietà** (ref `xgxtplqlewpqjzghvbke`). AI→OpenAI **validata 6/6**, login Google **attivo**, invito→atleta **verificato**, fix roster + **`generate-program` cablata**. Restano: **popolare la libreria esercizi** (§4 r.8), collegare i moduli WIP, e il cutover finale del `.env`.

## 2. Stato attuale (fattuale)

- **Supabase di proprietà.** Ref **`xgxtplqlewpqjzghvbke`**, region `eu-central-1`, org `umydelvpdzieopddfhpf`. URL `https://xgxtplqlewpqjzghvbke.supabase.co` · publishable key `sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f`. 54 tabelle, **RLS attiva ovunque**, advisor security 0 ERROR.
- **6 funzioni AI su OpenAI, validate live:** ✅ `ask-copilot`, `analyze-meal-photo`, `chat-with-coach`, `generate-batch-checkins` (2026-06-14) · ✅ `generate-program` (gpt-5.2) e `analyze-athlete-week` (gpt-5.4-mini) (2026-06-15, atleta reale `wolfwood370` id `912d6214`). `OPENAI_API_KEY` con credito; secret OK (OpenAI/Resend/Stripe test).
- **Login Google attivo.** Coach = `nctrainingsystems@gmail.com` (id `af93b1cd`). **Atleti = su invito.** Meccanismo verificato: la **UI invito scrive `invite_tokens`**; al **signup Google** il trigger `handle_new_user` collega via path `invite_tokens` (email) → `profiles.coach_id` + `used=true`. NB profilo prende il nome dall'account Google. (La edge fn `invite-athlete`/`generateLink` è un path alternativo non usato dalla UI.)
- **Git: `origin/main` (tip `2296074`).** Mergiati: migrazione, audit, E2E nativa, rebranding, guard coach, **fix cache roster** (`2a57af1`), **generate-program UI** (`8735e0d`+`afb9e1e`), **D12 Set A** (`6dcd2fc`), **track/recupero doc** (`f6bd4b2`/`1de3b7f`), **dual-agent `COWORK.md`** (`69e8a4a`), e l'intera **campagna autonoma D13** (Epic A + C1–C5 + D E2E + B audit-report). Working tree pulito.
- **Campagna autonoma D13 COMPLETA (2026-06-18).** 7 hook WIP collegati alla UI coach: **Quota AI** (`AiQuotaBadge` in Master Copilot + AI Brain), **Gating** (`FeatureGate` su video/AI/`max_active_programs`), **Nutrizione** (`NutritionAdherenceCard` nella tab Strategia), **FMS/Salute** (tab Salute `HealthProfileTab` + `FmsContraindicationBadge` nel Program Builder), **Periodizzazione** (`PeriodizationTab` CRUD + `TrainingBlocksTimeline`). **Suite E2E** Playwright verde (**30 pass / 17 skip** senza credenziali). **Audit pulito** — nessun nuovo dead-code, report annotato in `docs/D13_AUDIT_REPORT.md`. Ogni Epic verificato (tsc + `audit:all` + review avversariale multi-agente). Spec/piano: `docs/D13_AUTONOMOUS_CAMPAIGN.md`.
- **Libreria esercizi ANCORA VUOTA (SENTINEL)** (`exercises` 0 righe); tabelle backend per lo più vuote. Nessun seed/INSERT nelle 125 migration, nessun `supabase/seed.sql` → i dati esistevano solo nel vecchio DB Lovable. FE puntato al backend nuovo via `.env.local` (**TEMP**, non è il cutover D6). Vedi §4 r.8.
- **Qualità:** audit (solo `ai-error` rimosso, WIP tenuti in `docs/WIP_MODULES.md`) · E2E nativa 6/6 · rebranding "NC Performance Hub" · `ProtectedCoachRoute` su 15 route · fix roster `src/lib/coachQueries.ts` · `generate-program` cablata (`GenerateAiWeekDialog` + `useGenerateProgram` + `mapAiDaysToSessions` + store `replaceWeekWithAiProgram`) · **D12 Set A** dead-code ACWR rimosso (`6dcd2fc`, `tsc` verde + audit pulito).
- **Lovable resta intatto** → rollback a costo ~zero fino al cutover.

## 3. Decisioni

**Chiuse:** D1 schema-only · D2 AI→OpenAI (validata 6/6) · D3 OAuth Google · audit · E2E · rebranding · guard coach · smoke AI + invito (2026-06-15) · fix cache roster (2026-06-15) · **generate-program UI (D11, 2026-06-16)** · **D12 Set A cleanup ACWR (2026-06-17, `6dcd2fc`)** · **dual-agent Code/Cowork formalizzato (`COWORK.md`, 2026-06-18, `69e8a4a`)** · **campagna autonoma D13 COMPLETA (2026-06-18)** — 7 hook WIP collegati + suite E2E verde + audit pulito (`docs/D13_AUDIT_REPORT.md`).
**Aperte:** **D4** hosting FE (Cloudflare Pages vs Vercel) · **D5** security report-only (= Lovable) · **D6** timing cutover `.env` · **libreria esercizi** (come popolarla, §4 r.8) · **D12 Set B** (`readinessMath`/`constants`) **tenuto** — rimuovere solo su conferma esplicita di abbandono della feature readiness.

## 4. Prossimi passi

| #   | Passo                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | ✅ **FATTO** Smoke AI 6/6 con atleta reale.                                                                                                                                                                                                                                                                                                                                                                            | 👤 + 🤝           |
| 2   | ✅ **FATTO** Flusso invito→atleta verificato.                                                                                                                                                                                                                                                                                                                                                                          | 👤 + 🤝           |
| 3   | ✅ **FATTO 2026-06-18 (campagna D13)** Collegati 7 hook WIP coach (Quota AI, Gating, Nutrizione, FMS/Salute, Periodizzazione) + suite E2E + audit report. Restano WIP solo moduli athlete-side/infra (offline/PWA, ciclo mestruale, media, foodApi) — `docs/WIP_MODULES.md`.                                                                                                                                           | Claude Code       |
| 4   | **Cutover finale** `.env`/backend (D6/D4) + scollegare Lovable. (Ora override locale `.env.local` → backend nuovo.)                                                                                                                                                                                                                                                                                                    | 👤                |
| 5   | Minori: hook husky, email/handle legacy, tidy RLS `{public}`→`{authenticated}`                                                                                                                                                                                                                                                                                                                                         | 👤 / CC / Lovable |
| 6   | ✅ **FATTO+VALIDATO 2026-06-15** (`2a57af1`) Fix cache lista atleti: `coachQueries.ts` `COACH_ROSTER_QUERY_OPTS` su 7 letture roster. `/coach/athletes` mostra l'atleta.                                                                                                                                                                                                                                               | Claude Code       |
| 7   | ✅ **FATTO 2026-06-16** (`8735e0d` feat + `afb9e1e` cleanup) `generate-program` cablata: `GenerateAiWeekDialog` (header ProgramBuilder) → hook → mapper → store. Fallback **SENTINEL** `UNLINKED_EXERCISE_ID` finché libreria vuota. Piano: `docs/D11_GENERATE_PROGRAM_PLAN.md`.                                                                                                                                       | Claude Code       |
| 8   | **Popolare la libreria esercizi** — `exercises` vuota (0 righe); nessun seed nelle 125 migration né `seed.sql` → i dati erano solo nel vecchio DB Lovable. Blocca program-building reale (manuale **e** AI → tutto SENTINEL). **Deferito 2026-06-16: Nick aggiungerà gli esercizi in seguito.** Opzioni alla ripresa: (a) export da Lovable → import via connettore; (b) seed curato nel repo; (c) inserimento via UI. | 👤                |
| 9   | ✅ **FATTO 2026-06-17** (`6dcd2fc`) **D12 Set A** — rimossi `useAcwrData`+`trainingMetrics` (duplicato ACWR morto), `tsc` verde + audit pulito. Set B (`readinessMath`/`constants`) **tenuto** (roadmap). Piano: `docs/D12_DEADCODE_ACWR_CLEANUP_PLAN.md`.                                                                                                                                                             | Claude Code       |
| 10  | **`.env` + stash GHD** — estrai/metti al sicuro il `.env` dallo stash `oauth-migration`, **poi droppa** i 3 stash residui (`coach-guard`, `e2e-native`, `oauth-migration`). I doc unici sono già recuperati e trackati (`1de3b7f`); negli stash restano solo `.env` (secret) + artefatti Playwright (rigenerabili).                                                                                                    | 👤 + CC           |
| 11  | **Credenziali E2E** — impostare `E2E_COACH_EMAIL`/`E2E_COACH_PASSWORD` (coach `test@test.com`, D3 §6) per attivare i **17 test autenticati** skippati della suite Playwright (project `chromium-coach`).                                                                                                                                                                                                               | 👤                |
| 12  | **D12 Set B** (`readinessMath`/`constants`) — decisione: **tieni** (default, roadmap readiness) o rimuovi se la feature è abbandonata. Rimozione SOLO su conferma esplicita → STOP&ASK.                                                                                                                                                                                                                                | 👤                |
| 13  | **Token `--warning` marrone in light** — in `forced-light` (`App.tsx`) `--warning` è `#774616` (tertiary-container) → `text-warning` rende marrone non ambra. Riguarda `AcwrGauge` + card D13. Micro-task cosmetico cross-cutting (decisione design).                                                                                                                                                                  | 👤 / CC           |

## 5. Tooling & workflow

- **Si alternano** Cowork (infra/connettore/test Chrome/doc) e **Claude Code** (codice/branch/commit). Stesso checkout.
- **Branch hygiene (CC):** non committare su `main`; usare `claude/<slug>`.
- **Push/merge:** li fa **Nick via GitHub Desktop** (MAI Cowork/CC).
- **✅ Stash-loop GHD risolto (2026-06-17):** prima, a ogni branch switch GHD stashava le modifiche non committate **inclusi i file untracked** → i doc "sparivano" (accumulati 6 stash `!!GitHub_Desktop<branch>`). **Fix applicato:** tutti i doc di riferimento sono ora **trackati** (`f6bd4b2` HANDOFF+D11/D12; `1de3b7f` recupero D2/D3/D7/D8/D9/D10/PRODUCT_SPEC/ROADMAP/CLAUDE_CODE_SETUP/DB_MIGRATION\*/SECRETS_SETUP dagli stash). **Restano 3 stash** (`coach-guard`, `e2e-native`, `oauth-migration`) con ancora `.env` (secret) + artefatti Playwright: **droppare SOLO dopo** che Nick ha messo al sicuro `.env` (vedi §4 r.10). Lezione: i doc vanno committati, mai lasciati untracked.
- **Cowork sandbox:** file montati con NUL padding → usa `Read`/`grep -a`; `git status` mostra tutto il tree modificato (CRLF, falso) e può lasciare `index.lock` → git read-only in Cowork; `knip`/`depcheck` in CC.
- Anteprima/dev = `npm run dev` (`localhost:8080`).

## 6. Guardrail (vincolanti)

Risposte/commit **italiano** · **MAI push** (sincronizza Nick) · build gate `tsc --noEmit -p tsconfig.app.json` verde · commit atomici · secrets/credenziali/Stripe/Google = Nick · security D5 report-only (legge #11) · niente operazioni distruttive senza conferma · confermare costo prima di creare risorse Supabase.

## 7. Documenti di riferimento

Tutti **trackati** (2026-06-18): `CLAUDE.md` · `COWORK.md` + `.claude/methodology/*` · `docs/D2_OPENAI_MIGRATION_CONTRACT.md` · `docs/D3_TEST_200_RUNBOOK.md` · `docs/D7_GOOGLE_OAUTH_SETUP.md` · `docs/D8_AUDIT_CODICE_MORTO.md` · `docs/D9_E2E_PLAYWRIGHT_NATIVE.md` · `docs/D10_COACH_ROUTE_GUARD.md` · `docs/D11_GENERATE_PROGRAM_PLAN.md` · `docs/D12_DEADCODE_ACWR_CLEANUP_PLAN.md` · `docs/WIP_MODULES.md` · `docs/CLAUDE_CODE_SETUP.md` · `docs/DB_MIGRATION.md` · `docs/DB_MIGRATION_PREFLIGHT.md` · `docs/DB_MIGRATION_FASE1_REPORT.md` · `docs/SECRETS_SETUP.md` · `docs/PRODUCT_SPEC.md` · `docs/ROADMAP.md` · `docs/UX_UI_DESIGN_SYSTEM.md` · `docs/D13_AUTONOMOUS_CAMPAIGN.md` · `docs/D13_AUDIT_REPORT.md`.

---

## 8. PROMPT DI TRASFERIMENTO — Claude Code (lavoro su CODICE)

```
Prosecuzione nc-performance-hub (Lovable → Supabase mio). Leggi PRIMA docs/HANDOFF.md
+ CLAUDE.md + .claude/methodology/00-CORE.md.

Stato (2026-06-18): smoke AI 6/6, invito→atleta ok, generate-program CABLATA (8735e0d),
D12 Set A dead-code rimosso (6dcd2fc), e CAMPAGNA D13 COMPLETA (7 hook WIP collegati, suite
E2E verde, audit pulito docs/D13_AUDIT_REPORT.md). Tutto su origin/main (tip 2296074). NB: la
libreria esercizi è ANCORA VUOTA (§4 r.8) → i programmi referenziano esercizi SENTINEL finché
non viene popolata.

GUARDRAIL: italiano; all'inizio VERIFICA il branch e crea claude/<slug> (NON su main); MAI push
(sincronizzo io); build gate tsc --noEmit -p tsconfig.app.json verde; commit atomici; secrets le
imposto io; security D5 report-only (legge #11). MONITORA il contesto: a ~85% fermati, dichiaralo e
prepara handoff + prompt di ripartenza. Esplora→pianifica e proponi il piano PRIMA di modificare.

OBIETTIVO (dimmi tu quale): collegare un modulo WIP da docs/WIP_MODULES.md, o un fix FE.
Esplora→pianifica e proponi il piano PRIMA di modificare.
```

## 9. PROMPT DI TRASFERIMENTO — Cowork (lavoro su CONNETTORE/INFRA)

```
Prosecuzione nc-performance-hub su Cowork. Leggi PRIMA COWORK.md (corsia Cowork) + docs/HANDOFF.md.

Stato (2026-06-18): dual-agent attivo (CLAUDE.md §0 → COWORK.md tracked). D12 dead-code Set A fatto;
Set B tenuto. Campagna D13 COMPLETA su main: 7 hook WIP collegati (Quota AI, Gating, Nutrizione,
FMS/Salute, Periodizzazione), suite E2E verde, audit pulito. Backend ref xgxtplqlewpqjzghvbke con
tabelle per lo più vuote; LIBRERIA ESERCIZI ANCORA VUOTA (SENTINEL); FE su .env.local (TEMP).

CORSIA COWORK (da COWORK.md): git READ-ONLY; niente scritture nel repo (i file li committa Code su
branch); verifica prima di ogni distruttivo (stash/.env); secrets/.env/Stripe/Google = Nick; security
report-only; MAI push; esplora→pianifica→proponi PRIMA di agire; a ~85% di contesto fermati e prepara
handoff + prompt.

OBIETTIVO (dimmi tu quale): (a) popolare la libreria esercizi (export Lovable → import via connettore,
o seed curato) — sblocca il prodotto; (b) assistere estrazione .env + cleanup dei 3 stash GHD residui;
(c) cutover .env/backend (D6/D4) + scollegare Lovable; (d) verifica dati/connettore sulle nuove UI D13.
Proponimi il micro-piano e procedi.
```

---

_Hand-off aggiornato 2026-06-18 (campagna autonoma **D13 COMPLETA** su `origin/main` tip `2296074`: 7 hook WIP collegati + E2E verde + audit pulito `docs/D13_AUDIT_REPORT.md`; D12 Set A `6dcd2fc`, Set B tenuto; dual-agent `COWORK.md` `69e8a4a`; stash-loop chiuso `f6bd4b2`/`1de3b7f`). Aperti (§4): `.env`+stash, credenziali E2E, Set B, token --warning, **libreria esercizi VUOTA**. Aggiornare §2/§3/§4 man mano._
