# ULTIMO RITORNO — fetta rpe-sessione (B-22)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/rpe-sessione` · 2026-08-25 · base `origin/main` = `bac852f` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/rpe-sessione) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/rpe-sessione`, da `bac852f`, 3 commit di codice + il commit dei documenti (tip del ramo):
`b0571eb` (modulo unico `src/lib/effort/sessionRpe.ts` + 5 test: la scala di Foster coi vuoti) ·
`31f8e0d` (il debrief scrive `srpe`, smette di scrivere `rpe_global`, parla la scala di sessione;
boundary test col seam SOTTO l'hook, 7 test) · `6f42dfd` (i quattro lettori passano a `srpe`,
l'assenza è «—»; test su due superfici coach, 4 test).

## 2. Manifesto

**NUOVI:** `src/lib/effort/sessionRpe.ts` · `src/lib/effort/__tests__/sessionRpe.test.ts` ·
`src/pages/athlete/__tests__/PostWorkoutDebrief.boundary.test.ts` ·
`src/components/coach/__tests__/ReviewWorkoutItem.render.test.ts`.

**MODIFICATI (dichiarati dal prompt):** `PostWorkoutDebrief.tsx` · `useAthleteWorkoutHooks.ts` ·
`useAthleteAnalytics.ts` · `AthleteContextPane.tsx` · `useCoachDashboardMetrics.ts` ·
`AthleteViewerDialog.tsx` · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file.

**MODIFICATI (fatti cadere dalla misura, motivi in §8):**
`src/components/coach/analytics/VolumeIntensityChart.tsx` (consumatore di `avgRpe`, ora
nullable: media sui soli punti dichiarati, «—» senza dichiarazioni) ·
`src/pages/coach/CoachHome.tsx` (1 riga: il feed rinomina `rpeGlobal` → `sessionRpe`) ·
`src/components/coach/messages/__tests__/AthleteContextPane.render.test.ts` (esteso con i due
stati del badge RPE).

**NEL PERIMETRO MA NON TOCCATI:** `supabase/**` · `types.ts` · **`src/lib/math/acwr.ts`**
(di C-09: legge già `srpe`, intonso — `git diff` lo conferma) · `pain_reported`/`low_recovery` ·
`computeCheckinScore` · `useOfflineSync.ts` (modulo scollegato: importato da NESSUN file, il suo
passaggio `srpe` inerte resta com'è) · `package.json` (audit-gate non dovuto).

## 3. Le due prove dei permessi (repo di scarto in scratchpad)

- `git reset --hard HEAD` → **RIFIUTATO** («Permission to use Bash with command … has been denied») · `git rebase HEAD~1` → **RIFIUTATO**.
- Vicini passati: `git status -sb` → `## master` · `git log --oneline -1` → `cbfde72 commit di prova`.

## 4. DOVE FINISCE IL NUMERO — dal tocco alla colonna

1. **Il tocco.** La pill è un toggle: `PostWorkoutDebrief.tsx:146` `onChange(value === n ? null : n)` — secondo tocco = revoca (fetta rpe-si-puo-togliere, preservata).
2. **Lo stato.** `PostWorkoutDebrief.tsx:196` `useState<SessionRpe | null>(null)` — parte VUOTO, nessuna preselezione (CORE §0.8).
3. **Il payload del salvataggio.** `PostWorkoutDebrief.tsx:230` `srpe: rpe` dentro `finishSession.mutate({…})` — `rpe_global` non compare più nel payload.
4. **La UPDATE.** `useAthleteWorkoutHooks.ts:163` `srpe: input.srpe ?? null` nel literal `TablesUpdate<"workout_logs">`, eseguita a `:169` `.update(update).eq("id", session_id)` — la stessa UPDATE che già girava, con la colonna giusta al posto di quella sbagliata.
5. **La colonna.** `workout_logs.srpe` (`smallint CHECK 1..10`) — il nome e il CHECK descrivono ciò che contiene: la CR-10 di sessione.

Le parole sopra la scala vengono TUTTE da `src/lib/effort/sessionRpe.ts`: titolo e domanda
(`:52-53`), definizione «valutazione globale, non la media delle serie» (`:56-57`), avvertenza
sulla finestra di normalizzazione (`:60-61`), ancore coi vuoti (`:36-48`). Sui gradini 6, 8 e 9 la
didascalia è **il numero nudo** (`PostWorkoutDebrief.tsx:171-174`): i vuoti sono il progetto
della scala category-ratio, non una lacuna.

## 5. CHI LEGGEVA `rpe_global` E COSA LEGGE ADESSO

| superficie                                                  | prima                                                | adesso                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `useAthleteAnalytics.ts:245`                                | `rpe_global ?? 7` — **un 7 fabbricato**              | media per-serie, altrimenti `srpe`, altrimenti **null** (il grafico salta il punto e l'header media i soli dichiarati, «—» se nessuno) |
| `AthleteContextPane.tsx:387-401`                            | giudizio su `rpe_global > 8`, badge nascosto se null | badge sempre leggibile da `srpe`: «RPE —» senza dichiarazione, evidenza >8 solo col valore                                             |
| `useCoachDashboardMetrics.ts:258-275`                       | allerta `rpe_spike` su `rpe_global > 9`              | `srpe > 9`; senza valore nessuna allerta (l'assenza non diventa un numero)                                                             |
| `useCoachDashboardMetrics.ts:393` + `CoachHome.tsx:695`     | il feed portava `rpeGlobal`                          | campo `sessionRpe` da `srpe`; la pill di CoachHome non rende nulla su null (già così)                                                  |
| `AthleteViewerDialog.tsx`                                   | doppio badge «RPE {rpe_global}» + «sRPE {srpe}»      | UN badge «RPE sessione {srpe}», «RPE sessione —» se nullo                                                                              |
| `PostWorkoutDebrief` + `useAthleteWorkoutHooks` (scrittori) | scrivevano `rpe_global`                              | scrivono `srpe`; `rpe_global` esce da payload e select                                                                                 |

`rpe_global` in `src/` di produzione sopravvive SOLO nei commenti che documentano il cambio
(grep in §6.4) — più il modulo scollegato `useOfflineSync.ts` e le fixture dei test acwr (che
provano proprio che `rpe_global` NON muove il carico).

## 6. Acceptance — comando e output

1. 🔴 **Prova rossa sul cablaggio** → §7.A: tocco 8 → UPDATE con `srpe = 8` e `rpe_global` assente dal payload; il rosso nomina le due colonne e i due valori.
2. 🔴 **Non risposto resta NULL** → boundary test «scala non toccata → srpe = NULL» verde, controllo positivo nello stesso file (tocco → valore; secondo tocco → di nuovo NULL). Prova rossa in §7.B.
3. **Ancore di sessione, vuoti vuoti:** `sessionRpe.test.ts` («i vuoti a 6, 8 e 9 NON portano parola» · «nessuna stringa della scala contiene "rep"») + al FORM vero (`PostWorkoutDebrief.boundary.test.ts`: per OGNI valore selezionato il testo della sezione non matcha `/rep/i`; su 6/8/9 la didascalia è il numero nudo). Run: 402/402 verdi.
4. **Nessuno sforzo inventato:** `grep -rnE "(rpe|srpe|Rpe)[a-zA-Z_.]*\s*\?\?\s*[0-9]" src --include="*.ts" --include="*.tsx" | grep -v __tests__` → 3 righe: un COMMENTO che documenta il vecchio `?? 7` e **due prescrizioni del builder coach** (`ExerciseLibraryDrawer.tsx:29` `default_rpe ?? 8`, `useProgramBuilderStore.ts:314` `rpe_target ?? 8`) — semi di TARGET prescritti, non letture di sforzo dichiarato: fuori dal criterio, dichiarate qui.
5. **Una scala sola a valle:** `ReviewWorkoutItem.render.test.ts` (nullo → «RPE sessione —», 8 → «RPE sessione 8», doppio badge morto) + `AthleteContextPane.render.test.ts` (nullo → «RPE —», 9 → «RPE 9»). Due superfici coach, entrambe verdi.
6. **I CINQUE gate sul tip:** `npx tsc --noEmit -p tsconfig.app.json` → exit 0 · `npx vitest run` → **402 passed (402) su 38 file** exit 0 (baseline misurata su `bac852f` nel worktree pulito: **386/35 esatta**; +16: 5 modulo, 7 confine, 3 review-item, 1 pane) · `npx eslint .` → **81 errori** (= baseline, non sopra) · `npm run build` → exit 0 · `npm run verify:css` → «✓ 20/20 classi attese in uso e verificate …» exit 0. Ri-verificati da `code-test-verifier` in contesto proprio.
7. **Perimetro:** `git diff origin/main..HEAD --stat` → 13 file di codice (+ i 3 docs nel commit finale), tutti nel §2.

## 7. Le due prove rosse (sul tip, ripristino per copia + `cmp` byte-identico)

**A — cablaggio** (riscrittura `rpe_global: input.srpe ?? null` reintrodotta nel literal della UPDATE, `useAthleteWorkoutHooks.ts:164`):

```
FAIL … l'atleta sceglie 8 → la UPDATE porta srpe = 8 e rpe_global NON viene scritta
AssertionError: colonne di sforzo nel payload UPDATE: expected { srpe: 8, rpe_global: 8 }
to deeply equal { srpe: 8, rpe_global: undefined }
-   "rpe_global": undefined,    +   "rpe_global": 8,
```

Il seam è il CLIENT, sotto l'hook: la mutation gira per davvero, quindi il rosso scatta anche se
la colonna sbagliata rientra un gradino sotto il componente. Ripristino: `cp` + `cmp` →
`CMP_IDENTICO`, suite verde.

**B — preselezione** (`useState<SessionRpe | null>(7)` reintrodotto nel debrief):

```
FAIL … scala non toccata → srpe = NULL
AssertionError: non risposto resta NULL: expected 7 to be null
FAIL … selezionare e RIMUOVERE (secondo tocco) torna a NULL
AssertionError: dichiarazione revocata: expected 7 to be null
```

Ripristino: `cp` + `cmp` → `CMP_IDENTICO`, suite completa exit 0 (402/402).

## 8. Non fatto / divergenze (file:riga)

1. **`VolumeIntensityChart.tsx`** — fuori dal manifesto del prompt, trascinato dalla misura: consuma `avgRpe`, che senza il 7 fabbricato diventa nullable → media sui soli punti dichiarati, «—» quando nessuno dichiara, tooltip null-safe. Senza questo tocco il grafico avrebbe sommato null.
2. **`CoachHome.tsx:695`** — 1 riga: il feed della dashboard consuma il campo rinominato (`rpeGlobal` → `sessionRpe`). La sua `rpePill` già rende nulla su null.
3. **`ReviewWorkoutItem` ora è un named export** (`AthleteViewerDialog.tsx`): serviva a testare la superficie senza montare l'intero dialog. Solo visibilità, zero comportamento.
4. **I vuoti a 6/8/9 NON riempiti** — nessuna divergenza da segnalare: le ancore ratificate bastano; la didascalia mostra il numero nudo e il test lo inchioda. (Se in collaudo il numero nudo sembrasse povero, la risposta è di Nicolò, non una parola inventata.)
5. **Prescrizioni con default** (`ExerciseLibraryDrawer.tsx:29` `default_rpe ?? 8`, `useProgramBuilderStore.ts:314` `rpe_target ?? 8`): TARGET del builder coach, non letture di sforzo dichiarato — fuori dal criterio 4, dichiarate e non toccate.
6. **`useOfflineSync.ts`** — importato da nessun file (modulo scollegato, PWA rimossa): il suo payload `srpe` inerte resta lì; la pulizia è della fetta-moduli-WIP, non di questa.
7. **La riga storica** con due anni di valori di sessione in `rpe_global` resta al suo posto: le superfici ora leggono `srpe`, quindi per le sedute vecchie mostrano «—». Se e come migrare quei valori (`UPDATE … SET srpe = rpe_global WHERE …`) è una decisione di schema/dati di Nicolò e Cowork — vietata qui (nessuna migrazione, nessuna scrittura di massa).
8. **`duration_minutes`/`total_load_au`** — fuori fetta, restano datate (spec §1.6): NON alimentate, sarebbero una seconda casa per il carico che C-09 ha appena unificato.
9. **Il momento della domanda** — si chiede subito (ratifica Nicolò 24/08); la divergenza dal protocollo della letteratura (30 min) e del corso (5-10 min) è dichiarata NEL MODULO (`sessionRpe.ts`, commento di testa): l'sRPE raccolto è confrontabile con sé stesso nel tempo, non con le soglie della letteratura — un motivo in più perché il rapporto acuto:cronico resti una lente.
10. **La Lezione 8 del corso** (`repos/nc-education`) resta disallineata dalla scala della sua stessa fonte («6 Moderato», «8-9 Alto» dove Foster mette i vuoti): repo diverso, resta a Nicolò (ratifica: il prodotto segue Foster).
11. **La traduzione italiana delle ancore è dichiarata come proposta**: se Nicolò detta altre parole, si cambiano NEL MODULO e vivono ovunque insieme.
12. 🔴 **DEBITO LATO SERVER, trovato dalla passata indipendente e NON riparabile qui (`supabase/**` vietato): il trigger watchdog smette di escalare.** `supabase/migrations/20260213073401_….sql:81-86` scrive `coach_alerts` (`risk_alert`) su `NEW.rpe_global >= 9` — e da questa fetta nessuno scrive più `rpe_global`, quindi quella regola non scatterà MAI più; la sua regola gemella su `NEW.srpe > 800` (`:90`) è **irraggiungibile** col CHECK `srpe 1..10` (fu scritta pensando al CARICO srpe×durata, non alla scala). Netto: **zero `risk_alert` da allenamento** finché il trigger non viene riallineato a `srpe >= 9` con una migration di corsia Cowork. È il canale di escalation CORE §0 reso leggibile da `CoachAlertsPanel`: un canale che si spegne in silenzio è esattamente il fallimento che questa fetta combatte — per questo sta scritto qui in rosso, primo punto di §9.
13. **Stesso debito, due edge function:** `supabase/functions/analyze-athlete-week/index.ts:165` e `generate-batch-checkins/index.ts:190` mediano ancora `rpe_global` → d'ora in poi «N/D»/«N/A» stabile (nessun NaN: i filtri reggono). Entrambe le query **già selezionano `srpe`**: il fix è una parola per file, corsia `supabase/functions/**` (fuori da questa fetta FE).

## 9. Resta a Nicolò

- 🔴 **PRIMA COSA, con Cowork (corsia `supabase/**`, vietata a questa fetta):** riallineare a `srpe` i tre inseguitori lato server di §8.12-13 — il trigger watchdog (`rpe_global >= 9` → `srpe >= 9`, e decidere la sorte della regola morta `srpe > 800`) e le due edge (`analyze-athlete-week:165`, `generate-batch-checkins:190`, una parola ciascuna). Senza il trigger, il canale `risk_alert` da allenamento resta muto.
- **Merge della PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/rpe-sessione).
- **L'ultimo miglio dal debrief:** chiudere una seduta vera → la domanda di sessione con le ancore di Foster (3 = Moderato, vuoto a 6/8/9), la definizione e l'avvertenza sul momento; scegliere un valore → sulla scheda coach (Feedback Coach) compare «RPE sessione N», nel pane della chat «RPE N»; non scegliere → «—» e la colonna resta NULL. E da C-09: appena le sedute con `srpe` copriranno la finestra, la lente del carico comincerà a riempirsi da sola.
- **La riga storica in `rpe_global`** (§8.7): decidere con Cowork se migrare i valori vecchi in `srpe` o lasciarli alla storia.
- **La Lezione 8 del corso** da riallineare a Foster (§8.10), e l'eventuale veto sulle parole italiane (§8.11).
