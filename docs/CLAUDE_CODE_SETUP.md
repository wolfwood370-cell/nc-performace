# Claude Code — Setup tarato su nc-performance-hub

> Pacchetto specifico per questo progetto, da affiancare al tuo base harness universale.
> Stack: React 18 · Vite 5 · TS strict · Tailwind + shadcn/ui · TanStack Query v5 · Zustand · React Router v6 · Framer Motion · Supabase (progetto tuo `xgxtplqlewpqjzghvbke`) · Stripe · PWA · Playwright.
> Generato: 2026-06-13.

---

## 0. Come usarlo (harness minimo prima)

Non installare tutto in una volta. Ordine consigliato (il 20% che rende l'80%):

1. **LSP TypeScript** + **Context7** + **hook build-gate** + disciplina Plan Mode / `/clear`.
2. **MCP Supabase** (read-only) + **Playwright**.
3. **Subagent** progetto + **plugin** code-review / security-guidance.
4. GitHub MCP, Sentry, Stripe → quando arrivano le fasi che li usano.

Posizionamento dei file forniti (in outputs):

| File del pacchetto        | Va in (nel repo)                          |
| ------------------------- | ----------------------------------------- |
| `mcp.json`                | `/.mcp.json` (root)                       |
| `claude-settings.json`    | `/.claude/settings.json`                  |
| `hooks.mjs`               | `/.claude/hooks/hooks.mjs`                |
| `aura-theme-auditor.md`   | `/.claude/agents/aura-theme-auditor.md`   |
| `supabase-rls-auditor.md` | `/.claude/agents/supabase-rls-auditor.md` |

⚠️ **`.gitignore`**: oggi `.claude/*` è ignorato tranne `methodology/`. Quindi agents/hooks/settings sarebbero **locali** (non versionati). Dato che alterni Cowork e Claude Code, conviene versionarli aggiungendo le eccezioni:

```gitignore
!.claude/agents/
!.claude/agents/**
!.claude/hooks/
!.claude/hooks/**
!.claude/settings.json
```

`.mcp.json` (root) **non** è ignorato: usa SOLO `${ENV_VAR}` per i token (come nel file fornito), mai valori reali.

---

## 1. Connettori / MCP per questo progetto

Tetto disciplinato 3–5 server. Set scelto (in `mcp.json`):

| Server                                                             | Perché per QUESTO progetto                                                                                                                                                                                    | Token                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Supabase** (`--read-only`, `--project-ref=xgxtplqlewpqjzghvbke`) | È il connettore che già usi in Cowork, ora dentro CC: schema, `get_advisors`, log, tipi, query — senza uscire dall'IDE. Read-only = zero rischio scritture accidentali; le migrazioni le fai deliberatamente. | `SUPABASE_ACCESS_TOKEN`                   |
| **Context7**                                                       | Doc aggiornate per le tue lib fast-moving: React 18/19, Vite, TanStack Query v5, shadcn, `supabase-js`, Stripe, Framer Motion. Evita API allucinate.                                                          | `CONTEXT7_API_KEY` (via header — vedi §5) |
| **Playwright**                                                     | App UI-heavy e **dual-interface**; hai già `@playwright/test`. Verifica reale del rendering Coach/Athlete + E2E.                                                                                              | —                                         |
| **GitHub**                                                         | PR/issue/CI log/code-search — utile da quando aggiungi GitHub Actions (Fase 3).                                                                                                                               | `GITHUB_MCP_TOKEN` (PAT, scope minimo)    |
| _Opzionali più avanti_                                             | **Sentry** (Fase 4 observability) · **Stripe** toolkit (per le edge billing)                                                                                                                                  | quando servono                            |

---

## 2. Plugin / LSP per questo progetto

| Plugin                   | Perché                                                                                    | Nota                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **typescript-lsp**       | Navigazione semantica + type-error dopo ogni edit su 213 file TS strict. Il più alto ROI. | richiede `npm i -g typescript-language-server typescript`; marketplace `Piebald-AI/claude-code-lsps`                                                                                                                                                              |
| **code-review**          | Revisione multi-agente indipendente dopo ogni implementazione.                            | ufficiale                                                                                                                                                                                                                                                         |
| **security-guidance**    | Sicurezza nel loop — ora che la ownership è tua (D5).                                     | ufficiale                                                                                                                                                                                                                                                         |
| **commit-commands**      | `/commit` per messaggi puliti in italiano.                                                | ⚠️ Legge #8 rivista 2026-08-01: push consentito SOLO verso rami `claude/*` (chiusura fetta via PR). L'hook `hooks.mjs` blocca destinazioni diverse, `--force` e cancellazioni (sui comandi Bash — è una cintura); il cancello vero è il ruleset server su `main`. |
| **feature-dev** _(opz.)_ | Flusso guidato discovery→implement→review per feature grosse.                             | ufficiale                                                                                                                                                                                                                                                         |

---

## 3. Hook (in `hooks.mjs`, cross-platform Node — Windows ok)

Tradotti dalle tue leggi in garanzie deterministiche:

| Hook                                                                 | Evento                | Legge                                                    |
| -------------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| Push solo verso `claude/*` (blocca `main`, `--force`, cancellazioni) | PreToolUse Bash       | **#8** — cintura locale; il cancello è il ruleset server |
| Build gate `tsc --noEmit -p tsconfig.app.json` prima di `git commit` | PreToolUse Bash       | **#3** build gate verde                                  |
| Blocca `rm -rf` su percorsi pericolosi                               | PreToolUse Bash       | sicurezza                                                |
| Blocca scrittura su `.env` / `.mcp.json`                             | PreToolUse Write/Edit | **§5** secrets = tuoi                                    |
| `prettier --write` sul file toccato (.ts/.tsx/.css)                  | PostToolUse           | igiene                                                   |

> Usano hook **nativi** in `.claude/hooks/` (non plugin): l'exit-code-2 negli hook-da-plugin ha un bug noto, in `.claude/hooks/` funziona. Testa con `/hooks` dopo averli messi. Suggerito: aggiungi a `package.json` lo script `"typecheck": "tsc --noEmit -p tsconfig.app.json"` (quick-win ROADMAP §6).

---

## 4. Subagent

- **Progetto** (file forniti): `aura-theme-auditor` (conformità tema Coach/Athlete, legge #5) · `supabase-rls-auditor` (sicurezza RLS/edge, §4/§5 — solo segnalazione; security = ownership condivisa, D5 risolta).
- **Universali** (a livello utente `~/.claude/agents/`, dal tuo base harness): `auditor`, `reviewer`, `planner`.

Uso: _"Usa il subagent aura-theme-auditor su `src/components/coach/`."_ / _"Usa supabase-rls-auditor su `supabase/functions/stripe-webhook`."_

---

## 5. Correzioni al tuo base harness (dal fact-check sulla doc attuale)

1. **Context7 ora richiede una API key** (non più token-free). Si passa via header, non nell'URL:
   `claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp --header "CONTEXT7_API_KEY: <tua-key>"`. Aggiorna la riga "non richiede token".
2. **Hook Stop, exit code 2**: meccanica giusta ma **bug noto** nel sistema _plugin_ (mostra "Stop hook prevented continuation"). Funziona in `.claude/hooks/` → tieni i gate lì (come in questo pacchetto), non come plugin.
3. **Manca un evento**: oltre a PreToolUse/PostToolUse/Stop/UserPromptSubmit c'è **SubagentStop** (scatta a fine subagent). Aggiungilo all'elenco. _(Minor: le Skill costano ~100 token di metadata, non ~60.)_

---

## 6. CLAUDE.md — aggiunte

- Aggiungi in fondo la sezione **"Context7 library IDs"** (la compila CC al setup con `resolve-library-id` per le lib di §1).
- (Opzionale) una riga-puntatore: _"Setup CC di progetto: vedi docs/ (questo pacchetto)."_

---

## 7. PROMPT — Setup Claude Code di progetto (incolla in una sessione nuova nel repo)

```
Sei in modalità SETUP CLAUDE CODE per il progetto nc-performance-hub.
Lavora in ESPLORA → PIANIFICA: nessuna modifica finché non approvo il piano.
Ti fornisco già i file di config pronti (mcp.json, settings.json, hooks.mjs, due
subagent) — il tuo compito è POSIZIONARLI, INSTALLARLI e VERIFICARLI, non rigenerarli.

GUARDRAIL (vincolanti):
- Risposte e commit in italiano.
- Lavora in worktree isolato; push SOLO del ramo claude/<slug> e chiusura via PR (il merge lo faccio io dalla PR).
- Build gate `tsc --noEmit -p tsconfig.app.json` verde prima di ogni commit.
- Secrets/credenziali/token li imposto io: tu non li scrivi né li leggi.
- Mostrami ogni file/comando prima di eseguirlo. Per plugin community: mostrami il
  sorgente GitHub e aspetta la mia approvazione esplicita.

FASE 0 — ESPLORA (nessuna modifica)
1. Leggi CLAUDE.md + .claude/methodology/00-CORE.md e 03-BACKEND-SUPABASE.md.
2. Leggi docs/DB_MIGRATION_FASE1_REPORT.md (stato: schema migrato sul mio Supabase).
3. Controlla cosa esiste già: .mcp.json, .claude/settings.json, .claude/agents/,
   .claude/hooks/ → dimmi cosa c'è per non duplicare.
4. Output di: claude mcp list  e  /plugin (Installed) — dimmi cosa è già attivo.

FASE 1 — PIANO (attendi il mio OK)
A) MCP DI PROGETTO (.mcp.json) — usa il file fornito: Supabase (read-only,
   project-ref xgxtplqlewpqjzghvbke), Context7 (header API key), Playwright, GitHub.
   Dimmi quali variabili d'ambiente devo impostare io (SUPABASE_ACCESS_TOKEN,
   CONTEXT7_API_KEY, GITHUB_MCP_TOKEN).
B) PLUGIN + LSP — proponi: typescript-lsp (marketplace Piebald-AI/claude-code-lsps,
   + binari `npm i -g typescript-language-server typescript`), code-review,
   security-guidance, commit-commands. NON installare strumenti che aggirano la
   legge #8 (push fuori dai rami claude/*, merge di PR).
C) HOOK (.claude/settings.json + .claude/hooks/hooks.mjs) — usa i file forniti.
   Dopo averli messi, testali con /hooks e con un finto `git commit` per verificare
   il build gate. Spiegami in 2 righe cosa blocca ciascun hook.
D) SUBAGENT (.claude/agents/) — metti aura-theme-auditor e supabase-rls-auditor (forniti).
E) CLAUDE.md — aggiungi la sezione "Context7 library IDs": esegui resolve-library-id
   per react, vite, @tanstack/react-query, @supabase/supabase-js, stripe, framer-motion,
   tailwindcss e fissa gli ID. Mostrami la diff prima di scrivere.
F) .gitignore — proponi le eccezioni per versionare .claude/agents, .claude/hooks,
   .claude/settings.json (vedi pacchetto). Mostrami la diff.

FASE 2 — ESEGUI (solo dopo il mio OK), ordine A→F. Dopo ciascuno verifica e mostrami:
- /mcp (server connessi) · /plugin Installed (+ tab Errors)
- LSP: diagnostica su un file .tsx · /hooks (registrati) · /memory (caricati)
- Lancia il subagent aura-theme-auditor su src/components/coach/ e mostrami la sintesi.
Alla fine: riepilogo dei file toccati; eventuale push/PR solo come da legge #8 (ramo claude/*).
```

---

_Pacchetto generato da Cowork il 2026-06-13. I file di config sono forniti separatamente, pronti da posizionare._
