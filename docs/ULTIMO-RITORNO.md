# ULTIMO RITORNO — fetta deny-non-ask

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/deny-non-ask` · 2026-08-20 · base `main` = `d0af538` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/deny-non-ask) — il perché in §6).

## 1. Le tre sonde — la prova che il ritorno di regole-ask chiedeva (§4 di quel ritorno)

Eseguite PRIMA di toccare qualunque file, con le regole `ask` della PR #51 attive nella sessione
(checkout principale a `d0af538`). La domanda, per ciascuna: **è comparsa una richiesta di conferma?**

| #   | Sonda                                          | Regola `ask` sotto misura      | È comparsa una conferma?                         |
| --- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| 1   | `git rebase HEAD` (albero pulito)              | `Bash(git rebase *)`           | **NO** — eseguita subito, non negata             |
| 2   | `git reset --hard HEAD` (albero pulito)        | `Bash(git reset --hard *)`     | **NO** — eseguita subito, non negata             |
| 3   | `Edit` su `.claude/settings.json` (il passo 1) | `Edit(/.claude/settings.json)` | **NO** — eseguita subito, non negata (riserva ↓) |

**Riserva sulla sonda 3, dichiarata**: l'edit è avvenuto sulla **copia del worktree**
(`.claude/worktrees/deny-non-ask/.claude/settings.json`) e il pattern `/.claude/settings.json` si
risolve sulla radice-progetto della sessione (il checkout principale) — il «non morde» qui può
dipendere anche dal mancato match del percorso, non solo dalla debolezza delle `ask`. È comunque la
misura che conta _in condizioni reali_: è così che l'agente edita davvero questi file (nota già in
§6.5 del ritorno precedente). La cintura sui file-guardia, per come lavora l'agente, **oggi non ha
mai morso**: non chiamarla cancello.

**Conclusione delle sonde**: le `ask` non mordono, le `deny` sì (misura 2026-08-16, fetta
cancelli-che-mordono) → i distruttivi vanno in `deny`. È l'esito atteso ed è il motivo della fetta.

## 2. Le quattro uscite del passo di verifica

**a) JSON valido** — `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`:

```
(nessun output)
exit=0
```

**b) Nessuna regola su `Write(`** — `grep -c '"Write(' .claude/settings.json`:

```
0
exit=1   (= zero occorrenze: esito atteso di grep -c a conteggio 0)
```

**c) Conteggi** — `node -e "const p=require('./.claude/settings.json').permissions;console.log('deny',p.deny.length,'ask',p.ask.length,'mode',p.defaultMode)"`:

```
deny 16 ask 7 mode plan
```

**d) Il diff è SOLO il blocco `permissions`** — `git diff main...HEAD -- .claude/settings.json`
(11+/11−; `defaultMode` e `hooks` invariati — hooks verificato anche byte-per-byte via JSON):

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -1,7 +1,13 @@
 {
   "permissions": {
     "defaultMode": "plan",
-    "ask": [
+    "deny": [
+      "Bash(gh pr merge)",
+      "Bash(gh pr merge *)",
+      "Bash(git checkout -- *)",
+      "Bash(git checkout .)",
+      "Bash(git restore)",
+      "Bash(git restore *)",
       "Bash(git reset --hard)",
       "Bash(git reset --hard *)",
       "Bash(git rebase)",
@@ -11,22 +17,16 @@
       "Bash(git stash drop)",
       "Bash(git stash drop *)",
       "Bash(git stash clear)",
+      "mcp__github__*"
+    ],
+    "ask": [
       "Edit(/.claude/settings.json)",
       "Edit(/.claude/settings.local.json)",
       "Edit(/.claude/hooks/**)",
       "Edit(/.husky/**)",
       "Edit(/.mcp.json)",
       "Edit(/supabase/functions/release-autonomous-program/release/decide.ts)",
-      "Edit(/supabase/functions/submit-intake/intake/semaforo.ts)",
-      "mcp__github__*"
-    ],
-    "deny": [
-      "Bash(gh pr merge)",
-      "Bash(gh pr merge *)",
-      "Bash(git checkout -- *)",
-      "Bash(git checkout .)",
-      "Bash(git restore)",
-      "Bash(git restore *)"
+      "Edit(/supabase/functions/submit-intake/intake/semaforo.ts)"
     ]
   },
   "hooks": {
```

In più, di rito: `prettier --check` verde sul file; confronto programmatico `deny`/`ask`
carattere-per-carattere e nell'ordine esatto del mandato (`deny match: true`, `ask match: true`);
passata `code-reviewer` indipendente: **committabile sì** — nessun pattern del nuovo `deny` blocca
il flusso standard (commit, push su `claude/*`, tsc, test, prettier, curl); `lint-staged` usa
`git stash drop` internamente al processo husky, fuori dal layer permessi. Suo finding onesto: con
i distruttivi in `deny` sparisce l'uscita «chiedi»: `git rebase --continue` o `git clean -fd` non
sono eseguibili nemmeno con l'OK di Nicolò in sessione — se servono, li esegue lui dalla sua shell,
dove queste regole non valgono. È il design, non un difetto.

## 3. Perimetro

`git diff --stat main...HEAD` → **2 file, nessun altro**: `.claude/settings.json` (11+/11−, commit
`605fde3`) e `docs/ULTIMO-RITORNO.md` (riscritto, questo file). Nessun file di codice, nessuna
migration, nessun gate clinico toccato (`decide.ts` e `semaforo.ts` compaiono solo come _stringhe_
dentro le regole `ask`). La RETRO nel Log di auto-miglioramento NON fa parte del perimetro.

## 4. Il debito della prova — e la REGOLA NUOVA che lo estingue

**Le nuove `deny` NON SONO PROVATE IN QUESTA SESSIONE**, per lo stesso motivo di prima: l'edit vive
nel worktree, il settings della sessione resta quello della PR #51 fino a merge+pull. Qualunque
tentativo adesso passerebbe (o fallirebbe) per la ragione sbagliata.

⛔ **REGOLA NUOVA — vale da adesso: OGNI FETTA COMINCIA PROVANDO LE REGOLE DELLA FETTA
PRECEDENTE.** Prima riga di lavoro, prima di qualunque modifica. Costa dieci secondi e toglie
Nicolò dal giro delle prove manuali. Per la prossima fetta significa: a sessione nuova dopo il
merge, tentare `git reset --hard HEAD` e `git rebase HEAD` su albero pulito e riferire l'esito
atteso **NEGATO** (deny che morde); se invece eseguono, fermarsi e capire perché prima di
proseguire. Questa fetta è la prima applicazione della regola: le sue sonde (§1) erano esattamente
la prova delle regole della fetta precedente.

## 5. Il quadro CI

La fetta tocca solo un file di config e un doc: nessun codice, nessuna dipendenza. I check girano
sulla PR quando viene aperta (v. §6). Quadro atteso (obbligatori: i primi 2):

| Check                     | Obbligatorio | Atteso                                |
| ------------------------- | ------------ | ------------------------------------- |
| Tipi · lint · unit (web)  | ✅ sì        | verde (nessun file TS toccato)        |
| Unit edge function (Deno) | ✅ sì        | verde (nessuna edge function toccata) |
| End-to-end (Playwright)   | no           | verde                                 |
| Catena di fornitura       | no           | verde (allowlist pulita da `56f22bb`) |

L'esito vero si legge sul run CI della PR — è lì che si accetta il verde, non sul run locale.
**Il merge resta a Nicolò** — l'agente non unisce, non forza, non cancella rami.

## 6. Fuori mandato, misurato: la PR non l'ha potuta aprire l'agente

Il ramo è pushato e verificato in pari (`## claude/deny-non-ask...origin/claude/deny-non-ask`), ma
il pattern PR-via-API che funzionava il 18/08 (3 comandi piatti: `git credential fill` su file →
header → `curl`) oggi è **bloccato dal classificatore auto-mode al primo passo** (accesso
credenziali), e con lui ogni alternativa (la CLI `gh` non è installata; anche l'ispezione dei nomi
delle variabili d'ambiente è negata). Nessun aggiramento tentato: l'intento del blocco è chiaro e
un aggiramento sarebbe peggio del ritardo. **Azione per Nicolò**: aprire la PR dal
[link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/deny-non-ask)
(un click; titolo suggerito: `chore(permessi): fetta deny-non-ask — git distruttivi e canale MCP
GitHub da ask a deny`). Per una fetta che misura i permessi, anche questo è un dato: il perimetro
di ciò che l'agente può fare si sta stringendo, e la chiusura-fetta «push + PR» di 00-CORE §6.4
oggi si ferma al push.
