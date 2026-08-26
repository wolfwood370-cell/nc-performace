# ULTIMO RITORNO — fetta aggiornamento-sicuro (A-03, continua)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/aggiornamento-sicuro` · 2026-08-26 · base `origin/main` = `08db1fc` (la stessa della
> misura di Cowork) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/aggiornamento-sicuro)
> — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/aggiornamento-sicuro`, da `08db1fc`, 4 commit di codice + il commit dei documenti (tip del ramo):

- `cb15f38` — il buster della cache persistita porta l'identità del build (la **cintura**).
- `a2af1ba` — la derivazione del rilascio esce dalla queryFn ed entra in `select` (il **cancello**).
- `11c5456` — un predicato solo per «registrabile»: undefined è assente come null (l'**onestà**).
- `84f9ff4` — esiti della passata indipendente: `?? null` sulla queryFn, pin del gate che degrada chiuso.

## 2. Manifesto

**NUOVI:** `src/lib/program/loggableExercise.ts` (la casa del predicato) ·
`src/lib/program/__tests__/loggableExercise.test.ts` (6 test) ·
`src/hooks/athlete/__tests__/useProgramRelease.select.test.ts` (5 test: cache grezza,
referenza stabile, degrado della cache di ieri — rilascio aperto-ma-onesto, gate chiuso) ·
`src/pages/athlete/__tests__/ActiveWorkout.updateCache.boundary.test.ts` (3 test: LA prova
dell'aggiornamento + parità undefined/null in superficie + controllo positivo).

**MODIFICATI:** `vite.config.ts` (define `__BUILD_ID__`) · `src/main.tsx` (`buster: __BUILD_ID__`) ·
`src/vite-env.d.ts` (**divergenza dichiarata, v. §9.3**: la declare TS del global) ·
`src/hooks/athlete/useProgramRelease.ts` (queryFn grezze + 2 select module-level) ·
`src/components/athlete/workout/SessionExerciseList.tsx` (4 punti → predicato) ·
`src/pages/athlete/ActiveWorkout.tsx` (1 punto → predicato + cintura sul valore) ·
`docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file.

**NEL PERIMETRO MA NON TOCCATI:** `src/lib/queryPersister.ts` (vietato — zero diff: il persister fa
il suo lavoro) · `supabase/**` · `src/integrations/supabase/types.ts` · `src/lib/math/acwr.ts` ·
`src/lib/effort/sessionRpe.ts` · `src/pages/athlete/PostWorkoutDebrief.tsx` · le **31 query derivate
restanti** (elencate una per una in §9.2 — rinvio datato di questa fetta).

## 3. Le tre prove dei permessi (repo di scarto, prima riga di lavoro)

1. Vicini consentiti: `git status -s` (clean, output vuoto) · `git log --oneline -1` → `62f0604
commit di prova`. **Passano.**
2. `git reset --hard HEAD` → **rifiutato** («Permission … has been denied», matcher locale).
3. `git rebase HEAD` → **rifiutato** (matcher locale). E la forma `git -C <percorso> rebase HEAD`
   — il **buco del matcher misurato il 25/08** — oggi viene **bloccata dal classificatore auto-mode**
   («Blocked by classifier»): non più un varco aperto, ma resta cintura-via-classificatore, non
   matcher: la chip del 25/08 per estendere le deny alle forme `-C`/`--git-dir` resta valida.

## 4. Da dove viene il buster

- **Fonte scelta: l'orologio di build.** `vite.config.ts` genera `ncph-${Date.now().toString(36)}`
  DENTRO la factory di `defineConfig` (eseguita una volta per `vite build` / avvio dev server) e lo
  inietta via `define` come `__BUILD_ID__` (`vite.config.ts:31`); `src/vite-env.d.ts:5` dichiara il
  global per tsc; `src/main.tsx:41` lo usa come `buster`.
- **Perché non l'hash git:** il criterio di acceptance è «due build consecutivi, due valori» — due
  build dello stesso commit avrebbero lo stesso hash. Perché non un uuid: il timestamp è anche
  diagnostica (decodificabile all'epoca del build). **Il vincolo «nessuna data dall'orologio» vale
  per i moduli puri dell'app, non per il tooling di build**: l'app legge solo il literal iniettato.
- **La prova, due build consecutivi** (`npm run build ; grep -roh "ncph-[0-9a-z]*" dist/assets/ | sort -u`):

  ```
  BUILD1 EXIT=0 → ncph-mta18tly
  BUILD2 EXIT=0 → ncph-mta194jw
  ESITO: DIVERSI — il buster cambia da sé
  ```

- **Costo dichiarato** (spec §1.7): al primo avvio dopo ogni deploy la cache offline viene scartata
  e le query si rifanno — chi riceve il bundle nuovo è online per definizione. Vercel non c'entra:
  nessuna configurazione da toccare, la fonte vive tutta nel repo.

## 5. Il viaggio del documento — dal database alla cache al componente

1. **Postgres** → la queryFn restituisce SOLO la riga `program_releases` come arriva
   (`useProgramRelease.ts:53-66`, `select("*")` invariato — nessuna query nuova); per il gate,
   `{profile, consents}` grezzi (`useProgramRelease.ts:92-118`).
2. **Cache TanStack → IndexedDB**: il persister (INTATTO, `queryPersister.ts:12`, chiave
   `rq-offline-cache`) deidrata `state.data` = la riga grezza. **Cosa finisce in IndexedDB adesso,
   misurato dal test col client mockato**: chiavi di primo livello `["athlete_id","id",
"program_document"]` — la riga, **non** `program` né `release` (in produzione la riga porta
   tutte le colonne della tabella: l'invariante è «niente che il nostro codice abbia derivato»).
   Per il gate: `["consents","profile"]`, nessun campo derivato (`pendingReview`/`coachingMode`
   assenti dalla cache).
3. **Lettura** → `select` con referenza stabile MODULE-LEVEL: `selectLatestRelease`
   (`useProgramRelease.ts:44`) chiama `parseReleaseDocument` col codice CORRENTE;
   `selectGateStatus` (`useProgramRelease.ts:83`) chiama `deriveGateStatus`. Misurato nel test:
   **1 esecuzione del parser, e resta 1 dopo 10 re-render** (`ActiveWorkout` ri-renderizza ogni
   secondo per il timer; un select inline farebbe 12 esecuzioni su 10 re-render — spec §1.6).
4. **Componenti**: ricevono lo stesso derivato di prima (`{release, program}` /
   `AthleteGateStatus`) — i 4 consumatori (`AthleteDashboard:386` · `ActiveWorkout:329` ·
   `AthleteTraining:810` · `PostWorkoutDebrief:319`) leggono solo `.data?.program` o la truthiness
   di `.data`: **zero modifiche**, misurato con grep prima di toccare.
5. **La cache di ieri** (wrapper `{release, program}` pre-merge) attraversa `select` e degrada:
   `program: null` → la pagina dice «Programma non disponibile» (test dedicato) — mai una lista
   che promette.

## 6. Il predicato

**Casa:** `src/lib/program/loggableExercise.ts:27` — `isLoggableExercise(exercise)`, `undefined`
assente esattamente come `null`. Boolean semplice DI PROPOSITO, non type guard: con `strict: false`
(niente strictNullChecks) `string | null` collassa in `string`, un guard `T & {p: string}` è
identico a `T` e il ramo falso narrowa a `never` (misurato: `Property 'sets' does not exist on
type 'never'`). La sentinella NIL resta responsabilità del parser (`catalogRef`): una porta per
regola. **I cinque chiamanti:**

| #   | punto                         | prima                            | ora                                |
| --- | ----------------------------- | -------------------------------- | ---------------------------------- |
| 1   | `SessionExerciseList.tsx:59`  | `!== null` (riga cliccabile)     | `isLoggableExercise(exercise)`     |
| 2   | `SessionExerciseList.tsx:155` | `!== null` (accumulo prescritte) | `isLoggableExercise(exercise)`     |
| 3   | `SessionExerciseList.tsx:177` | `!== null` (conteggio fatte)     | `isLoggableExercise(exercise)`     |
| 4   | `SessionExerciseList.tsx:182` | `!== null` (prescritte per riga) | `isLoggableExercise(exercise)`     |
| 5   | `ActiveWorkout.tsx:364`       | `?? null` (id per il drawer)     | `isLoggableExercise(openExercise)` |

A valle del punto 5, il drawer monta solo su `typeof openCatalogId === "string"`
(`ActiveWorkout.tsx:365` e `:533`): una seconda cintura sul VALORE derivato — anche lì undefined e
null sono la stessa assenza — che se il predicato regredisse tiene il drawer lontano da un id
fantasma, ed è ciò che fa fallire la prova rossa col messaggio giusto.

## 7. Acceptance — ognuno col suo comando

1. 🔴 **LA PROVA DELL'AGGIORNAMENTO** — `npx vitest run
src/pages/athlete/__tests__/ActiveWorkout.updateCache.boundary.test.ts` → **3 passed**. Il
   client è idratato con l'oggetto nella forma di PRIMA del merge (campo ASSENTE), la pagina VERA
   monta lista e drawer veri. Run rosso: **§8**.
2. **Il buster cambia da sé** — comando e i DUE valori in §4: `ncph-mta18tly` → `ncph-mta194jw`.
3. **In IndexedDB non finisce il derivato** — test «la riga grezza di Postgres, MAI il derivato»
   (`useProgramRelease.select.test.ts`): chiavi di primo livello del dato in cache **e** del
   payload `dehydrate()` = `["athlete_id","id","program_document"]`; `program`/`release` assenti.
   → passed.
4. **`select` ha referenza stabile** — test «il parser gira 1 volta e RESTA 1 dopo 10 re-render»:
   contatore sulle esecuzioni di `parseReleaseDocument` (spy che tiene l'implementazione vera) +
   referenza del derivato stabile. → passed.
5. **Un predicato solo** — `grep -n "isLoggableExercise" src/components/athlete/workout/SessionExerciseList.tsx src/pages/athlete/ActiveWorkout.tsx`
   → i 5 punti di §6 (+ 2 import); `grep -n "catalog_exercise_id !== null\|catalog_exercise_id != null\|catalog_exercise_id ?? null"`
   sugli stessi file → **zero residui** (`GREP_EXIT=1`).
6. **`undefined` e `null` identici** — unit (`loggableExercise.test.ts`: null / undefined esplicito /
   campo assente → stesso esito, uuid → true, parità col parser) + superficie
   (`updateCache.boundary`: due righe, campo assente e null, **2×** «manca il riferimento di
   catalogo», zero registratori). → passed.
7. **Gate — CINQUE** (baseline misurate sul tree pulito a `08db1fc` prima di toccare:
   424/40 · 81 · verdi):
   - `npx tsc --noEmit -p tsconfig.app.json` → **EXIT=0**
   - `npx vitest run` → **438 passed (43 file)** = baseline 424/40 + 14 nuovi
   - `npx eslint .` → **81 errori = ratchet `.eslint-baseline`** (445 file lintati, nessun nuovo)
   - `npm run build` → **EXIT=0** (eseguito DUE volte, §4)
   - `npm run verify:css` → **20/20 classi · 18 variabili · 11 chart-\* · EXIT=0**
     Conferma indipendente di `code-test-verifier`: tsc 0 · 437/437 · 81 al limite non superato.
8. **Perimetro** — `git diff origin/main..HEAD --stat`: **10 file di codice** (860 inserzioni,
   32 rimozioni) + i 3 docs nel commit dei documenti; nessun file vietato toccato.

**Passata indipendente (agenti di progetto, contesto proprio):** `code-reviewer` sul diff —
verdetto «committabile», prova rossa **riprodotta in autonomia** («il test non è decorativo»),
2 rilievi ENTRAMBI chiusi in-branch (`84f9ff4`): [basso] `return data` poteva propagare
`undefined` a TanStack v5 → `?? null`; [informativo] la degradazione del gate-status non era
pinnata → test gemello (degrada CHIUSA: `isError`, card errore in `AthleteTraining`, nota: con
`staleTime: Infinity` l'errore non si auto-ripara fino a refetch — accettato, fail-closed).
`aura-theme-auditor`: zero violazioni introdotte (l'hex `#c0c7d0` preesiste in 19 file athlete —
debito-tema già dichiarato il 22/08, non di questa fetta). `code-test-verifier`: tsc 0 ·
437/437 (pre-commit 4) · eslint 81 al limite non superato.

## 8. La prova rossa

Predicato riportato a `!== null` (solo il corpo, un sed avanti e indietro; tree committato prima):

```
FAIL  src/pages/athlete/__tests__/ActiveWorkout.updateCache.boundary.test.ts
  > cache scritta dal build precedente (catalog_exercise_id ASSENTE)
  > la riga non promette: o dice «Solo consultazione», o — se cliccabile — il drawer DEVE montarsi
AssertionError: la riga è cliccabile ma il drawer non si monta: i due guardiani rispondono
in modo diverso su undefined (riga: cliccabile; montaggio: rifiutato) — la promessa muta del
25/08: expected null not to be null

  > undefined e null si comportano identicamente anche in superficie
AssertionError: entrambe le righe degradano allo stesso modo: expected [ 'manca il riferimento
di catalogo' ] to have a length of 2 but got 1

Tests  2 failed | 1 passed (3)
```

Dopo il ripristino: `Tests 3 passed (3)` · `git status -s` vuoto · `git diff` su
`loggableExercise.ts` = 0 righe. La prova rossa è stata eseguita DUE volte (anche dopo lo
spostamento della cintura sul valore, §9.4) per confermare che il messaggio reggesse.

## 9. Non fatto / divergenze

1. **Censimento — la misura converge sulla spec ma il criterio è più largo.** Misurato su
   `08db1fc`: **81 chiamate `useQuery` in 44 file** (il mio primo grep `useQuery\(` ne vedeva 78:
   perdeva le 3 forme generiche `useQuery<T>(` — la misura della spec era giusta). Derivate
   secondo il MIO criterio (qualunque valore costruito dal nostro codice: oggetti, ma anche
   scalari estratti, boolean calcolati, array mappati/deduplicati): **33**, contro le 20 della
   spec (che contava gli oggetti). Le 2 di `useProgramRelease` sono riparate qui; restano **31**.
2. **Le 31 query derivate restanti — il rinvio datato (2026-08-26), una per una** (file:riga —
   chiave). ⚠️ Con la cintura del buster sono un miglioramento, non un'urgenza:
   - `src/features/nutrition/useLatestNutritionRelease.ts:28` — `["nutrition-release-latest", user?.id]` (**ATLETA** — la nominava la spec)
   - `src/providers/MaterialYouProvider.tsx:415` — `["coach-brand-color", coach_id]` (provider condiviso, letto anche dall'app atleta)
   - `src/features/nutrition/useNutritionEntitlement.ts:30` — `["tier-entitlement", "nutrition", tier]`
   - `src/hooks/useWeeklyCheckins.ts:34` — `["weekly-checkins", user?.id]`
   - `src/pages/coach/CoachCalendar.tsx:167` — `["calendar-workout-logs", …]`
   - `src/components/coach/CoachBottomNav.tsx:18` — `["coach-brand-color"]`
   - `src/pages/coach/CoachAthletes.tsx:109` — `["live-sessions", user?.id]`
   - `src/hooks/useCoachAppointments.ts:25` — `["coach-appointments", …]`
   - `src/hooks/useAthleteAnalytics.ts:40` — `["athlete-metabolic", athleteId]`
   - `src/hooks/useAthleteAnalytics.ts:121` — `["athlete-strength", athleteId, exerciseName]`
   - `src/hooks/useAthleteAnalytics.ts:197` — `["athlete-volume-intensity", athleteId]`
   - `src/hooks/useAthleteAnalytics.ts:268` — `["athlete-exercise-list", athleteId]`
   - `src/pages/coach/AthleteDetail.tsx:2216` — `["athlete-weight-trend", id]`
   - `src/hooks/useAthleteAcwrData.ts:38` — `["athlete-acwr-data", athleteId]`
   - `src/hooks/useAiQuota.ts:11` — `["ai-quota"]`
   - `src/hooks/useChatRooms.ts:50` — `["chat-rooms", user?.id]`
   - `src/hooks/useChatRooms.ts:213` — `["messages", roomId]`
   - `src/pages/coach/CoachSettings.tsx:178` — `["coach-profile", user?.id]`
   - `src/components/coach/athlete/StrategyContent.tsx:291` — `["nutrition-plan", athleteId]`
   - `src/components/coach/athlete/StrategyContent.tsx:321` — `["athlete-week-schedule", athleteId]`
   - `src/components/coach/calendar/ProgramsDrawer.tsx:180` — `["calendar-programs", user?.id]`
   - `src/hooks/useFmsAlerts.ts:107` — `["fms-alerts", athleteId]`
   - `src/hooks/useAthleteVbtData.ts:25` — `["athlete-vbt", athleteId, exerciseFilter]`
   - `src/hooks/useAthleteVbtData.ts:112` — `["athlete-vbt-exercises", athleteId]`
   - `src/hooks/useAthleteHealthProfile.ts:121` — `["athlete-health-profile", athleteId]`
   - `src/components/coach/AthleteViewerDialog.tsx:306` — `["god-mode-habits", athleteId, todayDate]`
   - `src/hooks/useCoachTrainingBlocks.ts:32` — `["coach-training-blocks", user?.id]`
   - `src/components/coach/messages/AthleteContextPane.tsx:78` — `["athlete-context-workouts", athleteId]`
   - `src/hooks/useAthleteRiskAnalysis.ts:198` — `["fms-assessments", athleteId, "latest-completed"]`
   - `src/hooks/useCoachNutritionAnalytics.ts:25` — `["coach-nutrition-analytics", athleteId]`
   - `src/hooks/useExerciseLibraryQuery.ts:147` — `["exercise-library", search, limit]`
3. **`src/vite-env.d.ts` modificato pur non essendo nella lista della spec**: 4 righe, la sola
   declare TS di `__BUILD_ID__` — senza, il gate tsc è rosso. Nessun'altra strada senza toccare
   `tsconfig` (più invasivo).
4. **La prima stesura della cintura a valle del predicato usava `openExercise.catalog_exercise_id
?? null`**: funzionava, ma pattern-matchava l'espressione storica del difetto e sporcava il
   comando-prova del criterio 5. Sostituita con la cintura sul VALORE (`typeof === "string"`),
   prova rossa rieseguita dopo il cambio.
5. **Fuori dalla fetta, datati (spec §3):** la validazione a runtime dei dati reidratati (la
   risposta completa — vale una fetta sua; qui se n'è tolto il motivo principale) · i 72 alpha
   morti col cancello · `total_load_au` · i 72 trattini · il dedupe del watchdog.
6. **Reperto permessi aggiornato**: `git -C <path> rebase` oggi è bloccato dal classificatore
   (il 25/08 scavalcava il matcher) — la chip per le deny esplicite `-C`/`--git-dir` resta aperta.

## 10. Resta a Nicolò

1. **Merge della PR** ([crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/aggiornamento-sicuro))
   coi 2 check obbligatori verdi. **Post-merge: NULLA da applicare** — solo FE, il deploy Vercel
   parte dal merge; zero migration, zero edge, zero secrets, zero configurazione Vercel (il buster
   vive tutto nel repo).
2. **L'ultimo miglio, a occhio**: aprire l'app su un dispositivo che l'aveva usata PRIMA del
   deploy (cache vecchia in IndexedDB) → al primo avvio il buster nuovo scarta la cache, le query
   si rifanno (raffica una tantum, dichiarata), la seduta mostra gli esercizi e le righe
   registrabili aprono il drawer. La riga non mente più: se mai una riga dovesse dire «Solo
   consultazione», ora è la verità del documento, non un disaccordo fra guardiani.
