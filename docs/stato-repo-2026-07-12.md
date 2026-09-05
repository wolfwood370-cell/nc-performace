# Stato del repo — nc-performance-hub — 2026-07-12

> Ricognizione READ-ONLY eseguita da Claude Code il 2026-07-12 su branch `claude/ricognizione-repo`
> (HEAD = `f55ef65`, identico a `main`). Nessuna modifica a codice/config/schema/dipendenze:
> l'unico file nuovo è questo report. Ogni claim è accompagnato dall'evidenza (file:riga o comando);
> dove non verificabile è scritto «non verificato» col perché.

---

## 0. Metodo

**Comandi e letture usati**

- Git: `git remote -v`, `git branch -a -vv`, `git rev-list --left-right --count main...<branch>` (per ogni branch), `git log --format=... -12 main`, `git diff --name-status main...<branch>`, `git status --porcelain`, `git ls-files`, `git check-ignore -v`, `git worktree list`, `git log -1 --date=short -- <file>` (data ultima modifica per ogni doc).
- Letture dirette (Read/Grep): `package.json`, `supabase/config.toml`, `.mcp.json`, `.claude/**`, `tsconfig*`, `playwright.config.ts`, `vite.config.ts`, `knip.config.ts`, hook e sorgenti puntuali; grep mirati su `\.from(`, `insert|update|upsert|delete`, `import.meta.env`, `Deno.env.get`, `program_*`, `method_config`, `Epley|Brzycki`, `mock`, `TODO|FIXME`.
- Due subagenti read-only (Read/Glob/Grep): inventario dei ~28 file di documentazione; inventario delle 15 edge functions (scopo/letture/scritture/servizi esterni/env).
- **Eseguiti** (senza modifiche né install): `npx tsc --noEmit -p tsconfig.app.json` (dal checkout principale, che ha `node_modules`) e `deno test --cached-only supabase/functions/generate-program/method/` (flag `--cached-only` = zero download). Esiti in §6.

**Limiti / non verificato**

- **Stato del DB remoto** (righe nelle tabelle, migrations effettivamente applicate, advisor): non verificato. Il DB è corsia Cowork (CLAUDE.md legge 11); non ho usato l'MCP Supabase. I claim sul DB citati in §8/§9 provengono dai docs interni e sono etichettati come tali.
- **Versione zoneMap deployata sull'Hub** ("v17 live"): non verificabile dal repo — vedi §8.4.
- **Suite E2E Playwright**: non eseguita — richiede l'avvio del dev server (`webServer` in `playwright.config.ts:28`) e i browser Playwright; potenziale download/stato non read-only.
- **`npm audit`**: non eseguito (interroga il registry in rete; scelto di non farlo in una ricognizione offline-safe). Vulnerabilità note delle dipendenze: non verificate.
- Il typecheck è stato eseguito nel checkout principale (branch `main`, stesso identico contenuto di questo branch) perché il worktree fresco non ha `node_modules` e installarli è vietato dagli invarianti.

---

## 1. Identità e stato del repo

**Remote** (`git remote -v`):

```
origin  https://github.com/wolfwood370-cell/nc-performace.git (fetch/push)
```

Nota: il nome del repo remoto è `nc-performace` (typo "performace", senza -n), la cartella locale `nc-performace-hub`. Solo cosmetico, ma va saputo per i link.

**Branch corrente**: `main` = `f55ef65`, allineato a `origin/main`. Working tree **pulito** (`git status --porcelain` → vuoto): nessun file modificato o untracked tracciabile. Nel checkout esistono però file locali _ignorati_: `.env.local` (ignorato da `.gitignore:13` `*.local`), `research.local/` (idem), `.claude/settings.local.json` (non tracciato).

**Branch locali** (23) con HEAD e distanza da `main` (`git rev-list --left-right --count`, formato behind/ahead):

| Branch                                | HEAD      | Behind | Ahead | Stato                                                            |
| ------------------------------------- | --------- | ------ | ----- | ---------------------------------------------------------------- |
| `claude/invite-resend-hardening`      | `82fc631` | 39     | **4** | **UNICO con lavoro FE+edge non mergiato**                        |
| `claude/zonemap-riconc`               | `d777fd1` | 0      | **1** | **Delta zoneMap non mergiato**                                   |
| `claude/ricognizione-repo`            | `f55ef65` | 0      | 0     | questo branch (pre-esistente, era a main)                        |
| `claude/audit-report`                 | `2296074` | 54     | 0     | mergiato, stantio                                                |
| `claude/busy-mclean-15be50`           | `48cf12a` | 44     | 0     | mergiato, stantio                                                |
| `claude/cleanup-acwr-deadcode`        | `6dcd2fc` | 94     | 0     | mergiato, stantio                                                |
| `claude/cleanup-exercisecard`         | `afb9e1e` | 95     | 0     | mergiato, stantio                                                |
| `claude/coach-guard`                  | `c2c44fe` | 100    | 0     | mergiato, stantio                                                |
| `claude/coach-roster-cache`           | `2a57af1` | 99     | 0     | mergiato, stantio                                                |
| `claude/cowork-instructions`          | `69e8a4a` | 89     | 0     | mergiato, stantio                                                |
| `claude/e2e-native`                   | `5f1af77` | 104    | 0     | mergiato, stantio                                                |
| `claude/fix-recharts-hsl-double-wrap` | `54cdf67` | 67     | 0     | mergiato, stantio                                                |
| `claude/genprogram-ui`                | `8735e0d` | 96     | 0     | mergiato, stantio                                                |
| `claude/handoff-d13-final`            | `2377ab2` | 53     | 0     | mergiato, stantio                                                |
| `claude/invito-nativo-auto-email`     | `4295b51` | 39     | 0     | mergiato, stantio                                                |
| `claude/keen-wilson-57b38b`           | `48cf12a` | 44     | 0     | mergiato, stantio                                                |
| `claude/metodo-v2`                    | `2b53832` | 45     | 0     | mergiato, stantio                                                |
| `claude/motore-metodo-m1`             | `4410d10` | 16     | 0     | mergiato, stantio                                                |
| `claude/motore-metodo-m2`             | `8a963fe` | 10     | 0     | mergiato, stantio                                                |
| `claude/oauth-migration`              | `8343836` | 107    | 0     | mergiato (locale ahead 4 sul _suo_ origin, ma tutto già in main) |
| `claude/setup-claude-code`            | `bcb8329` | 115    | 0     | mergiato, stantio                                                |
| `claude/track-handoff-docs`           | `f6bd4b2` | 93     | 0     | mergiato, stantio                                                |

**Branch remoti**: `origin/main` + 10 `origin/claude/*` speculari ai locali. Unico remote-only: `origin/claude/confident-lamarr-593702` (`5159a8c`), già in main via merge PR #8 (`8820912`).

**Diff dei 2 branch con lavoro non mergiato** (`git diff --name-status main...<branch>`):

- `claude/invite-resend-hardening` (+4 commit: `e9f8b92`, `eda40cb`, `3cf0ce7`, `82fc631`): tocca `supabase/functions/invite-athlete/index.ts`, `src/components/coach/InviteAthleteDialog.tsx`, `docs/auto-miglioramento.md`. È l'hardening del reinvio invito (propagazione errori nel ramo attach, lookup senza `listUsers`, feedback nel dialog).
- `claude/zonemap-riconc` (+1 commit `d777fd1`): tocca solo `supabase/functions/generate-program/method/zoneMap.ts` (+41/−7) e `zoneMap.test.ts` (+38) — split dorsale/toracica + clamp tier per-zona (`ZONE_BASE`), "Delta 1 riconciliazione".

**Worktree pre-esistente**: `.claude/worktrees/practical-jennings-02b402` a `088e499` (detached HEAD) — residuo di una sessione precedente (`git worktree list`).

**Ultimi 10 commit di `main`** (autore effettivo sempre `wolfwood370-cell`; i commit fatti da Claude portano `Co-Authored-By: Claude` nel body — presente in 4 degli ultimi 5):

```
f55ef65 2026-07-06 docs: correggi commento verify_jwt stale nel gate di generate-program
e4df06b 2026-07-06 chore(db): allinea nome migration position_load_spalla alla versione applicata sull'Hub
815432b 2026-07-06 feat(motore-metodo): gate zona-infortunio (zoneMap) — ponte zona->muscoli/pattern/posizione
8820912 2026-07-05 Merge pull request #8 (claude/confident-lamarr-593702)
5159a8c 2026-07-05 merge origin/main (motore-metodo M2) nel branch di sessione
59b495e 2026-07-05 Merge pull request #7 (claude/motore-metodo-m2)
b2ea000 2026-07-05 docs: voce RETRO mirror colonne metodo + regen types.ts in auto-miglioramento
22bdf4e 2026-07-05 chore(db): rigenera types.ts dal DB di proprietà (colonne metodo + fix regressione Lovable 2f4c687)
23281e8 2026-07-05 chore(db): mirror migration colonne metodo su exercises (applicata da Cowork 20260704210219)
38341c5 2026-07-05 chore(db): script npm gen:types (DB_MIGRATION §8.3)
```

Convenzione reale: `tipo(scope): descrizione` in italiano, tipi `feat|fix|chore|docs|refactor`, merge via PR GitHub.

---

## 2. Documentazione per agenti e umani

### CLAUDE.md

- **Root**: esiste (`CLAUDE.md`, ultima modifica 2026-07-04). Entry-point dual-agent (Code vs Cowork), stack canonico, dual interface Coach/Athlete, 10 (in realtà 11) leggi, decision flow verso `.claude/methodology/*`, workflow standard.
- **Livello utente/globale**: esiste ed è visibile in sessione (`C:\Users\wolfw\.claude\CLAUDE.md`) — regole di lingua (italiano), divieti (push --force, scritture su .env), verifica build/test obbligatoria, commit descrittivi.
- **Nessun altro CLAUDE.md** in sottocartelle del repo.

**Allineamento del CLAUDE.md root al codice di oggi** — nel complesso buono, ma con 4 scostamenti fattuali:

| CLAUDE.md dice                                                       | Il repo dice                                                      | Evidenza                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| «React Router v6» (§1)                                               | react-router-dom **^7.12.0**                                      | `package.json:70`                                                                     |
| «TypeScript strict» (§1)                                             | `"strict": false`, `noImplicitAny: false`                         | `tsconfig.app.json`, `tsconfig.json` (`strictNullChecks: false`)                      |
| «PWA: Service Worker · IndexedDB · Wake Lock» (§1)                   | «PWA / Service Worker support has been REMOVED from this project» | `vite.config.ts:5`; conferma in `docs/WIP_MODULES.md` (moduli offline/PWA scollegati) |
| «Context7 non adottato… Niente CONTEXT7_API_KEY da configurare» (§9) | `.mcp.json` **configura** context7 con header `CONTEXT7_API_KEY`  | `.mcp.json:15-21`                                                                     |

Minore: legge 7 prescrive `supabase gen types typescript --linked`, lo script reale usa `--project-id xgxtplqlewpqjzghvbke` (`package.json:19`) — stesso effetto, comando diverso.

### README.md e docs/ — una riga per file (data = ultimo commit sul file; giudizio secco)

| File                                | Data       | Contenuto                                                   | Giudizio                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                         | 2026-05-03 | Overview stack/feature/setup/deploy                         | **Fuorviante**: tratta Lovable Cloud come backend attivo (r.60, r.87) e deploy via «Lovable → Share → Publish» (r.114)                                                                                                                                |
| `COWORK.md`                         | 2026-07-04 | Corsia Cowork: lane, DB via connettore, handoff             | Aggiornato (ref Hub corretto r.110; `.env.local` dichiarato temporaneo r.109)                                                                                                                                                                         |
| `AUDIT_PIATTAFORMA_COACH.md`        | 2026-05-19 | Audit type-safety/RLS/dead-code + 18 PR                     | Stantio (snapshot 18-19/05, pre-migrazione DB)                                                                                                                                                                                                        |
| `QA_MANUAL_TEST.md`                 | 2026-02-20 | Checklist QA manuale RC6                                    | Stantio (predata l'intera migrazione)                                                                                                                                                                                                                 |
| `RELEASE_NOTES.md`                  | 2026-02-20 | Note rc.1→rc.6                                              | **Fuorviante**: descrive PWA/Service Worker/offline come attivi (r.30, 94-99) — rimossi                                                                                                                                                               |
| `docs/HANDOFF.md`                   | 2026-07-04 | Stato repo + prompt di trasferimento                        | **Stantio come doc di stato**: fermo al 2026-06-18 (addendum 04/07); non riflette il 05/07 (invito nativo → la riga §2 «edge fn invite-athlete non usata dalla UI» è ora falsa: `InviteAthleteDialog.tsx:159` la invoca; motore-metodo M1/M2 assenti) |
| `docs/DB_MIGRATION.md`              | 2026-07-04 | Piano migrazione Lovable→Supabase proprio                   | Parzialmente stantio: framing «il backend è oggi su Lovable Cloud» (§1-2) superato; usa il vecchio ref sorgente come contesto (legittimo)                                                                                                             |
| `docs/DB_MIGRATION_PREFLIGHT.md`    | 2026-06-17 | Validazione statica 125 migrations (GO)                     | Aggiornato (storico compiuto)                                                                                                                                                                                                                         |
| `docs/DB_MIGRATION_FASE1_REPORT.md` | 2026-07-04 | Esito Fase 1: schema su Hub UE, 54 tabelle, advisor 0 ERROR | Aggiornato (la nota R2 su config.toml col vecchio ref è superata: oggi è corretto)                                                                                                                                                                    |
| `docs/PRODUCT_SPEC.md`              | 2026-06-17 | Spec estratta dal codice (modello dati, reale-vs-mock)      | Parzialmente stantio: «Backend … (oggi Lovable Cloud)» r.22/49; nota su `appointments` assente da types.ts obsoleta (presente: `src/integrations/supabase/types.ts`)                                                                                  |
| `docs/ROADMAP.md`                   | 2026-06-17 | Roadmap a 9 fasi                                            | Colonna «Oggi» stantia (backend/security «di Lovable» r.25/31); fasi forward valide                                                                                                                                                                   |
| `docs/WIP_MODULES.md`               | 2026-06-18 | Moduli scollegati (in knip ignore)                          | Aggiornato (coerente coi grep di §7)                                                                                                                                                                                                                  |
| `docs/auto-miglioramento.md`        | 2026-07-05 | Diario di processo + RETRO append-only                      | Aggiornato — è il doc di stato **più recente** del repo                                                                                                                                                                                               |
| `docs/D3_TEST_200_RUNBOOK.md`       | 2026-06-17 | Runbook test-200 fn AI                                      | Aggiornato (WARN «deferiti D5» superati)                                                                                                                                                                                                              |
| `docs/SECRETS_SETUP.md`             | 2026-06-17 | Setup secret edge                                           | Aggiornato                                                                                                                                                                                                                                            |
| `docs/DESIGN.md`                    | 2026-07-04 | Corsia Claude Design                                        | Aggiornato (il residuo «Send to Lovable per emergenze» è coerente col ruolo attuale di Lovable = editor visuale)                                                                                                                                      |
| `docs/UX_UI_DESIGN_SYSTEM.md`       | 2026-05-01 | Design system app atleta v1 (hex hard-coded)                | Stantio/aspirazionale (FE atleta in gran parte mock)                                                                                                                                                                                                  |
| `docs/prompts/_template-task.md`    | 2026-07-04 | Template prompt-file task                                   | Aggiornato                                                                                                                                                                                                                                            |
| `.lovable/plan.md`                  | —          | Piano D6 cutover (fotografia, «nessuna modifica eseguita»)  | Residuo della corsia Lovable; utile come storico D6                                                                                                                                                                                                   |

---

> Nota 2026-08-16 (fetta `potatura-docs`): i piani storici della serie D (D2, D7–D13 — 9 file) sono stati potati dal repo e le loro righe rimosse dalla tabella qui sopra; la storia resta nei commit.

## 3. Strumenti Claude attivabili

### `.mcp.json` (root)

| Server       | Trasporto                                   | Cosa espone               | Permessi/note                                                                                          |
| ------------ | ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `supabase`   | stdio (`npx @supabase/mcp-server-supabase`) | Tool DB/progetto Supabase | **`--read-only`**, `--project-ref=xgxtplqlewpqjzghvbke` (Hub UE); richiede env `SUPABASE_ACCESS_TOKEN` |
| `context7`   | http (`mcp.context7.com`)                   | Docs librerie aggiornate  | Header `CONTEXT7_API_KEY` (in contrasto con CLAUDE.md §9, vedi §2)                                     |
| `playwright` | stdio (`npx @playwright/mcp`)               | Automazione browser       | —                                                                                                      |
| `github`     | http (`api.githubcopilot.com/mcp`)          | Operazioni GitHub         | `Authorization: Bearer ${GITHUB_MCP_TOKEN}`                                                            |

### Cartella `.claude/` (tracciato in git: tutto tranne `settings.local.json`)

| Voce                                        | A cosa serve                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.json`                             | Registra gli hook: `PreToolUse` su `Bash\|Write\|Edit\|MultiEdit` e `PostToolUse` su `Write\|Edit\|MultiEdit` → `node .claude/hooks/hooks.mjs`                                                                                                                                                                   |
| `hooks/hooks.mjs`                           | Enforcement leggi: **blocca** `git push` (merge/push = Nicolò), `push --force`, `rm -rf` su percorsi pericolosi, scritture su `.env*`/`.mcp.json`; **build gate** `tsc --noEmit -p tsconfig.app.json` prima di ogni `git commit` (hooks.mjs:54-63); post-edit `prettier --write` su ts/tsx/css (hooks.mjs:87-95) |
| `agents/aura-theme-auditor.md`              | Subagente read-only: conformità token tema Coach (Aura) vs Athlete (`.theme-athlete`), niente hex raw                                                                                                                                                                                                            |
| `agents/supabase-rls-auditor.md`            | Subagente read-only: audit RLS/edge/SECURITY DEFINER secondo methodology/03                                                                                                                                                                                                                                      |
| `methodology/00-CORE…05-DEAD-CODE-AUDIT.md` | I 6 file di metodologia richiamati dal decision flow di CLAUDE.md §4                                                                                                                                                                                                                                             |
| `settings.local.json` (non tracciato)       | Permessi locali: `allow: Bash(git checkout *)`                                                                                                                                                                                                                                                                   |

**Niente altro a livello repo**: nessuna cartella `.claude/commands/`, `.claude/skills/`, nessun plugin.

### Server MCP e strumenti DISPONIBILI nella sessione corrente (ciò che è davvero attivo lavorando qui)

- **supabase** — MCP Supabase attivo in sessione con toolset **completo, non read-only** (`apply_migration`, `execute_sql`, `deploy_edge_function`, `get_advisors`, `list_tables`, …). ⚠ Diverso dal server read-only dichiarato in `.mcp.json`: proviene dalla configurazione Cowork/desktop. Non usato in questa ricognizione (legge 11).
- **context7** — docs librerie on-demand (`resolve-library-id`, `query-docs`). Presente in doppia istanza (config repo + connettore).
- **playwright** — automazione browser (navigate, click, snapshot, screenshot…).
- **Claude Browser** (browser integrato dell'app) e **Claude in Chrome** (Chrome reale dell'utente) — navigazione/ispezione pagine.
- **Connettore Gmail** — ricerca thread, lettura messaggi, bozze, etichette.
- **Connettore file cloud (stile Drive)** — ricerca/lettura/creazione file, permessi.
- **Connettore Vercel** — progetti, deploy, log runtime/build, agent run. (Il repo però non ha `vercel.json`.)
- **Connettore Canva** — design, export, brand template.
- **Connettore articoli scientifici** — ricerca/lettura full-text di paper (utile per la parte "metodo").
- **Connettore job-search** — ricerca offerte/resume (non pertinente al repo).
- **Utilità piattaforma**: `visualize` (widget/diagrammi inline), `mcp-registry` (scoperta connettori), `scheduled-tasks` (task ricorrenti), strumenti sessione Claude Code Desktop (capitoli, spawn task, gestione sessioni).
- **Nota**: il server `github` configurato in `.mcp.json` **non risulta attivo** in questa sessione (nessun tool `mcp__github__*` esposto); le operazioni GitHub passerebbero da `gh` CLI.
- Skills invocabili in sessione (non file del repo): code-review/ultrareview, security-review, deep-research, docx/pdf/pptx/xlsx, verify, simplify, loop, schedule, ecc.

---

## 4. Stack e struttura

### package.json

- **Script**: `dev`, `build`, `build:dev`, `preview`, `lint` (eslint), `format`/`format:check` (prettier), `prepare` (husky), `audit:dead` (knip) / `audit:deps` (depcheck) / `audit:exports` (ts-prune) / `audit:all`, `gen:types` (supabase gen types, project-id Hub UE). **Non esiste uno script `test`**.
- **Dipendenze chiave** (versioni da `package.json`): vite `^5.4.19` · react/react-dom `^18.3.1` · typescript `^5.8.3` · @supabase/supabase-js `^2.90.1` · @tanstack/react-query `^5.83.0` (+ persist-client `^5.90.22`) · react-router-dom `^7.12.0` · zustand `^5.0.10` + immer `^11.1.3` · tailwindcss `^3.4.17` (+ shadcn/Radix) · framer-motion `^12.26.2` · zod `^3.25.76` · recharts `^2.15.4` · @playwright/test `^1.57.0` · eslint `^9.32.0` · husky `^9.1.7` + lint-staged `^17.0.5`.
- **Lockfile: TRE tracciati** — `package-lock.json`, `bun.lock`, `bun.lockb` (`git ls-files`). Ambiguità sul package manager canonico.
- **Versione Node attesa: non dichiarata** (nessun campo `engines`, nessun `.nvmrc`/`.node-version`).
- Minori: `prettier` e `@types/suncalc` stanno in `dependencies` anziché `devDependencies` (`package.json:64,52`).

### Struttura `src/` (2 livelli)

```
src/
├── components/   athlete · auth · celebration · coach · common · layout · logic
│                 mobile · notifications · onboarding · pwa · ui (shadcn)
├── hooks/        (~40 hook piatti) + athlete/
├── integrations/ supabase/ (client.ts + types.ts generato, 3.202 righe)
├── lib/          logger, offlineStorage, … + math/ + program/
├── pages/        athlete/ · coach/ · legal/ · onboarding/ (+ Auth, ecc.)
├── providers/  · services/ · stores/ (Zustand; programBuilder/) · types/ · utils/
```

### `supabase/functions/` — 15 edge functions (2 righe ciascuna)

| Funzione                                              | Cosa fa · DB · esterni                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze-athlete-week` (385r)                         | Report settimanale AI dell'atleta. Legge profiles, workout_logs(+exercises), daily_cycle_logs, daily_readiness; **scrive athlete_ai_insights** (index.ts:354). Chiama OpenAI chat (gpt-5.4-mini).                                                                 |
| `analyze-meal-photo` (277r)                           | Macro da foto pasto via vision. Nessuna lettura/scrittura tabelle (solo auth). Chiama OpenAI (SDK, image_url).                                                                                                                                                    |
| `ask-copilot` (516r)                                  | RAG "Master Copilot" + modalità strutturate. Legge chunk via RPC `match_knowledge_chunks`; **nessuna scrittura**. OpenAI embeddings + chat.                                                                                                                       |
| `chat-with-coach` (283r il 12/07, 295r al 2026-09-05) | Chat AI streaming con quota giornaliera. Legge profiles, ai_usage_tracking, RPC `match_knowledge_chunks` (una libreria, dal 2026-09-05); **scrive ai_usage_tracking** (:139/:152/:263 il 12/07; :150/:163/:276 al 2026-09-05). OpenAI embeddings + chat (stream). |
| `check-achievements` (270r)                           | Badge + leaderboard. Legge user_badges, workout_logs, badges, profiles; **scrive user_badges (:184), notifications (:201), leaderboard_cache (upsert :244)**. Nessun esterno.                                                                                     |
| `create-checkout-session` (230r)                      | Stripe Checkout per billing plan. Legge billing_plans, profiles, athlete_subscriptions; **scrive billing_plans (:147), athlete_subscriptions (:210)**. Stripe SDK.                                                                                                |
| `create-portal-session` (124r)                        | Stripe Billing Portal. Legge athlete_subscriptions; nessuna scrittura. Stripe SDK.                                                                                                                                                                                |
| `delete-athlete` (102r)                               | Elimina atleta (verifica coach/self). **Delete su profiles (:79) + auth.admin.deleteUser (:86)**. Nessun esterno.                                                                                                                                                 |
| `forgot-password` (182r)                              | Recovery email via Resend (bypass mailer Supabase), whitelist redirectTo. Nessuna tabella. Resend API. **verify_jwt=false** (pubblica by design).                                                                                                                 |
| `generate-batch-checkins` (306r)                      | Check-in settimanali AI in batch. Legge profiles, workout_logs, nutrition_logs; **upsert weekly_checkins (:264)**. OpenAI (gpt-5.4-nano).                                                                                                                         |
| `generate-program` (277r)                             | Motore **deterministico** del metodo (5 strati, nessuna AI) + gate medico/zone. Legge profiles, injuries, exercises, RPC `is_coach_of_athlete`; **nessuna scrittura** (vedi §8.3). Nessun esterno.                                                                |
| `ingest-knowledge` (326r)                             | Chunking + embeddings per RAG. Legge knowledge_documents; **scrive knowledge_chunks (:248) e status su knowledge_documents (:217/:283/:307)**. OpenAI embeddings.                                                                                                 |
| `invite-athlete` (285r)                               | Invito atleta via email con ramo idempotente. Legge profiles; **scrive profiles (insert :191 / update :203)** + auth.admin. Resend API.                                                                                                                           |
| `send-email` (199r)                                   | Email di invito (solo type "invite") con whitelist Origin. Legge profiles; nessuna scrittura. Resend SDK.                                                                                                                                                         |
| `stripe-webhook` (302r)                               | Webhook Stripe con idempotenza; sincronizza abbonamenti e tier. **Scrive athlete_subscriptions (:123/:133/:173/:200/:242/:271), profiles (:39/:277)**. Stripe SDK. **verify_jwt=false** (firma Stripe).                                                           |

Moduli condivisi: solo `generate-program/method/` (assembleWeek 588r, rpeTable 127r, neurotypeSeed 106r, zoneMap 284r, exerciseSelection, types) + 5 file di test affiancati. **Non esiste una cartella `_shared` globale.**

### `supabase/migrations/`

- **128 file**. Prima: `20260109192244_b6998a04-….sql` (2026-01-09) — ultima: `20260706121438_position_load_spalla.sql` (2026-07-06).
- Convenzione: **113 UUID-style** (generate dall'era Lovable: `<timestamp>_<uuid>.sql`) + **15 nominate** (da maggio in poi: `<timestamp>_<slug>.sql`, es. `20260525120100_security_advisor_definer_hardening.sql`).
- Nessun timestamp duplicato (verificato con `cut -c1-14 | sort | uniq -d` → vuoto).
- Anomalia di allineamento (da docs, **non verificata sul DB**): `docs/DB_MIGRATION_FASE1_REPORT.md` §2 dichiara la history del DB riconciliata a **126 versioni** (125 originali + 1 correttiva out-of-band). La correttiva non ha file nel repo; i file sono ora 128 = 125 + 3 nuove (enrich_exercises, profiles_tax_code, position_load_spalla). Il repo quindi NON contiene 1 versione applicata sul DB.

### `supabase/config.toml`

- `project_id = "xgxtplqlewpqjzghvbke"` (`config.toml:1`) → **corrisponde all'Hub UE atteso** ✓.
- Policy `verify_jwt` esplicitata per tutte le 15 funzioni: 13 `true`, 2 `false` (`stripe-webhook`, `forgot-password`) con motivazione a commento (`config.toml:10-12`).

### Deploy / CI

- **Nessun `vercel.json`**, **nessuna cartella `.github/workflows`** → **CI assente**: gli unici quality gate sono locali (husky pre-commit: lint-staged + `tsc --noEmit`, `.husky/pre-commit`; hook Claude in `.claude/hooks/hooks.mjs`).
- Il deploy FE documentato nel README («Lovable → Publish») è stantio; il deploy edge è da CLI/connettore (CLAUDE.md §1).

---

## 5. Integrazioni esterne e segreti ATTESI

### Servizi esterni chiamati dal codice

| Servizio     | Dove                                                                                                                         | Per cosa                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase** | FE: `src/integrations/supabase/client.ts` (unico client); 15 edge functions                                                  | Auth, Postgres, Realtime (canali in `useChatRooms`, `useCoachAlerts`, `useNotifications`, `useRealtimeAnalytics`, `CoachAthletes`), Storage (`AddResourceDialog`, `ChatPane`, `MessageBubble`) |
| **OpenAI**   | 6 edge fn: analyze-athlete-week, analyze-meal-photo, ask-copilot, chat-with-coach, generate-batch-checkins, ingest-knowledge | chat completions (gpt-5.4-mini/nano) + embeddings (text-embedding-3-small)                                                                                                                     |
| **Stripe**   | create-checkout-session, create-portal-session, stripe-webhook                                                               | Checkout, Billing Portal, webhook sync abbonamenti                                                                                                                                             |
| **Resend**   | forgot-password, invite-athlete, send-email                                                                                  | Email transazionali (recovery, inviti)                                                                                                                                                         |

### Nomi delle variabili d'ambiente/segreti attesi (SOLO NOMI)

- **Frontend** (`import.meta.env.*`, grep su src): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`src/integrations/supabase/client.ts:5-6`) + `DEV` (built-in Vite, `src/lib/logger.ts`).
- **File `.env` presenti**: `.env` (⚠ **tracciato in git**, vedi §9) con i nomi `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`; `.env.local` (non tracciato, solo nel checkout locale) con gli stessi 3 nomi.
- **Edge functions** (`Deno.env.get`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`.
- **`.mcp.json`** (placeholder): `SUPABASE_ACCESS_TOKEN`, `CONTEXT7_API_KEY`, `GITHUB_MCP_TOKEN`.

### Webhook

- **In ingresso**: `stripe-webhook` (pubblico al gateway, autenticato via `Stripe-Signature`); `forgot-password` (pubblico by design). Tutte le altre 13 funzioni richiedono JWT al gateway.
- **In uscita**: nessun webhook emesso; solo chiamate API sincrone (OpenAI/Stripe/Resend).
- **FE → edge**: il client invoca 9 funzioni via `functions.invoke`: invite-athlete, analyze-athlete-week, ingest-knowledge, create-checkout-session, generate-program, generate-batch-checkins, forgot-password, delete-athlete (+ ask-copilot/chat-with-coach via streaming fetch — non verificato il meccanismo esatto di invocazione per queste due).

---

## 6. Pratiche in atto

### Test

- **Unit (Deno)**: 5 file in `supabase/functions/generate-program/method/*.test.ts` (assembleWeek, exerciseSelection, neurotypeSeed, rpeTable, zoneMap). **ESEGUITI** con `deno test --cached-only` (deno 2.9.1, zero download): **45 passed, 0 failed** (492ms).
- **E2E (Playwright)**: 5 spec in `e2e/` (auth-page, coach-smoke, core-auth, guards-redirect, role-guard). **NON eseguiti**: richiedono l'avvio del dev server (`playwright.config.ts:28`, baseURL `http://localhost:8080`) e i browser Playwright — fuori dal perimetro read-only. Ultimo esito documentato: 30 pass / 17 skip senza credenziali (`docs/HANDOFF.md` §2, non verificato ora).
- **Vitest/Jest: assenti**. Nessuno script `test` in package.json.
- **Typecheck ESEGUITO**: `npx tsc --noEmit -p tsconfig.app.json` → **VERDE** (exit 0, eseguito dal checkout principale che ha `node_modules`; il worktree fresco non li ha e installarli è vietato).

### Lint / format / strictness

- ESLint 9 flat config (`eslint.config.js`) con jsx-a11y, react-hooks, react-refresh; Prettier via `format`/`format:check` + lint-staged su `*.{ts,tsx,css,md,json}`; husky pre-commit = lint-staged + tsc (`.husky/pre-commit`).
- **tsconfig NON strict**: `strict: false`, `noImplicitAny: false`, `noUnusedLocals/Parameters: false` (`tsconfig.app.json`), `strictNullChecks: false` (`tsconfig.json`) — in contrasto con CLAUDE.md §1 «TypeScript strict».
- Tooling audit dead-code: knip (`knip.config.ts`), depcheck, ts-prune (script `audit:*`).

### Convenzioni osservate

- Commit: `tipo(scope): descrizione` in italiano; `Co-Authored-By: Claude` presente in 4 degli ultimi 5 commit; merge in main via PR GitHub (PR #7, #8 nel log).
- Documentazione: `docs/auto-miglioramento.md` è aggiornato **a ogni sessione** (RETRO fino al 2026-07-05); `docs/HANDOFF.md` **non** viene aggiornato a ogni fetta (fermo al 18/06 + addendum 04/07, con almeno una riga ormai falsa — vedi §2).

---

## 7. Vivo / mock / morto

### Chi scrive DAVVERO sul DB (write-path reali)

Pattern costante-tabella cercato (`= "nome_tabella"`): l'unico è `ASSESSMENTS_TABLE = "fms_assessments"` in `src/hooks/useSaveAssessment.ts:144` e `src/hooks/useAthleteRiskAnalysis.ts:69` (scrittura: upsert `useSaveAssessment.ts:301`).

**Frontend — anello atleta (cablato e vivo):**

| Tabella           | Write-path                                  | Evidenza                                                                                                           |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workout_logs`    | insert start sessione; update fine sessione | `useAthleteWorkoutHooks.ts:115` (usato da `ActiveWorkout.tsx:567`); `:207` (usato da `PostWorkoutDebrief.tsx:217`) |
| `exercise_logs`   | insert per serie                            | `useAthleteWorkoutHooks.ts:159` (usato da `StandardSetDrawer.tsx:83`)                                              |
| `daily_readiness` | upsert check-in giornaliero                 | `useAthleteReadinessHooks.ts:107` (usato da `DailyCheckin.tsx:252`)                                                |

**Frontend — piattaforma coach (vivo):** `program_blocks` (upsert `useSaveProgramBlock.ts:239`, unico writer — via cast `(supabase as any)` a `:127`); `exercises` (insert/update/archive `ExerciseLibrarySidebar.tsx:244/269/290`); `workouts` + `workout_logs` (scheduling/cancellazione `CoachCalendar.tsx:269/285/468/481`); `workout_logs.coach_feedback` (`useReviewWorkout.ts:25`); `fms_assessments` (`useSaveAssessment.ts:301`); `training_phases` (`usePeriodization.ts:126/179/206`); `weekly_checkins` + `messages` (`useWeeklyCheckins.ts:105/133/145`); `billing_plans` (`useBillingPlans.ts:62/87`); `coach_products` + `invoices` + `profiles` (`useCoachBusinessData.ts:174/204/239/264/289/299`); `messages` + `chat_participants.last_read_at` (`useChatRooms.ts:188/275`); `coach_alerts` (`useCoachAlerts.ts:112/125`, insert `OnboardingWizard.tsx:301`); `notifications` (`useNotifications.ts:80/94`); `content_library` (`useContentLibrary.ts:63/118`); `nutrition_plans` + `athlete_habits` (`StrategyContent.tsx:443-565`); `invite_tokens` (`InviteAthleteDialog.tsx:214`); `knowledge_documents` (`KnowledgeBase.tsx:216/247`); `body_measurements` + `profiles` + altri (`AthleteDetail.tsx:1217/2061`); `profiles` (`OnboardingWizard.tsx:221`, `CoachSettings.tsx:320`).

**Edge functions (service-role):** athlete_ai_insights, ai_usage_tracking, user_badges, notifications, leaderboard_cache, billing_plans, athlete_subscriptions, profiles, weekly_checkins, knowledge_documents/knowledge_chunks (dettaglio e righe in §4).

### Mock dichiarato

Le pagine atleta sono esplicitamente mock nei commenti di testa: `AthleteDashboard.tsx:27,101-103` («All data here is mock», costante `MOCK`), `AthleteTraining.tsx:34`, `AthleteReadinessDetails.tsx:49`, `WorkoutPhaseDetail.tsx:21`, `ExercisePreview.tsx:286`, `PostWorkoutDebrief.tsx:7,37` (hero mock), `ActiveWorkout.tsx:117` (progress bar da mock). (Correzione 2026-08-11: con la fetta rpe-non-preselezionato la durata dell'hero del debrief è **reale** — cronometro `elapsedTime` — e i commenti `:7`/`:37` sono stati riformulati; dell'hero restano mock titolo e muscoli. La fotografia qui sopra resta valida per il 2026-07-12.) **Ma non è tutto mock**: le 3 mutation reali dell'anello atleta di cui sopra sono cablate dentro queste stesse pagine.

### Codice senza referenze (morto/WIP scollegato)

- `useOfflineSync()` (`src/hooks/useOfflineSync.ts:317`) e `useCyclePhasing()` (`src/hooks/useCyclePhasing.ts:103`): **zero call-site** fuori dai file che li definiscono (grep). Scriverebbero daily_metrics/daily_readiness/workouts e athlete_cycle_settings/daily_cycle_logs — oggi quei write-path sono inerti.
- `docs/WIP_MODULES.md` elenca i moduli scollegati tenuti in `ignore` di knip: ciclo mestruale, math readiness, foodApi, offline/PWA, media, database.ts — coerente coi grep.
- `console.log` residui in src: **0** (grep, escluso `logger.ts`). TODO/FIXME totali: **3**, nessuno critico (2 wiring UI, 1 «pipe Sentry» in `logger.ts:33`).

---

## 8. Scostamenti dalle assunzioni delle spec (CORE v2.1 / F0)

**8.1 — «program_blocks è l'unico write-path della bozza-programmi; l'albero program_plans→…→exercises non ha writer» → REGGE.**
Unico writer di `program_blocks`: `useSaveProgramBlock.ts:239` (upsert). Sull'albero relazionale: in tutto `src/` le tabelle `program_plans/weeks/days/workouts/exercises` compaiono solo in select (`ProgramsDrawer.tsx:187-218`, `CoachCalendar.tsx:377/386`) e in `types.ts`; nessun insert/update/delete (grep). `generate-program` non scrive nulla (§8.3). Nota storica: `AUDIT_PIATTAFORMA_COACH.md:199` cita un soft-delete su `program_plans` in un "LoadBlockDialog", ma quel file **non esiste più** nel repo (glob → 0 risultati).

**8.2 — «UI atleta mock hard-coded; unica scrittura reale dell'anello atleta = workout_logs+exercise_logs» → REGGE SOLO IN PARTE.**
Mock confermato per dashboard/training/readiness-details/phase-detail (evidenze in §7). MA le scritture reali cablate sono **tre**, non due: oltre a `workout_logs` (`ActiveWorkout.tsx:567`, `PostWorkoutDebrief.tsx:217`) ed `exercise_logs` (`StandardSetDrawer.tsx:83`), c'è **`daily_readiness`** (upsert da `DailyCheckin.tsx:252` via `useAthleteReadinessHooks.ts:107`). La spec assume 2 write-path → il repo ne ha 3 attivi (più quelli inerti di `useOfflineSync`, non referenziato).

**8.3 — «generate-program non persiste nulla e ha body-param mode = new|continue» → REGGE.**
Zero insert/update/upsert/delete nella funzione (grep); solo select su profiles/injuries/exercises + RPC `is_coach_of_athlete`, e ritorna il JSON al client (`generate-program/index.ts:267`). `mode` accettato e obbligatorio con soli valori `new|continue` (`index.ts:115-117`); altri body-param: `athlete_id`, `focus_goal`, `days_per_week` (obbligatori), `equipment` (opzionale) (`index.ts:95-114`). È un parametro di richiesta, distinto dal futuro campo-profilo `coaching_mode` (che nel repo non esiste: grep `coaching_mode` → solo assenza).

**8.4 — «Branch zoneMap: cosa contiene vs main; la versione live resta v17» → CONTENUTO VERIFICATO; "v17 live" NON VERIFICABILE DAL REPO.**
`claude/zonemap-riconc` = 1 commit (`d777fd1`) avanti a main, tocca solo `method/zoneMap.ts` (+41/−7) e `zoneMap.test.ts` (+38): split dorsale/toracica + clamp tier per-zona (`ZONE_BASE`) — «Delta 1 riconciliazione». Non mergiato. Nel codice **non esiste alcun marker "v17"/"v18"**: `zoneMap.ts` (main) si dichiara derivato dalla «mappa v2 (app/mappa-zone-muscoli-pattern-bozza-2026-07-06.md)» con la sola zona "spalla" validata su DB (header, righe 1-4). Quale versione sia _deployata_ sull'Hub non è ispezionabile dal repo (serve Cowork/dashboard): **non verificato**.

**8.5 — «chat-with-coach chiama OpenAI e NON manda nome/id (solo testo libero + history)» → REGGE.**
Payload a OpenAI = system prompt (con contesto RAG), `...history` mappata a `{role, content}`, e la `query` utente (`chat-with-coach/index.ts:216-238` il 12/07; `:228-250` al 2026-09-05). Nessun nome/id atleta nel payload; il coach del retrieval lo risolve `match_knowledge_chunks` da `auth.uid()` lato Supabase (una libreria, dal 2026-09-05: nessun `coach_id` nella chiamata).

**8.6 — «Non esistono CLAUDE.md né docs/DESIGN.md (la F0 prevede di crearli)» → SMENTITA.**
Esistono entrambi: `CLAUDE.md` in root (ultima modifica 2026-07-04, 200+ righe operative) e `docs/DESIGN.md` (2026-07-04). Esiste anche l'intera infrastruttura `.claude/` (methodology, hooks, agents). La spec F0 è stantia su questo punto: F0 dovrà semmai **aggiornarli**, non crearli.

**8.7 — «Nessun codice legge una tabella method_config; parametri-metodo costanti inline in M1/M2» → REGGE.**
Grep repo-wide `method_config` → zero occorrenze. I parametri vivono hard-coded nei moduli `method/`: `PRESCRIPTIONS`/`SPLITS` (assembleWeek.ts), `RPE_PERCENT_TABLE` (rpeTable.ts), `NEUROTYPE_SEED` (neurotypeSeed.ts), `ZONE_MAP` (zoneMap.ts).

**8.8 — «RPE→%1RM passa SOLO da percent1RM (tabella proprietaria); nessuna formula alternativa nel codice attivo» → REGGE, con una precisazione.**
La conversione RPE→%1RM è unica: lookup `RPE_PERCENT_TABLE` + `percent1RM(rpe, reps)` (`method/rpeTable.ts:120-127`, usata in `assembleWeek.ts:512`; test di integrità/monotonia verdi). Nessun Epley/Brzycki nelle functions. **Precisazione**: la formula di Epley ESISTE in `src/` ma per un problema diverso — stima dell'e1RM da peso×reps per i grafici analytics (`useAthleteAnalytics.ts:165-166` con commento esplicito, `useAthleteVbtData.ts:88` inline). Non è una conversione RPE→% e non tocca la prescrizione; se la spec intende "nessuna formula 1RM nel codice attivo" in senso letterale, questi due punti la violano.

**8.9 — Altri scostamenti notati (repo vs docs interni):**

| Il doc assume/dice                                        | Il repo dice                                                        | Evidenza                           |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| CLAUDE.md: TS strict                                      | strict: false                                                       | `tsconfig.app.json`                |
| CLAUDE.md: PWA/Service Worker nello stack                 | PWA/SW rimossi                                                      | `vite.config.ts:5`                 |
| CLAUDE.md: React Router v6                                | v7.12.0                                                             | `package.json:70`                  |
| CLAUDE.md §9: Context7 non adottato                       | context7 configurato in `.mcp.json`                                 | `.mcp.json:15-21`                  |
| HANDOFF §2: «edge fn invite-athlete non usata dalla UI»   | la UI la invoca                                                     | `InviteAthleteDialog.tsx:159`      |
| README/PRODUCT_SPEC/ROADMAP: backend «oggi Lovable Cloud» | config/tooling puntano all'Hub UE di proprietà                      | `config.toml:1`, `package.json:19` |
| FASE1_REPORT R2: config.toml col vecchio ref              | oggi corretto (`xgxtplqlewpqjzghvbke`)                              | `config.toml:1`                    |
| D13_CAMPAIGN R8: hand-patch types.ts per `appointments`   | hand-patch dichiarato OBSOLETO; `appointments` presente in types.ts | 00-CORE §9; `types.ts`             |

---

## 9. Rischi e anomalie

1. **`.env` tracciato in git e puntato al backend SBAGLIATO.** `.env` è in `git ls-files`; NON contiene il ref dell'Hub UE (verificato con `grep -q xgxtplqlewpqjzghvbke .env` → assente): punta ancora al vecchio progetto. Il cutover reale vive solo in `.env.local` (non tracciato, presente nel solo checkout locale, contiene il ref Hub). Conseguenza: **ogni clone/build fresco del repo punta al vecchio backend Lovable**. Contiene anche una publishable key (pubblica by design, ma è comunque un file env tracciato che `.gitignore` non esclude). Solo nomi riportati qui.
2. **tsconfig non-strict** mentre CLAUDE.md dichiara strict (§2): ogni handoff scritto assumendo strict produrrà codice che il gate non verifica davvero.
3. **Nessuna CI**: tsc/lint/test girano solo su hook locali; i 45 test Deno del metodo e i 5 spec Playwright non girano da nessuna parte automaticamente.
4. **Tre lockfile** (package-lock.json + bun.lock + bun.lockb) tracciati: ambiguità su quale PM sia canonico e rischio di drift.
5. **File enormi**: `src/pages/coach/AthleteDetail.tsx` **3.223 righe** (scrive su 5+ tabelle), `StrategyContent.tsx` 1.502, `CoachSettings.tsx` 946 — contro la regola "niente nuovi file >300 righe" (sono legacy, ma ogni fetta che li tocca paga il costo).
6. **20 branch locali già mergiati** mai eliminati + 1 worktree orfano (`practical-jennings-02b402`, detached): rumore che confonde la ricognizione di chiunque.
7. **Doc di stato che mentono sul "da fare"**: D2/D7/D9/D10/D11 descrivono come aperto lavoro già eseguito; HANDOFF §2 contiene almeno una riga falsa (invite-athlete). Per un flusso che parte «da handoff scritti fuori dal repo» questo è il rischio numero uno di buchi di seconda mano.
8. **Cast `(supabase as any)` su program_blocks ormai superfluo**: il commento in `useSaveProgramBlock.ts:118-127` motiva il cast con l'assenza di `program_blocks` dal `Database` type, ma types.ts rigenerato la contiene (`types.ts:2024`). Il cast maschera type-safety su un write-path centrale.
9. **Migration correttiva out-of-band senza file nel repo** (126 versioni dichiarate sul DB vs 125+3 file, §4): repo e DB non sono ricostruibili l'uno dall'altro alla riga. Non verificato sul DB.
10. **Libreria `exercises` dichiarata VUOTA sul DB Hub** (HANDOFF §2/§4, con fallback SENTINEL in ProgramBuilder): blocca la generazione-programmi reale. Non verificato sul DB (corsia Cowork), ma se vero è il blocco funzionale principale.
11. **Segreti hardcoded: nessuno trovato** nei sorgenti (grep su pattern chiave; le env passano tutte da `Deno.env.get`/`import.meta.env`). `docs/D3_TEST_200_RUNBOOK.md` contiene una publishable key (pubblica by design). Vulnerabilità dipendenze: non verificate (niente `npm audit`, §0).

---

## 10. Raccomandazioni di riordino (proposte, NON eseguite)

In ordine di impatto. Costo: S/M/L. Nessuna eseguita in questa sessione.

**Prima di buildare F0:**

1. **Chiudere il cutover D6 e sistemare `.env`** — decidere: o `.env` tracciato punta all'Hub UE, o `.env` esce da git (+ `.env.example` coi soli nomi). _(S)_ — Rischio se rimandato: ogni ambiente nuovo (o build CI futura) punta al backend vecchio; le regressioni tipo `2f4c687` (commit Lovable che degrada types.ts) restano possibili finché Lovable è collegato.
2. **Riallineare CLAUDE.md al codice** (Router v7, PWA rimossa, TS non-strict — o decidere di attivare strict —, posizione context7, test Deno nel paragrafo Testing). _(S)_ — Rischio: F0 parte da handoff esterni che citeranno CLAUDE.md; ogni riga falsa lì si propaga a ogni fetta.
3. **Refresh di HANDOFF.md + marcare i doc D2/D7/D9/D10/D11/D13-campaign come STORICO/ESEGUITO** (basta un banner in testa). _(S)_ — Rischio: agenti e stesure future ripetono lavoro fatto o si fidano di righe false.
4. **Seed della libreria `exercises` sull'Hub** (corsia Cowork/Nicolò). _(M)_ — Rischio: generate-program e Program Builder restano non testabili end-to-end; F0 e zoneMap v18 si validerebbero su un DB vuoto.
5. **Scegliere il lockfile canonico** (presumibilmente `package-lock.json`) ed eliminare gli altri due. _(S)_ — Rischio: drift di dipendenze fra ambienti.

**Utile presto, ma può slittare a dopo F0:**

6. **CI minima** (GitHub Actions: `tsc --noEmit` + `eslint` + `deno test method/` + Playwright smoke opzionale). _(M)_ — Rischio: le regressioni si vedono solo sulla macchina di chi committa; i 45 test del metodo non proteggono nulla in remoto.
7. **Pulizia dei 20 branch mergiati + worktree orfano** (`git branch -d`, `git worktree prune`). _(S)_ — Rischio: solo rumore, ma cresce.
8. **Rimuovere il cast `as any` su program_blocks** ora che types.ts la contiene. _(S)_ — Rischio: buchi di tipo su un write-path che F0 estenderà.
9. **Dichiarare la versione Node** (`engines` o `.nvmrc`). _(S)_ — Rischio: ambienti disallineati.
10. **README riscritto post-Lovable.** _(S/M)_ — Rischio: chiunque arrivi dal README parte con il modello mentale sbagliato.

**Può aspettare:**

11. **Strict mode TypeScript progressivo** (per cartella, o `strictNullChecks` prima). _(L)_ — Rischio se rimandato: il debito cresce a ogni fetta, ma attivarlo ora costerebbe un intervento massiccio su codice legacy.
12. **Spezzare `AthleteDetail.tsx` (3.223 righe) e `StrategyContent.tsx`.** _(L)_ — Rischio: merge conflict e review lente su ogni fetta che tocca la scheda atleta.

---

_Report generato in sola lettura. Unico commit previsto: questo file, su `claude/ricognizione-repo`. Merge/push: Nicolò via GitHub Desktop._
