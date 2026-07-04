# \_TEMPLATE-TASK — prompt-file per un task

> Copia questo file in `docs/prompts/AAAA-MM-GG-<slug>.md`, compila i campi, poi si lancia nello **strumento di destinazione**.
> Un prompt-file = **un task atomico**. Se il task ne contiene tre, sono tre file.
> Lo prepara **Cowork** (Inquadro + STOP-per-OK) e lo committa **Code**; l'esecuzione è di Nick.

---

**Task:** <titolo breve, imperativo>
**Data:** AAAA-MM-GG
**Strumento di destinazione:** ☐ Claude Code ☐ Claude Design ☐ Lovable ☐ Cowork (DB/connettore)
**Branch previsto:** `claude/<slug>` (se Code)

## 1. Obiettivo (perché)

<1-3 righe: cosa risolve e per chi. Il "fatto" è definito dall'acceptance §4, non da qui.>

## 2. Contratto (il patto verificabile)

- **Input:** <schema/payload/handoff/screenshot/dati di partenza — con `file:line` dove serve>
- **Output atteso:** <componenti/endpoint/migrazione/tipi; forma precisa>
- **Invarianti da non rompere:** <es. token namespace Coach/Athlete, RLS deny-by-default, contratto payload `submit_intake`>

## 3. File

- **Da toccare (permessi):** <elenco esplicito `path` — nient'altro>
- **VIETATI (non aprire, non modificare):** <es. `.env*`, `supabase/config`, secrets, file fuori scope; per Code: **niente applicazione DB** — solo il FILE di migrazione>
- **Scope guard:** niente "while you're here" (`CLAUDE.md` legge #4). Fuori-scope → si flagga, non si tocca.

## 4. Acceptance (criteri falsificabili — ognuno può bocciare)

- ☐ <criterio 1 osservabile: es. "`npx tsc --noEmit -p tsconfig.app.json` verde">
- ☐ <criterio 2: es. "nessun hex raw nei namespace Coach/Athlete (grep §8 di 04-DESIGN-TO-CODE)">
- ☐ <criterio 3: es. "`get_advisors(security)` = 0 nuovi warning dopo la migrazione">
- ☐ <criterio 4: es. "E2E Playwright X verde" / "submission reale in DB con RLS rispettata">

## 5. Verifica (come si controlla, non a memoria)

- **Build-gate:** `npx tsc --noEmit -p tsconfig.app.json`
- **Diff reale:** `git diff <base>..HEAD` — non il "success" dello strumento
- **DB (se tocca):** `get_advisors(security)` dopo ogni DDL + `execute_sql` di controllo (Cowork)
- **Browser (se UI):** verifica in Claude-in-Chrome sul flusso reale
- **Sicurezza (milestone):** `/security-review` (Code) su dati art.9

## 6. Chiusura

- Commit atomico (italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`) su branch → **verifica-commit** immediata.
- Aggiorna `docs/HANDOFF.md` (§2/§3/§4) e la RETRO in `docs/auto-miglioramento.md`.
- Ricorda a Nick i 5 step GitHub Desktop. **Merge/push = Nick.**
