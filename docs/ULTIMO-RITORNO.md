# ULTIMO RITORNO — fetta seduta-attiva (A-03)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/seduta-attiva` · 2026-08-25 · base `origin/main` = `0b0d4f4` (la stessa della misura
> di Cowork) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/seduta-attiva) —
> dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/seduta-attiva`, da `0b0d4f4`, 3 commit di codice + il commit dei documenti (tip del ramo):

- `663e400` — la vista del rilascio porta il riferimento di catalogo accanto all'id locale.
- `419aa92` — la seduta attiva monta gli esercizi del rilascio e registra le serie vere.
- `c55888f` — esiti della passata indipendente: sentinella NIL, doppioni in seduta, input, mezzanotte.

## 2. Manifesto

**NUOVI:** `src/components/athlete/workout/SessionExerciseList.tsx` (la lista esercizi nella
seduta) · `src/lib/program/__tests__/releaseCatalogRef.test.ts` (6 test sul doppio id) ·
`src/pages/athlete/__tests__/ActiveWorkout.boundary.test.ts` (11 test, seam sotto la mutation).

**MODIFICATI:** `src/lib/program/releaseView.ts` (campo obbligatorio `catalog_exercise_id`,
helper `catalogRef` che tratta la sentinella NIL come assenza, docblock onesto su `id`) ·
`src/pages/athlete/ActiveWorkout.tsx` (query rilascio + selettore condiviso + lista + drawer +
stati espliciti; data inchiodata al mount) · `src/components/athlete/drawers/StandardSetDrawer.tsx`
(prop `exerciseId`→`catalogExerciseId` col contratto nel docblock; entrambi i campi obbligatori E
validi per la riga) · `src/hooks/athlete/useAthleteWorkoutHooks.ts` (**divergenza di perimetro,
v. §8.1**) · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file.

**NEL PERIMETRO MA NON TOCCATI:** `src/pages/athlete/PostWorkoutDebrief.tsx` (vietato — zero diff,
legge già le righe vere) · `supabase/**` · `src/integrations/supabase/types.ts` ·
`src/lib/math/acwr.ts` · `src/lib/effort/sessionRpe.ts` · le bandiere del rischio.

## 3. Le due prove dei permessi (repo di scarto, prima riga di lavoro)

1. Vicini consentiti: `git status -sb` → `## master` · `git log --oneline -1` → `79b2fc7 base`. Passano.
2. Distruttivi: `git reset --hard HEAD` → **rifiutato** (classificatore auto-mode) · `cd <scarto> && git rebase HEAD`
   → **rifiutato** (regola di permesso). ⚠️ **Reperto nuovo**: la variante `git -C <path> rebase` **scavalca il
   matcher locale** (eseguita senza blocco) — il flag `-C` sfugge al pattern. Cintura, non cancello (il ruleset
   server resta il vero cancello); chip aperta per estendere le deny alle forme `-C`/`--git-dir`.

## 4. IL VIAGGIO DI UNA SERIE — dal documento allo schermo alla riga di `exercise_logs`

1. **Il documento** (`program_releases.program_document`, `schema_version 2`) porta per ogni esercizio
   DUE id: `item_id` (`"w1-s1-e1"`, locale al builder, ⛔ non risolve in `exercises`) ed
   `exercise_id` (uuid di catalogo, ✅ l'unico che la FK accetta).
2. **Una sola lettura**: `useProgramRelease.ts:54` → `parseReleaseDocument`. Il parser tiene ENTRAMBI
   con nomi che non si confondono: `id` ← `item_id` (chiavi di render) e `catalog_exercise_id` ←
   `exercise_id` (`releaseView.ts:127` per v1, `:257` per v2). Assente, malformato **o sentinella NIL
   `00000000-…`** (esercizio IA mai collegato, `aiProgramMapper.ts:18` — sopravvive ai validatori del
   rilascio ma non risolve in `exercises`) → `null` via `catalogRef` (`releaseView.ts:97`):
   l'esercizio resta in scheda, mai ripiego sull'id locale.
3. **Una sola porta per «oggi»**: `ActiveWorkout.tsx:330` → `sessionForDate(program, sessionDate)` —
   la stessa di home, Training Hub e debrief; l'orologio è del chiamante e la data è **inchiodata al
   mount** (`:327`): la seduta appartiene al giorno in cui è cominciata, mezzanotte non scambia la
   scheda sotto un drawer aperto.
4. **La lista**: `SessionExerciseList` rende ogni esercizio; solo chi ha `catalog_exercise_id !== null`
   è un bottone (`SessionExerciseList.tsx:55`); il conteggio «N/M serie» è indicizzato per id di
   **catalogo** dalle righe di `useSessionSetsQuery` (`ActiveWorkout.tsx:341`), col prescritto
   aggregato per giornata quando lo stesso esercizio occupa più slot (`SessionExerciseList.tsx:152`,
   v. §8.6).
5. **Il tap** salva il solo id **locale** per la selezione (`ActiveWorkout.tsx:478`), l'esercizio si
   ri-deriva a ogni render (`:354`) e il drawer monta con l'id di **catalogo** (`:355` → `:528`,
   `catalogExerciseId={openCatalogId}`) più nome vero e prescrizione della serie corrente
   (`:360` → `formatReleaseSetLine`).
6. **La conferma**: `StandardSetDrawer.tsx:123` → `exercise_id: catalogExerciseId` dentro
   `useLogSetMutation` → payload a `useAthleteWorkoutHooks.ts:109` → INSERT su `exercise_logs`
   (`:116`). **Nella INSERT viaggia SOLO l'id di catalogo**; `set_number` = righe vere di
   quell'esercizio + 1; `weight`/`reps` = ciò che l'atleta ha digitato (validato: peso ≥ 0,
   reps intero ≥ 0 — la riga non sfida i CHECK di Postgres).
7. **Il ritorno**: onSuccess invalida `session-sets` → la lista e il debrief rileggono le righe.
   Il debrief non è cambiato di una riga: mostra QUEL volume e QUELLE serie perché ora esistono.

## 5. COSA SUCCEDE QUANDO VA STORTO

- **Riferimento di catalogo mancante O sentinella NIL**: l'esercizio si VEDE in scheda (nome,
  scheme) con la riga «Solo consultazione: manca il riferimento di catalogo, le serie non si
  possono registrare.» — nessun bottone, nessuna INSERT possibile, mai nascosto (test §6.5, due casi).
- **Vincolo di unicità violato (23505)**: il tentativo parte, il DB lo rifiuta, e l'interfaccia lo
  dice — toast «Serie già registrata» con descrizione italiana (`useAthleteWorkoutHooks.ts:134`),
  MAI il generico «Salvataggio serie fallito», e il conteggio si risincronizza (invalidate della
  stessa chiave). Gli input NON si svuotano: niente finto successo (test §6.3).
- **INSERT fallita per altra causa**: toast «Salvataggio serie fallito» con il messaggio d'errore;
  input intatti, conteggio fermo alle righe vere (test §6.3, secondo caso).
- **Valori che la riga non accetta** (peso negativo, reps decimali): il bottone resta disabilitato —
  il rifiuto avviene PRIMA che parli il CHECK di Postgres in inglese (test §6.4).
- **Sessione mai avviata**: invariato dalla fetta allenamento-che-si-salva — card «Sessione non
  avviata» con retry; senza `activeSessionId` il bottone del drawer resta disabilitato.

## 6. ACCEPTANCE — comando e output

1. 🔴 **Prova rossa sull'id** — v. §7: il rosso nomina i due id e quale il DB accetta.
2. **Due stati, due schermate** — `npx vitest run src/pages/athlete/__tests__/ActiveWorkout.boundary.test.ts`:
   «senza righe 0/3; con righe nel database il conteggio sale SENZA alcun tocco» — 0/3 poi 2/3 dalle
   righe seminate nel finto DB, zero interazioni UI. Verde (controllo positivo nello stesso test).
3. **Doppio tocco / vincolo** — stesso file, «INSERT rifiutata con 23505 → “Serie già registrata”,
   niente finto successo» + il controllo che un 23503 resta «Salvataggio serie fallito». Verdi.
4. **Campi vuoti** — «apertura: input vuoti, bottone disabilitato; un solo campo non basta» +
   «valori che la riga non accetta restano fuori» (reps 8.5 e peso −5 non partono; lo 0 digitato sì). Verdi.
5. **Senza catalogo: si vede, non si registra** — «si vede in scheda, dichiara il motivo, e non
   offre il registratore» + il caso sentinella NIL. Verdi.
6. **Un selettore solo** — `git grep -n "export function sessionForDate" -- src` → **1** definizione;
   `git grep -n "sessionForDate(" -- src ':!src/**/__tests__/**' ':!src/lib/program/releaseView.ts'`
   → **4 chiamanti** (`ActiveWorkout.tsx:330` · `AthleteDashboard.tsx:388` · `AthleteTraining.tsx:815`
   · `PostWorkoutDebrief.tsx:321`); `git grep -n "parseReleaseDocument(" -- src ':!**/__tests__/**'
':!**/releaseView.ts'` → **1** lettura (`useProgramRelease.ts:54`). ⚠️ Il prompt diceva «i
   chiamanti diventano tre»: erano GIÀ tre su main — con la seduta attiva diventano **quattro**.
   Vince la misura (§8.2).
7. **Gate (CINQUE)** — baseline su tree pulito a `0b0d4f4`: tsc 0 · vitest **407/38** (= attesa spec) ·
   eslint **81** · build 0 · verify:css 20/20. Sul ramo: `npx tsc --noEmit -p tsconfig.app.json` →
   exit 0 · `npx vitest run` → exit 0, **424/424 su 40 file** (+17 test, +2 file) · `npx eslint .`
   → **81 errori = ratchet, non sopra** · `npm run build` → exit 0 · `npm run verify:css` → exit 0
   (20/20 classi, 18 variabili, 11 chart-*). Il boundary-test è stato riprovato **3 volte
   consecutive** (exit 0/0/0) dopo la cura di un flake di timing (v. RETRO).
8. **Perimetro** — `git diff origin/main..HEAD --stat` tocca SOLO i file del manifesto §2
   (rieseguito dopo il commit dei documenti, incollato in coda alla PR).

## 7. LA PROVA ROSSA — rosso incollato e verde dopo il ripristino

Mutazione: il montaggio del drawer cablato su `catalogExerciseId={openExercise.id}` (l'id locale —
esattamente il difetto che la spec temeva). Backup per copia, MAI `git checkout --`.

```
FAIL  src/pages/athlete/__tests__/ActiveWorkout.boundary.test.ts
  > la serie confermata scrive il riferimento di catalogo, mai l'id locale del builder
AssertionError: exercise_id nella INSERT deve essere il riferimento di catalogo
"ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f" (FK exercise_logs.exercise_id → exercises.id:
è l'unico id che il database accetta); l'id locale del builder "w1-s1-e1" non risolve
in exercises e la FK rifiuterebbe ogni riga: expected 'w1-s1-e1' to be
'ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f'
Expected: "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f"
Received: "w1-s1-e1"
Tests  1 failed | 7 passed (8)
```

Ripristino per copia + `cmp` → `CMP_BYTE_IDENTICO` → rerun verde (all'epoca 8/8; a fine fetta la
suite del file è 11/11, tre run consecutivi exit 0).

## 8. NON FATTO / DIVERGENZE (+ esiti della passata indipendente)

**Passata indipendente (agenti di progetto): reviewer 2 major + 3 minor → 2 major e 2 minor CHIUSI
in-branch (`c55888f`), 1 minor dichiarato qui; aura-theme-auditor: zero violazioni nuove;
code-test-verifier: «verde netto, zero anomalie».**

1. **`useAthleteWorkoutHooks.ts` modificato fuori manifesto** (`:128-146`): il criterio «se il
   vincolo scatta l'interfaccia lo dice» ha una casa sola — il toast d'errore della INSERT vive lì
   da prima della fetta. Gestire il 23505 altrove avrebbe duplicato il canale (due toast) o lasciato
   il messaggio grezzo di Postgres. Diff minimo: special-case 23505 + invalidate.
2. **Chiamanti del selettore: quattro, non tre** — `PostWorkoutDebrief.tsx:321` chiamava
   `sessionForDate` già su main (fetta home-atleta). Nessun codice duplicato, la porta resta una.
3. **`tracking_fields` NON entra** (⚠️ voce chiesta dal mandato): `exercises.tracking_fields`
   dichiara anche `rpe`, `duration`, `distance`, ma `exercise_logs` accoglie **solo `weight` e
   `reps`** — le altre metriche non hanno una colonna e scriverle dentro `reps`/`weight` sarebbe un
   errore di scala. Rinvio datato 2026-08-25 alla fetta-schema; qui si registra ciò che la tabella
   accoglie.
4. **Gating a DUE campi validi nel drawer**: la versione orfana accettava un campo solo («BW × N»).
   L'acceptance della fetta esige entrambi; il bodyweight resta esprimibile digitando `0` nel peso;
   dal rilievo minor del reviewer, i valori devono anche essere accettabili per la riga (peso ≥ 0,
   reps intero ≥ 0). Il drawer non aveva chiamanti: nessuna retrocompatibilità rotta.
5. **Tema**: `SessionExerciseList` eredita il vocabolario del file ospite (`text-on-surface`,
   `border-[#c0c7d0]/30`) — debito-tema athlete GIÀ dichiarato (RETRO 2026-08-22): l'auditor
   conferma zero violazioni nuove; nota preesistente sui token var-based senza `<alpha-value>`
   (l'alpha di `/60` è ignorato silenziosamente — pattern diffuso, da fetta-tema).
6. **Stesso esercizio in più slot della seduta** (major 2 del reviewer, chiuso per la parte
   possibile): `exercise_logs` non porta il riferimento allo slot, quindi l'attribuzione per-slot è
   IMPOSSIBILE senza schema. In-branch: ogni slot mostra il **totale di giornata** («X/Y» con Y =
   somma dei prescritti di quell'esercizio, `SessionExerciseList.tsx:141-153`) — vero per
   costruzione, mai un completamento per-slot inventato; la prescrizione per-serie nel drawer oltre
   l'indice ricade sullo scheme. La disambiguazione vera (riga che porta l'item) è fetta-schema —
   stessa coda del punto 3.
7. **`sessionSets.isError` non ha una superficie nel drawer** (minor 3 del reviewer, dichiarato e
   NON riparato): oggi non è un difetto vivo — la sessione nasce al mount, zero righe è la verità —
   e il caso peggiore (conteggio stantio → set_number duplicato) muore sul 23505 gestito. Superficie
   d'errore dedicata = fetta-stati, non questa.
8. **`workout_id` resta NULL** sulla sessione (`useStartSessionMutation` invariato): collegare la
   sessione alla `workouts` prescritta è fuori perimetro (la seduta legge il documento, non la
   scheda — decisione A-01/C-01).

## 9. RESTA A NICOLÒ

1. **Merge della PR** ([crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/seduta-attiva))
   coi 2 check obbligatori verdi. **POST-MERGE: NULLA** (publish FE del flusso normale — zero
   migration, zero edge, zero deploy).
2. **L'ultimo miglio, con le mani**: da account atleta, aprire la seduta di oggi → vedere i PROPRI
   esercizi (non «Esercizi non collegati») → registrare una serie con peso e ripetizioni → il
   conteggio sale a 1/N → «Termina» → il debrief mostra QUEL volume e QUELLE serie, non «0 kg ·
   0 serie». Poi Cowork: `select exercise_id, set_number, weight, reps from exercise_logs order by
logged_at desc limit 3` — l'`exercise_id` deve essere un uuid di catalogo che risolve in
   `exercises`.
3. **Il doppio tocco dal vivo** (facoltativo): due conferme rapidissime della stessa serie →
   la seconda deve dire «Serie già registrata», mai creare due righe.
