# HANDOFF — nc-performance-hub (trasferimento sessione)

> **Aggiornato:** 2026-07-13 (Claude Code, fetta intake-redesign) — **stato vivo nell'Addendum §0 qui sotto**, che prevale su §2/§4 dove diverge; fotografia completa in `docs/stato-repo-2026-07-12.md`. Stato 2026-06-18: Migrazione Lovable→Supabase di proprietà avanzata: smoke AI 6/6, flusso invito→atleta verificato, fix cache roster, **`generate-program` cablata nella UI (D11)**, **D12 Set A pulizia dead-code ACWR fatto**, **dual-agent Code/Cowork formalizzato (`COWORK.md`, `69e8a4a`)**, **campagna autonoma D13 COMPLETA** (7 hook WIP collegati + E2E verde + audit pulito). Codice su `origin/main` (tip `2296074`).
> **Priorità aperta (aggiornata 2026-07-13):** la ex "libreria esercizi vuota" è **SUPERATA** — `exercises` = **954 righe** sull'Hub (v. Addendum §0). Vive ora: cutover D6 `.env` + merge dei 2 branch vivi (`claude/zonemap-v18` — **v18 già LIVE** sull'Hub — e `claude/invite-resend-hardening`) + eliminazione senza merge di `claude/zonemap-riconc` (superseded).
> Scopo: riprendere da una chat nuova (Cowork **o** Claude Code) senza perdere contesto. Prompt pronti in §8 (Claude Code) e §9 (Cowork).
> ✅ **Stash-loop GitHub Desktop CHIUSO (2026-06-17):** `HANDOFF.md` + piani D11/D12 (`f6bd4b2`) e i doc di riferimento D2/D3/D7/D8/D9/D10/PRODUCT_SPEC/ROADMAP/… (recuperati dagli stash GHD, `1de3b7f`) sono ora **trackati**. Restano 3 stash GHD da droppare dopo che Nick mette al sicuro `.env` — vedi §5.

---

## 0. Addendum 2026-07-14 (stato vivo — prevale su §2/§4 e sull'addendum 2026-07-13 dove diverge)

- **Fetta intake-form-fase2 (branch `claude/intake-form-fase2`, 2026-07-14, da mergiare)** — Fase 2 del questionario: form config-driven in `src/features/intake/**` (CORE + strato Autonoma con neurotipo 30-Q in 5 pagine), submit SOLO via edge fn `submit-intake`, esiti reali renderizzati (routedOut prioritario su ok), rotta `/onboarding` swappata e **wizard legacy RITIRATO** (via la `profiles.update` client-side + `analyzeOnboarding` + set 15-Q). 39 test vitest verdi (parità col validatore server importato nei test) + `tsc` + build prod verdi. Review avversariale di fine fetta (4 lenti + verificatori): 4 major confermati e CHIUSI in-branch (`12a0ecf` — draft art. 9 user-scoped e pulito al signOut, niente wipe su authError, pin integrale ordine neurotipo, mapping esiti testato). Decisioni/deviazioni: `docs/prompts/2026-07-14-intake-form-fase2.md` (Addendum). **NB pre-merge: Nick deve approvare i testi-consensi `hub-v1` in `src/features/intake/config/labels.ts` (oggi BOZZA dal contratto nc-questionnaire).**
- **Stato DB verificato 2026-07-14 (`list_migrations` via connettore):** le 3 migration intake `20260713150000..150002` E l'hardening `20260714101458_harden_profile_escalation_mode_tier` risultano **APPLICATE live**; `submit-intake` deployata. **types.ts RIGENERATO** sul branch (commit `c40ebc5`, diff solo-additivo) + `Profile` esteso (`coaching_mode`/`tier`/`objective`).
- **⚠ DEBITO GO-LIVE ora SBLOCCATO**: col ritiro del write client-side del wizard, Cowork (benestare Nick) può estendere l'hardening a `medical_clearance_required`/`red_flags`/`fms_exclusion_zones` — da fare DOPO il merge di questa fetta (il wizard legacy che le scriveva non esiste più sul branch).
- **E2E submit reale**: rimandato a un atleta di test indicato da Nick (invio one-shot per atleta).

### Addendum 2026-07-13 (storico — superato dove diverge)

- **Fetta intake-redesign (branch `claude/intake-redesign`, 2026-07-13, NON mergiata)** — backbone Fase 1 del questionario config-driven: 3 **migration-gemelle DA APPLICARE** (Cowork via connettore, benestare Nick) `20260713150000_intake_objective_cycle` · `20260713150001_intake_handle_new_user_mode_tier` · `20260713150002_intake_submit_rpc` (RPC privata service-role); edge fn **NUOVA `submit-intake`** (DA DEPLOYARE dopo l'apply) + **`invite-athlete` estesa** coaching_mode/tier (DA RIDEPLOYARE); dialog invito con selettori Modalità/Piano; **54 test Deno verdi** (`npx deno test --no-lock supabase/functions/submit-intake/intake/`). Decisioni e deviazioni approvate all'OK: `docs/prompts/2026-07-13-intake-redesign.md` (Addendum esecuzione). **Fase 2** (fetta successiva): rendering config-driven del form, 30-Q nella UI, selettore zone/infortuni, rewire `OnboardingWizard` su `submit-intake`, ritiro `nc-questionnaire` + flusso `invite_tokens`.
- **types.ts regen PENDENTE (esteso)**: rigenerare SOLO dopo l'apply delle 3 migration intake — un solo regen copre anche F0 (già applicata live, `20260712150000..150005`) — poi build gate.
- **⚠ DEBITO GO-LIVE (gate di Fase 2, PRIMA di clienti reali)**: estendere `prevent_profile_privilege_escalation` a `coaching_mode`/`tier`/`medical_clearance_required`/`red_flags` — oggi un atleta può riscriverli via UPDATE own-row ("Users can update their own profile" + trigger che protegge solo role/coach_id/subscription\_\*). L'hardening va sequenziato DOPO il rewire del wizard su `submit_intake`: il wizard legacy scrive quelle colonne client-side e si romperebbe.
- **Motore-metodo M1/M2 in `main`**: `generate-program` è deterministica (5 strati, zero AI) con **45 test Deno verdi** — `deno test --cached-only supabase/functions/generate-program/method/`.
- **Invito nativo FATTO e primario**: la UI invoca la edge fn `invite-athlete` (`src/components/coach/InviteAthleteDialog.tsx:159`).
- **Libreria esercizi POPOLATA**: `exercises` = **954 righe, tutte con `coach_id` valorizzato** (verifica Cowork via connettore, 2026-07-12). La condizione SENTINEL di §4 r.8 non è più lo stato normale.
- **Branch vivi non mergiati**: `claude/zonemap-v18` (**zoneMap v18**: split dorsale/toracica + clamp per-zona `ZONE_BASE` + conform-delta FASE B; **49/49 test Deno**; **DEPLOYATA 2026-07-13**: edge fn `generate-program` **version 18 ACTIVE, `verify_jwt=true`** via connettore, al "procedi" esplicito di Nick; resta il **merge** — prompt-file `docs/prompts/2026-07-12-zonemap-v18.md`; push del branch da GitHub Desktop, il classifier ha bloccato il push dalla corsia Code) · `claude/invite-resend-hardening` (+4 — hardening reinvio invito).
- **`claude/zonemap-riconc` SUPERSEDED (2026-07-13)**: bozza Delta 1 divergente dalla spec riconciliata (`mid back`→toracica, alias extra `lat`/`gran dorsale`, senza Delta D) — **eliminare senza merge** (locale + `origin/claude/zonemap-riconc`, decisione Nick): un merge post-v18 regredirebbe la spec.
- **Debito noto (registrato, NON risolto in questa fetta)**: 1 migration correttiva out-of-band applicata sul DB senza file nel repo — DB = **129 versioni**, repo = **128 file**.
- **Fotografia completa del repo**: `docs/stato-repo-2026-07-12.md` (ricognizione read-only, 2026-07-12).

## 1. In una riga

Migrazione di **nc-performance-hub** (coaching dual-interface: Coach "Aura" web + Atleta PWA) da **Lovable Cloud** a **Supabase di proprietà** (ref `xgxtplqlewpqjzghvbke`). AI→OpenAI **validata 6/6**, login Google **attivo**, invito→atleta **verificato**, fix roster + **`generate-program` cablata**. Restano: collegare i moduli WIP e il cutover finale del `.env` (la libreria esercizi è stata **popolata** — 954 righe, v. Addendum §0).

## 2. Stato attuale (fattuale)

- **Supabase di proprietà.** Ref **`xgxtplqlewpqjzghvbke`**, region `eu-central-1`, org `umydelvpdzieopddfhpf`. URL `https://xgxtplqlewpqjzghvbke.supabase.co` · publishable key `sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f`. 54 tabelle, **RLS attiva ovunque**, advisor security 0 ERROR.
- **6 funzioni AI su OpenAI, validate live:** ✅ `ask-copilot`, `analyze-meal-photo`, `chat-with-coach`, `generate-batch-checkins` (2026-06-14) · ✅ `generate-program` (gpt-5.2) e `analyze-athlete-week` (gpt-5.4-mini) (2026-06-15, atleta reale `wolfwood370` id `912d6214`). `OPENAI_API_KEY` con credito; secret OK (OpenAI/Resend/Stripe test).
- **Login Google attivo.** Coach = `nctrainingsystems@gmail.com` (id `af93b1cd`). **Atleti = su invito.** Meccanismo verificato: la **UI invito scrive `invite_tokens`**; al **signup Google** il trigger `handle_new_user` collega via path `invite_tokens` (email) → `profiles.coach_id` + `used=true`. NB profilo prende il nome dall'account Google. (Aggiornamento 2026-07-05: la edge fn `invite-athlete` è ora il **path primario, invocato dalla UI** — `InviteAthleteDialog.tsx:159`.)
- **Git: `origin/main` (tip `2296074`).** Mergiati: migrazione, audit, E2E nativa, rebranding, guard coach, **fix cache roster** (`2a57af1`), **generate-program UI** (`8735e0d`+`afb9e1e`), **D12 Set A** (`6dcd2fc`), **track/recupero doc** (`f6bd4b2`/`1de3b7f`), **dual-agent `COWORK.md`** (`69e8a4a`), e l'intera **campagna autonoma D13** (Epic A + C1–C5 + D E2E + B audit-report). Working tree pulito.
- **Campagna autonoma D13 COMPLETA (2026-06-18).** 7 hook WIP collegati alla UI coach: **Quota AI** (`AiQuotaBadge` in Master Copilot + AI Brain), **Gating** (`FeatureGate` su video/AI/`max_active_programs`), **Nutrizione** (`NutritionAdherenceCard` nella tab Strategia), **FMS/Salute** (tab Salute `HealthProfileTab` + `FmsContraindicationBadge` nel Program Builder), **Periodizzazione** (`PeriodizationTab` CRUD + `TrainingBlocksTimeline`). **Suite E2E** Playwright verde (**30 pass / 17 skip** senza credenziali). **Audit pulito** — nessun nuovo dead-code, report annotato in `docs/D13_AUDIT_REPORT.md`. Ogni Epic verificato (tsc + `audit:all` + review avversariale multi-agente). Spec/piano: `docs/D13_AUTONOMOUS_CAMPAIGN.md`.
- **Libreria esercizi POPOLATA (2026-07-12)**: `exercises` = **954 righe con `coach_id`** (verifica Cowork via connettore). Storico: era vuota fino a luglio (nessun seed nelle migration — i dati esistevano solo nel vecchio DB Lovable). FE puntato al backend nuovo via `.env.local` (**TEMP**, non è il cutover D6).
- **Qualità:** audit (solo `ai-error` rimosso, WIP tenuti in `docs/WIP_MODULES.md`) · E2E nativa 6/6 · rebranding "NC Performance Hub" · `ProtectedCoachRoute` su 15 route · fix roster `src/lib/coachQueries.ts` · `generate-program` cablata (`GenerateAiWeekDialog` + `useGenerateProgram` + `mapAiDaysToSessions` + store `replaceWeekWithAiProgram`) · **D12 Set A** dead-code ACWR rimosso (`6dcd2fc`, `tsc` verde + audit pulito).
- **Lovable resta intatto** → rollback a costo ~zero fino al cutover.

## 3. Decisioni

**Chiuse:** D1 schema-only · D2 AI→OpenAI (validata 6/6) · D3 OAuth Google · audit · E2E · rebranding · guard coach · smoke AI + invito (2026-06-15) · fix cache roster (2026-06-15) · **generate-program UI (D11, 2026-06-16)** · **D12 Set A cleanup ACWR (2026-06-17, `6dcd2fc`)** · **dual-agent Code/Cowork formalizzato (`COWORK.md`, 2026-06-18, `69e8a4a`)** · **campagna autonoma D13 COMPLETA (2026-06-18)** — 7 hook WIP collegati + suite E2E verde + audit pulito (`docs/D13_AUDIT_REPORT.md`) · **✅ D5 RISOLTA (2026-07-04, metodo v2):** security = ownership condivisa (5 attori) — Code = codice sicuro + `/security-review`; Cowork = advisors/RLS/DB via connettore col benestare di Nick. Vedi `CLAUDE.md` legge #11 / `COWORK.md §5` / `03-BACKEND-SUPABASE.md §0`.
**Aperte:** **D4** hosting FE (Cloudflare Pages vs Vercel) · **D6** timing cutover `.env` · **libreria esercizi** (come popolarla, §4 r.8) · **D12 Set B** (`readinessMath`/`constants`) **tenuto** — rimuovere solo su conferma esplicita di abbandono della feature readiness.

## 4. Prossimi passi

| #   | Passo                                                                                                                                                                                                                                                                                                               | Owner             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | ✅ **FATTO** Smoke AI 6/6 con atleta reale.                                                                                                                                                                                                                                                                         | 👤 + 🤝           |
| 2   | ✅ **FATTO** Flusso invito→atleta verificato.                                                                                                                                                                                                                                                                       | 👤 + 🤝           |
| 3   | ✅ **FATTO 2026-06-18 (campagna D13)** Collegati 7 hook WIP coach (Quota AI, Gating, Nutrizione, FMS/Salute, Periodizzazione) + suite E2E + audit report. Restano WIP solo moduli athlete-side/infra (offline/PWA, ciclo mestruale, media, foodApi) — `docs/WIP_MODULES.md`.                                        | Claude Code       |
| 4   | **Cutover finale** `.env`/backend (D6/D4) + scollegare Lovable. (Ora override locale `.env.local` → backend nuovo.)                                                                                                                                                                                                 | 👤                |
| 5   | Minori: hook husky, email/handle legacy, tidy RLS `{public}`→`{authenticated}`                                                                                                                                                                                                                                      | 👤 / CC / Lovable |
| 6   | ✅ **FATTO+VALIDATO 2026-06-15** (`2a57af1`) Fix cache lista atleti: `coachQueries.ts` `COACH_ROSTER_QUERY_OPTS` su 7 letture roster. `/coach/athletes` mostra l'atleta.                                                                                                                                            | Claude Code       |
| 7   | ✅ **FATTO 2026-06-16** (`8735e0d` feat + `afb9e1e` cleanup) `generate-program` cablata: `GenerateAiWeekDialog` (header ProgramBuilder) → hook → mapper → store. Fallback **SENTINEL** `UNLINKED_EXERCISE_ID` finché libreria vuota. Piano: `docs/D11_GENERATE_PROGRAM_PLAN.md`.                                    | Claude Code       |
| 8   | ✅ **SUPERATO 2026-07-12** — libreria popolata: `exercises` = **954 righe, tutte con `coach_id`** (verifica Cowork via connettore). Storico: era vuota (0 righe) e bloccava il program-building reale (SENTINEL).                                                                                                   | 👤                |
| 9   | ✅ **FATTO 2026-06-17** (`6dcd2fc`) **D12 Set A** — rimossi `useAcwrData`+`trainingMetrics` (duplicato ACWR morto), `tsc` verde + audit pulito. Set B (`readinessMath`/`constants`) **tenuto** (roadmap). Piano: `docs/D12_DEADCODE_ACWR_CLEANUP_PLAN.md`.                                                          | Claude Code       |
| 10  | **`.env` + stash GHD** — estrai/metti al sicuro il `.env` dallo stash `oauth-migration`, **poi droppa** i 3 stash residui (`coach-guard`, `e2e-native`, `oauth-migration`). I doc unici sono già recuperati e trackati (`1de3b7f`); negli stash restano solo `.env` (secret) + artefatti Playwright (rigenerabili). | 👤 + CC           |
| 11  | **Credenziali E2E** — impostare `E2E_COACH_EMAIL`/`E2E_COACH_PASSWORD` (coach `test@test.com`, D3 §6) per attivare i **17 test autenticati** skippati della suite Playwright (project `chromium-coach`).                                                                                                            | 👤                |
| 12  | **D12 Set B** (`readinessMath`/`constants`) — decisione: **tieni** (default, roadmap readiness) o rimuovi se la feature è abbandonata. Rimozione SOLO su conferma esplicita → STOP&ASK.                                                                                                                             | 👤                |
| 13  | **Token `--warning` marrone in light** — in `forced-light` (`App.tsx`) `--warning` è `#774616` (tertiary-container) → `text-warning` rende marrone non ambra. Riguarda `AcwrGauge` + card D13. Micro-task cosmetico cross-cutting (decisione design).                                                               | 👤 / CC           |

## 5. Tooling & workflow

- **Si alternano** Cowork (infra/connettore/test Chrome/doc) e **Claude Code** (codice/branch/commit). Stesso checkout.
- **Branch hygiene (CC):** non committare su `main`; usare `claude/<slug>`.
- **Push/merge:** li fa **Nick via GitHub Desktop** (MAI Cowork/CC).
- **✅ Stash-loop GHD risolto (2026-06-17):** prima, a ogni branch switch GHD stashava le modifiche non committate **inclusi i file untracked** → i doc "sparivano" (accumulati 6 stash `!!GitHub_Desktop<branch>`). **Fix applicato:** tutti i doc di riferimento sono ora **trackati** (`f6bd4b2` HANDOFF+D11/D12; `1de3b7f` recupero D2/D3/D7/D8/D9/D10/PRODUCT_SPEC/ROADMAP/CLAUDE_CODE_SETUP/DB_MIGRATION\*/SECRETS_SETUP dagli stash). **Restano 3 stash** (`coach-guard`, `e2e-native`, `oauth-migration`) con ancora `.env` (secret) + artefatti Playwright: **droppare SOLO dopo** che Nick ha messo al sicuro `.env` (vedi §4 r.10). Lezione: i doc vanno committati, mai lasciati untracked.
- **Cowork sandbox:** file montati con NUL padding → usa `Read`/`grep -a`; `git status` mostra tutto il tree modificato (CRLF, falso) e può lasciare `index.lock` → git read-only in Cowork; `knip`/`depcheck` in CC.
- Anteprima/dev = `npm run dev` (`localhost:8080`).

## 5-bis. Registro attori ↔ repo

- `main` = fonte di verità · **un attore alla volta sul working tree**. Cowork aggiorna questa tabella a inizio/fine sessione.

| Repo                                                                   | Attore attivo ora               | Corsia                              |
| ---------------------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| nc-performance-hub                                                     | — (compilare a inizio sessione) | build modulo / DB / handoff         |
| satelliti (questionnaire · calendar · movement · business · education) | read-only per Cowork            | cave da fondere nel Hub, non attivi |

## 6. Guardrail (vincolanti)

Risposte/commit **italiano** · **MAI push** (sincronizza Nick) · build gate `tsc --noEmit -p tsconfig.app.json` verde · commit atomici · secrets/credenziali/Stripe/Google = Nick · security = ownership condivisa (legge #11): Code = codice sicuro + `/security-review` ai milestone; il DB (RLS/advisor/migration) lo opera Cowork via connettore col benestare di Nick · niente operazioni distruttive senza conferma · confermare costo prima di creare risorse Supabase.

## 7. Documenti di riferimento

Tutti **trackati** (2026-06-18): `CLAUDE.md` · `COWORK.md` + `.claude/methodology/*` · `docs/D2_OPENAI_MIGRATION_CONTRACT.md` · `docs/D3_TEST_200_RUNBOOK.md` · `docs/D7_GOOGLE_OAUTH_SETUP.md` · `docs/D8_AUDIT_CODICE_MORTO.md` · `docs/D9_E2E_PLAYWRIGHT_NATIVE.md` · `docs/D10_COACH_ROUTE_GUARD.md` · `docs/D11_GENERATE_PROGRAM_PLAN.md` · `docs/D12_DEADCODE_ACWR_CLEANUP_PLAN.md` · `docs/WIP_MODULES.md` · `docs/CLAUDE_CODE_SETUP.md` · `docs/DB_MIGRATION.md` · `docs/DB_MIGRATION_PREFLIGHT.md` · `docs/DB_MIGRATION_FASE1_REPORT.md` · `docs/SECRETS_SETUP.md` · `docs/PRODUCT_SPEC.md` · `docs/ROADMAP.md` · `docs/UX_UI_DESIGN_SYSTEM.md` · `docs/D13_AUTONOMOUS_CAMPAIGN.md` · `docs/D13_AUDIT_REPORT.md`.

---

## 8. PROMPT DI TRASFERIMENTO — Claude Code (lavoro su CODICE)

```
Prosecuzione nc-performance-hub (Lovable → Supabase mio). Leggi PRIMA docs/HANDOFF.md
+ CLAUDE.md + docs/auto-miglioramento.md + .claude/methodology/00-CORE.md.

Stato: vedi Addendum §0 (stato vivo, prevale) + §2 per lo storico (campagna D13 completa —
dettagli in docs/D13_AUDIT_REPORT.md). Libreria esercizi POPOLATA (954 righe); branch vivi
non mergiati: claude/zonemap-riconc (+1) e claude/invite-resend-hardening (+4).

GUARDRAIL: italiano; all'inizio VERIFICA il branch e crea claude/<slug> (NON su main); MAI push
(sincronizzo io); build gate tsc --noEmit -p tsconfig.app.json verde; commit atomici; secrets le
imposto io; security = ownership condivisa (legge #11): tu = codice sicuro + /security-review,
il DB lo tocca Cowork col benestare di Nick — tu proponi il FILE di migration. MONITORA il
contesto: a ~85% fermati, dichiaralo e prepara handoff + prompt di ripartenza.

OBIETTIVO (dimmi tu quale): collegare un modulo WIP da docs/WIP_MODULES.md, o un fix FE.
Esplora→pianifica e proponi il piano PRIMA di modificare.
```

## 9. PROMPT DI TRASFERIMENTO — Cowork (lavoro su CONNETTORE/INFRA)

```
Prosecuzione nc-performance-hub su Cowork. Leggi PRIMA COWORK.md (corsia Cowork) + docs/HANDOFF.md
+ docs/auto-miglioramento.md.

Stato: vedi Addendum §0 (stato vivo, prevale) + §2 per lo storico (dual-agent attivo; campagna D13
completa — dettagli in docs/D13_AUDIT_REPORT.md). Backend ref xgxtplqlewpqjzghvbke; LIBRERIA
ESERCIZI POPOLATA (954 righe con coach_id, verifica 2026-07-12); FE su .env.local (TEMP). Resume
del progetto Supabase (free-tier pausing) prima di ogni lavoro DB.

CORSIA COWORK (da COWORK.md): git READ-ONLY; niente scritture nel repo (i file li committa Code su
branch); il DB è il tuo binario: apply_migration (DDL) + il FILE supabase/migrations/* lo committa
Code + get_advisors dopo ogni DDL; execute_sql per DML/seed; backup prima dei distruttivi; deviazione
MCP-su-prod dichiarata, ok finché zero dati reali. Verifica prima di ogni distruttivo (stash/.env);
secrets/.env/Stripe/Google = Nick; security = advisors/RLS/review DB via connettore col benestare di
Nick; MAI push; esplora→pianifica→proponi PRIMA di agire; a ~85% di contesto fermati e prepara
handoff + prompt.

OBIETTIVO (dimmi tu quale): (a) QA della libreria esercizi popolata (954 righe: qualità dati /
campi metodo); (b) assistere estrazione .env + cleanup dei 3 stash GHD residui;
(c) cutover .env/backend (D6/D4) + scollegare Lovable; (d) verifica dati/connettore sulle nuove UI D13.
Proponimi il micro-piano e procedi.
```

---

_Hand-off aggiornato 2026-06-18 (campagna autonoma **D13 COMPLETA** su `origin/main` tip `2296074`: 7 hook WIP collegati + E2E verde + audit pulito `docs/D13_AUDIT_REPORT.md`; D12 Set A `6dcd2fc`, Set B tenuto; dual-agent `COWORK.md` `69e8a4a`; stash-loop chiuso `f6bd4b2`/`1de3b7f`). (2026-07-04) **metodo v2**: file-guida allineati a Supabase proprio + 5 attori; D5 risolta; auto-miglioramento + registro attori↔repo aggiunti. Aggiornare §2/§3/§4 man mano._

_(2026-07-12) **Fetta riordino** (fotografia: `docs/stato-repo-2026-07-12.md`): `.env` fuori dal tracking + `.env.example` coi soli nomi · lockfile unico npm · `engines` node ≥24 · CLAUDE.md a verità · banner STORICO su D2/D7/D9/D10/D11 + nota rail su D13 · cast `as any` su `program_blocks` rimosso · branch mergiati eliminati + worktree orfano rimosso. Stato vivo in **Addendum §0**: exercises = 954 righe · debito 1 migration out-of-band (129 DB vs 128 repo) · branch vivi zonemap-riconc / invite-resend-hardening. Aperti residui (§4): cutover D6 `.env`+stash, credenziali E2E, Set B, token --warning._
