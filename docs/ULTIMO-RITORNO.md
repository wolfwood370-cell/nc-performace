# ULTIMO RITORNO — fetta regole-ask

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/regole-ask` · 2026-08-19 · base `main` = `9a53f0a` · PR [#51](https://github.com/wolfwood370-cell/nc-performace/pull/51).

## 1. Ramo e commit

**Ramo**: `claude/regole-ask` (worktree isolato) · **PR #51** aperta verso `main` (il merge resta a Nicolò) · 2 commit:

| Commit    | File                   | Contenuto                                     |
| --------- | ---------------------- | --------------------------------------------- |
| `e1214c7` | .claude/settings.json  | blocco `ask` (17 regole) dentro `permissions` |
| —         | docs/ULTIMO-RITORNO.md | questo file                                   |

Le 17 regole: 9 `Bash(...)` sui git che la storia non riporta indietro (`reset --hard`, `rebase`, `clean`, `stash drop`, `stash clear` — completano i checkout/restore già in deny dal 16/08) · 7 `Edit(...)` sui file-guardia (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/**`, `.husky/**`, `.mcp.json`) e sui 2 file del gate clinico (`release/decide.ts`, `intake/semaforo.ts`) · `mcp__github__*` che chiude sul canale MCP il buco del merge (ask, non deny: per scelta del mandato).

## 2. Le tre uscite (verifiche di sintassi — NON è «provato», v. §4)

**a) JSON valido** — `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`:

```
(nessun output)
exit=0
```

**b) Nessuna regola su Write** (le regole di percorso su `Write(...)` verrebbero accettate e mai consultate) — `grep -c '"Write(' .claude/settings.json`:

```
0
exit=1   (= zero occorrenze: è l'esito atteso di grep -c a conteggio 0)
```

**c) Il diff è SOLO l'aggiunta del blocco ask** — `git diff main...HEAD -- .claude/settings.json` (19+/0−; `deny`, `defaultMode` e `hooks` invariati):

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -1,6 +1,25 @@
 {
   "permissions": {
     "defaultMode": "plan",
+    "ask": [
+      "Bash(git reset --hard)",
+      "Bash(git reset --hard *)",
+      "Bash(git rebase)",
+      "Bash(git rebase *)",
+      "Bash(git clean)",
+      "Bash(git clean *)",
+      "Bash(git stash drop)",
+      "Bash(git stash drop *)",
+      "Bash(git stash clear)",
+      "Edit(/.claude/settings.json)",
+      "Edit(/.claude/settings.local.json)",
+      "Edit(/.claude/hooks/**)",
+      "Edit(/.husky/**)",
+      "Edit(/.mcp.json)",
+      "Edit(/supabase/functions/release-autonomous-program/release/decide.ts)",
+      "Edit(/supabase/functions/submit-intake/intake/semaforo.ts)",
+      "mcp__github__*"
+    ],
     "deny": [
       "Bash(gh pr merge)",
       "Bash(gh pr merge *)",
```

In più, fuori mandato ma di rito: `prettier --check` verde sul file.

## 3. Passata indipendente (pre-commit, 3 lenti, tutte PASS)

- **Conformità al mandato**: le 17 voci di `ask` corrispondono carattere-per-carattere e nell'ordine esatto all'elenco del mandato (confronto programmatico); `deny` ancora le 6 voci storiche; `defaultMode` e `hooks` identici a HEAD.
- **code-reviewer**: «committabile sì» — diff puramente additivo e chirurgico, nessun pattern in grado di bloccare il flusso standard (commit, push su `claude/*`, tsc, test). I 4 finding non bloccanti sono in §6.
- **Doc ufficiali (le 4 affermazioni di sintassi del mandato)**: (1) CONFERMATA — le regole di percorso valgono solo per `Edit(path)`/`Read(path)`, una regola su `Write(...)` è accettata e mai consultata; (2) CONFERMATA — in un settings di progetto `/percorso` = radice del progetto (`//` = assoluto); (3) CONFERMATA — una regola `ask` fa il prompt anche in auto mode e anche dopo l'allow di un hook PreToolUse; (4) **correzione di realtà**: le doc dicono che `permissions` e `hooks` si ricaricano **a caldo** quando il file cambia — la premessa «le regole si leggono all'avvio» del mandato è superata (coerente con la misura del 15/08, fetta cancelli-che-mordono). Non cambia il debito di §4: cambia solo il _perché_ questa sessione non le ha attive.

## 4. Il debito della prova — dichiarato il 2026-08-19

**Questa sessione NON ha provato le regole, per costruzione**: l'edit è avvenuto nella copia del worktree (`.claude/worktrees/regole-ask/`), mentre il settings del checkout principale — quello della sessione — resta `277465a` fino a merge+pull. Qualunque tentativo adesso passerebbe per la ragione sbagliata; per lo stesso motivo qui non compare la parola «provato».

**LA PROVA VERA È NELLA SESSIONE SEGUENTE**: in una sessione nuova aperta dopo il merge, tentare `git reset --hard HEAD` su albero pulito (non fa nulla) e riferire se è comparsa la richiesta di conferma. Se NON compare, la regola non è attiva e va capito perché prima di fidarsene.

## 5. Perimetro

`git diff --stat main...HEAD` → **2 file, nessun altro**: `.claude/settings.json` (+19) e `docs/ULTIMO-RITORNO.md` (riscritto). Nessun file di codice, nessuna migration, nessun gate clinico toccato (decide.ts e semaforo.ts compaiono solo come _stringhe_ dentro le regole). **La RETRO nel Log di auto-miglioramento NON fa parte di questa fetta** (perimetro di mandato = 2 file): resta da scrivere in una sessione successiva.

## 6. Proposte (nessuna aggiunta di testa mia alle regole — come da mandato)

1. **Asimmetria sul merge**: `gh pr merge` è in deny, `mcp__github__*` (che include `merge_pull_request`) è in ask — la stessa operazione vietata da CLI diventa approvabile con una conferma via MCP. Coerente con l'intento del mandato (spegnere il server sarebbe più largo del problema); per parità di severità servirebbe un deny mirato su `mcp__github__merge_pull_request`. Decisione di Nicolò.
2. **Le regole `Edit` valgono per il tool, non per l'effetto**: una scrittura via Bash (`sed -i`, redirect `>`, `node -e fs.writeFileSync`) sui file-guardia non incontra l'ask — stessa lacuna della cintura `hooks.mjs` (matcher `Write|Edit|MultiEdit`). La protezione sui 5 file-guardia e sui 2 file del gate è una cintura in più, non un cancello.
3. **Copertura prefissale dei pattern Bash**: `git -C <path> reset --hard` e le forme riordinate (`git reset HEAD~1 --hard`) sfuggono a `Bash(git reset --hard *)` — stessa forma prefissale del deny esistente, quindi coerente col repo, ma dichiarata.
4. **Ask in contesti non interattivi = rifiuto** (`claude -p`): oggi nessun uso nel repo, da ricordare se mai si automatizza.
5. **Nota worktree**: le regole di percorso valgono per la radice-progetto della sessione — da una sessione dentro un worktree coprono `<worktree>/.husky/**`, non la copia del principale che è quella realmente eseguita (hooksPath assoluto).

## 7. I check sulla PR

La fetta tocca solo un file di config e un doc: nessun codice, nessuna dipendenza. Quadro atteso su PR #51 (obbligatori: i primi 2):

| Check                     | Obbligatorio | Atteso                                           |
| ------------------------- | ------------ | ------------------------------------------------ |
| Tipi · lint · unit (web)  | ✅ sì        | verde (nessun file TS toccato)                   |
| Unit edge function (Deno) | ✅ sì        | verde (nessuna edge function toccata)            |
| End-to-end (Playwright)   | no           | verde                                            |
| Catena di fornitura       | no           | verde (allowlist pulita da `56f22bb`, su `main`) |

L'esito vero si legge sul run CI della PR — è lì che si accetta il verde, non sul run locale. Push verificato in pari. **Il merge della PR #51 resta a Nicolò** — l'agente non unisce, non forza, non cancella rami.
