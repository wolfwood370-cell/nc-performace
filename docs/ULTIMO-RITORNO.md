# ULTIMO RITORNO — fetta consegna-scheda-coach

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/consegna-scheda-coach` · 2026-08-20 · base `main` = `fc62090` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/consegna-scheda-coach) — il perché in §9).

## 1. Ramo e commit

`claude/consegna-scheda-coach`, 7 commit da `fc62090`: `711b96d` (modulo puro coachRelease + 11 test
Deno) · `83fe9f1` (releaseView v2 + round-trip vitest) · `6f3357b` (edge `publish-program-block`) ·
`827e35a` (dialogo di consegna + hook + colonna Rec) · `a512211` (vista atleta: giorno per data,
elenco per serie) · `0f61c78` (chiusura rilievi review: 2 major + 3 minori) · il commit dei
documenti (questo file, AGENTS.md, HANDOFF, RETRO) è il tip del ramo — hash nel messaggio di
chiusura, non qui: un file non può contenere l'hash del commit che lo introduce.

## 2. Manifesto

**NUOVI:** `supabase/functions/publish-program-block/index.ts` ·
`supabase/functions/_shared/program/coachRelease.ts` (⚠ 429 righe, v. §8.2) ·
`supabase/functions/_shared/program/__tests__/coachRelease.test.ts` ·
`src/hooks/coach/usePublishProgramBlock.ts` · `src/components/coach/program/PublishProgramDialog.tsx` ·
`src/lib/program/__tests__/releaseViewV2.test.ts`

**MODIFICATI:** `src/lib/program/releaseView.ts` (dispatch a `:84`; v1 invariato) ·
`src/pages/athlete/AthleteTraining.tsx` (smistamento versione a `:818`) ·
`src/pages/coach/ProgramBuilder.tsx` · `src/components/coach/program/ProgrammedExerciseCard.tsx` ·
`AGENTS.md` · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` · `docs/ULTIMO-RITORNO.md`

**NEL PERIMETRO MA NON TOCCATI:** i VIETATI (`supabase/functions/release-autonomous-program/**`,
`supabase/functions/submit-intake/intake/semaforo.ts`, `supabase/migrations/**`,
`src/integrations/supabase/types.ts`, famiglie `program_plans/*` e `workouts/*`) — verificato:
`git diff origin/main..HEAD --stat` = solo i 10 file di codice + 4 doc dichiarati.

## 3. La matrice delle 16 `deny` — provate PRIMA di tutto il resto

Repo di scarto `/tmp/prova-deny` (git init + 2 commit + 2 stash + file dirty + branch), come da
mandato. Ogni comando pericoloso provato in forma composta `cd /tmp/prova-deny && <cmd>` (se il
morso mancasse, il danno cade nello scarto) e, per le forme nude, con l'analisi di innocuità fatta
prima. **Scoperta di metodo: il matcher spezza i composti** — la deny morde anche dentro
`cd … && <cmd>`.

| #   | Comando provato            | Esito osservato                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `gh pr merge`              | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 2   | `gh pr merge 1`            | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 3   | `git checkout -- f.txt`    | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 4   | `git checkout .`           | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 5   | `git restore` (nudo)       | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 6   | `git restore f.txt`        | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 7   | `git reset --hard` (nudo)  | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 8   | `git reset --hard HEAD`    | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 9   | `git rebase` (nudo)        | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 10  | `git rebase master`        | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 11  | `git clean` (nudo)         | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 12  | `git clean -fd`            | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 13  | `git stash drop` (nudo)    | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 14  | `git stash drop stash@{0}` | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 15  | `git stash clear`          | **RIFIUTATO dal permesso**                                                                                                                                                                                                                                          |
| 16  | `mcp__github__*`           | **superficie assente**: server `github` configurato in `.mcp.json:26-32`, ma NESSUN tool `mcp__github__*` esposto in sessione (verificato con ricerca tool) — la deny agisce a monte, un rifiuto per-chiamata non è osservabile perché non esiste nulla da chiamare |

**Testo esatto di un rifiuto** (identico nel formato per tutte le 15):

```
Permission to use Bash with command cd /tmp/prova-deny && git reset --hard HEAD has been denied.
```

**I vicini consentiti, tutti passati** (il controllo che può fallire): `git checkout -b prova` →
`Switched to a new branch 'prova'` · `git status` → elenco modifiche · `git stash list` → 2 stash ·
`git log --oneline -1` → hash · `git status --porcelain` → ` M f.txt`. Nessuna cella è passata da
BLOCCA a CONSENTE senza essere nominata: 15/15 BLOCCA, 5/5 vicini CONSENTE, 1 senza superficie.
Nota sui vicini `gh`: la CLI `gh` non è installata su questa macchina — il morso della deny agisce
comunque PRIMA del lookup del binario (il rifiuto è sul testo del comando, non sull'esecuzione).

Questa matrice è anche la **prima applicazione della REGOLA NUOVA** del ritorno precedente («ogni
fetta comincia provando le regole della fetta precedente»): le sonde chieste — `git reset --hard
HEAD` e `git rebase` su albero pulito — sono le righe 8 e 9, entrambe NEGATE come atteso.

⛔ Nessun comando dell'elenco `ask` è servito alla fetta: nessuna richiesta di conferma da
segnalare (le `ask` restano non-osservabili da questa corsia, come già misurato).

## 4. Acceptance — comando ed esito

1. 🔴 **Andata e ritorno serie-per-serie** — `npx vitest run src/lib/program/__tests__/releaseViewV2.test.ts`:
   il test «ogni valore osservato dall'atleta è identico al prescritto, serie per serie» confronta
   record normalizzati con chiave identitaria (`w1-s1-e1#2`) su un blocco di 3 settimane con serie
   non uniformi (8/RPE 7/rec 90 · 6/RPE 8.5/rec 150 · AMRAP/RIR 1/rec 180), solo-%1RM senza RPE,
   superset, tempo, coach_notes, e una data SPOSTATA dal coach (w3-s1 → 2026-09-23). **VERDE**, e la
   prova rossa è al §5.
2. **Assente resta assente** — stesso file: `rpe: null` nel documento, nessuna etichetta RPE in
   scheme né in `formatReleaseSetLine`; `rpe: 0` forzato → validatore rosso (§5). **VERDE.**
3. **Il gate chiude nelle due direzioni** — la funzione di decisione è il `safetyGate` CONDIVISO,
   già provato in `supabase/functions/_shared/method/assembleWeek.test.ts:216-266` (clearance
   true → blocked; false + red flags puliti → pass), dentro i 494 Deno verdi. Il cablaggio
   (409 `clearance_required`/`red_flags`, UNA riga `coach_alerts` fail-loud con dedupe, ZERO
   scritture su `program_releases`) è a `publish-program-block/index.ts` passi 5, verificato da
   review + refuter. Test di rete non prescritto (spec §7: niente e2e che scrive nel ledger).
4. **Il giallo non blocca** — prova strutturale con controllo positivo: in
   `publish-program-block/index.ts` le sole occorrenze di giallo/semaforo sono il commento
   `CORE §0.3` (`:237-239`) e il flag forense in `safety_context`; il percorso autonomo invece lo
   valuta (`release/decide.ts:94,110` — file NON toccato). Nessun controllo da cui il giallo possa
   bloccare: il ramo non esiste.
5. **La seconda consegna supera la prima** — catena a `index.ts` passo 8: coda per
   `released_at desc limit 1` → `supersedes_id`; `23505` → 409 `publish_conflict` senza retry.
   Copertura: lettura di review + refuter (vincoli `uq_program_releases_*` della migration
   `20260715093935:25-28` confermati raggiungibili); prova di rete = collaudo di Nicolò (§9),
   perché due chiamate vere scrivono righe indelebili (spec §7).
6. **La v1 non si muove** — `git diff origin/main..HEAD -- src/lib/program/__tests__/releaseView.test.ts`
   → **0 righe**; il file passa dentro la suite: `Tests 277 passed (277)`.
7. **Gate** — `npx tsc --noEmit -p tsconfig.app.json` → verde (nessun output) ·
   `npx vitest run` → `Test Files 20 passed (20) · Tests 277 passed (277)` — **baseline misurata
   269 su 19 file, identica a quella attesa dell'11/08** ·
   `npx deno test --allow-all --no-check --no-lock supabase/functions/` → `ok | 494 passed | 0 failed`
   (483 baseline + 11; oggi 13 nel file coachRelease dopo i fix review, suite mirata
   `ok | 13 passed | 0 failed`) · `npx deno check` sull'index nuovo → verde.
8. **Perimetro** — `git diff origin/main..HEAD --stat` = i 14 file del §2, nessun altro.
9. **Ancore rilette a fine fetta** — `.mcp.json:26-32` (blocco github, file non toccato) ·
   `index.ts:237` (commento giallo) · `coachRelease.ts:217` (`scaleOrNull`) · `releaseView.ts:84`
   (dispatch) · `AthleteTraining.tsx:818` (smistamento) — tutte misurate DOPO l'ultimo edit.

## 5. Le prove rosse — viste rosse davvero

**A (mapper che ripete la prima serie — il difetto che v1 costringerebbe a fare):** mutato
temporaneamente il builder perché ogni serie copiasse `sorted[0]`; `npx vitest run` →
`AssertionError: expected [...] to deeply equal [...]` con il diff che NOMINA le serie divergenti:

```
  "key": "w1-s1-e1#2",
- "reps": "6",  - "rest_seconds": 150,  - "rpe": 8.5,
+ "reps": "8",  + "rest_seconds": 90,   + "rpe": 7,
  "key": "w1-s1-e1#3",
- "reps": "AMRAP",  - "rir": 1,  - "rpe": null,
+ "reps": "8",      + "rir": null,  + "rpe": 7,
```

**B (`rpe: 0` forzato come assente):** mutato il builder con `?? 0` → **4 test rossi**, fra cui il
validatore che elenca i path esatti:

```
"days[0].exercises[0].sets[2].rpe: must be null or 1..10 (0 is not a prescription)"
```

Entrambe le mutazioni RIPRISTINATE e la suite ri-verificata verde (277/277) prima del commit.

## 6. Il conteggio `codex` nei cinque posti

Misura sui **file tracciati** (la forma giusta per il contenuto del repo, lezione 2026-08-18):
`git grep -i codex -- .claude .github scripts package.json .husky` → **0 occorrenze, 0 file**.
Controllo positivo: `git grep -lic codex` sull'intero repo trova SOLO `AGENTS.md` (il mandato
stesso). Il grep su filesystem in `.claude/` trova 159 occorrenze, TUTTE dentro
`.claude/worktrees/*` — copie di lavoro non tracciate di vecchi branch (i loro `AGENTS.md`) e
relativi `node_modules`: non sono hook, config né cablaggio. **Premessa vera → la riga DORMIENTE è
scritta in testa ad `AGENTS.md`**, testo esatto del mandato.

## 7. La passata indipendente (4 lenti + 2 refuter per major, 10 agenti)

`supabase-rls-auditor`: nessun rilievo alto; media = pin `config.toml` mancante (v. §8.1); basse
chiuse (500-con-log sul lookup coach) o registrate (roster inline vs RPC `is_coach_of_athlete` —
nota, non difetto). `aura-theme-auditor`: diff CONFORME, zero violazioni nuove; hex/palette
preesistenti censiti fuori diff. `code-test-verifier`: tutti i cancelli verdi. `code-reviewer`:
3 major → **2 confermati dai refuter (2/2 voti) e CHIUSI in `0f61c78`** (sentinel 0 di RPE/%1RM →
null al confine del builder + cella %1RM a min 1; sedute senza esercizi mai consegnate come giorni
«0 esercizi» — escluse da dialogo, atteso server, builder, validatore e parser), **1 confutato**
(il «rec 0s» da mapper IA: l'unico produttore vivo è il motore deterministico, che emette sempre
rest ≥ 30s — invariante testato). Minori chiusi nello stesso commit: cella Rec che restava
visivamente vuota mentendo sullo store; `status='published'` scritto PRIMA del gate (ora: draft
fino a consegna riuscita, published come bookkeeping del fatto).

## 8. Non fatto / divergenze (vince la misura)

1. **`supabase/config.toml` non pinna `[functions.publish-program-block]`** — file fuori dal
   perimetro dichiarato; il default di piattaforma è `verify_jwt = true`, quindi nessun buco, ma la
   convenzione «ogni funzione ri-dichiarata» resta rotta finché una fetta che tocca il file non
   aggiunge la riga.
2. **`coachRelease.ts` = 429 righe** — sopra la convenzione delle 300 (legge 10, non un cancello):
   il perimetro-file della spec era chiuso a UN modulo, lo split avrebbe violato l'acceptance §8.
   Divergenza dichiarata, non nascosta.
3. **Il dettaglio per serie ARRIVA all'anteprima ma non è ancora reso** — `sets_detail` viaggia nel
   route state come da spec (che cita `AthleteTraining.tsx`, non la pagina di anteprima);
   `ExercisePreview.tsx` non è nei MODIFICATI, quindi il rendering per-serie lì è la fetta
   successiva. `restSeconds`/`tut` sono valorizzati SOLO quando un valore unico è vero per ogni
   serie.
4. **La spec dice «come fa il gemello autonomo» sull'audit non-annullante, ma il gemello fa
   l'opposto**: `release-autonomous-program/index.ts:399-404` risponde 500 se l'audit fallisce dopo
   l'insert. Ho seguito la PRESCRIZIONE della spec (logga e prosegui), non la sua descrizione del
   gemello: la divergenza è nella frase della spec, non nel codice.
5. **Etichetta italiana del type `coach_release_gate_stop` nel pannello avvisi** — il coach
   vedrebbe la chiave grezza: la mappa etichette vive in `src/lib/coachAlerts.ts`, fuori perimetro.
   Debito nominato per la prossima fetta coach-UI, insieme a: superset non raggruppati visivamente
   lato atleta · `coach_notes` congelate nel documento ma non ancora rese all'atleta ·
   «RPE target» di seduta (media ereditata v1) parziale sugli esercizi v2 non uniformi ·
   sentinel `UNLINKED_EXERCISE_ID` del mapper IA congelabile nel ledger.
6. **HANDOFF, bullet storica intake-form-fase2**: il riflusso prettier dell'hook ha corrotto la
   riga (spazi mangiati attorno ai code-span col glob `**`, grassetto rotto). Riparata in forma
   prettier-STABILE con un'unica deviazione dal verbatim: i due `src/features/intake/**` diventano
   `src/features/intake/` — imposta dal formatter, provata in scratchpad, dichiarata qui.
7. **Prova e2e di rete della consegna: non scritta di proposito** (spec §7): il registro è
   append-only, ogni run sporcherebbe la produzione in modo irreversibile.

## 9. Resta a Nicolò (nell'ordine)

1. **Aprire la PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/consegna-scheda-coach)
   — la corsia Code non può più (classificatore sulle credenziali, misura del 20/08) — e, coi 2
   check obbligatori verdi, **il merge**.
2. **Deploy della edge function** dalla sua CLI:
   `npx -y supabase functions deploy publish-program-block --project-ref xgxtplqlewpqjzghvbke` —
   senza, il bottone Publish risponde 404 anche a codice mergiato.
3. **Un atleta in `coached`** per il collaudo: oggi l'unico atleta del DB è `autonomous` e nessuna
   schermata scrive `coaching_mode` — l'UPDATE sul profilo è scrittura di produzione, mano sua.
4. **Il collaudo vero** (coach pubblica → atleta guarda), sapendo che scrive una **riga
   indelebile** che supera la radice `engine` esistente di quell'atleta.
5. Facoltativi censiti: pin `config.toml` (§8.1) · etichetta dell'alert (§8.5) · secrets e pannelli
   restano suoi.
