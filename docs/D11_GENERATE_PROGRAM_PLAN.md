# D11 — Piano: cablare `generate-program` nella UI coach

> Stato: la edge function `generate-program` (gpt-5.2) è **deployata e validata live** (smoke 2026-06-15) ma **non è invocata da nessun punto del frontend**. Questo doc è il piano per cablarla. Esecuzione = **Claude Code** (codice + commit su branch). Mappa prodotta da esplorazione read-only (Cowork, 2026-06-15).

## Obiettivo

Aggiungere un'azione **"Genera Settimana con IA"** nel Program Builder che invoca `generate-program` e applica il risultato alla **settimana selezionata** del blocco.

## Contratto funzione

- **Body:** `{ athlete_id: string, focus_goal: string, days_per_week: number, equipment?: string, mode: "new"|"continue" }`
- **Ritorna:** `{ days: Array<{ day_index:number, day_name:string, focus:string, exercises: Array<{ name:string, sets:number, reps:string, load:string, rpe?:number, rest_seconds:number, notes:string }> }>, rationale: string }`

## Punto d'aggancio (consigliato)

- **`src/pages/coach/ProgramBuilder.tsx`** (route `/coach/programs`, builder **globale** con selettore atleta nel header ~rr.605-629 → `block.athlete_id` già disponibile; `selectedWeekId` ~r.420).
- Bottone **"Genera Settimana IA"** (icona `Sparkles`) nel header accanto a "Clona Settimana" (~r.631).
- **Modal input:** `focus_goal`, `equipment`, `mode` (new|continue); `days_per_week` = `selectedWeek.sessions.length`.
- Il builder **non** è per-atleta sotto AthleteDetail → `ProgramTab.tsx` mostra solo il programma attivo, non è il punto d'intervento.

## Modello dati builder (`src/types/training.ts`)

`ProgramBlock.weeks: Microcycle[]` → `Microcycle.sessions: Session[]` → `Session.exercises: ProgrammedExercise[]` → `.sets: ProgrammedSet[]`.

- `Session { id, name, order(0-idx), focus?, exercises }`
- `ProgrammedExercise { id, exercise_id, exercise_name, order, sets, coach_notes? }`
- `ProgrammedSet { id, set_number(1-idx), reps_target, rpe_target?, rir_target?, percent_1rm_target?, rest_seconds, is_warmup?, tempo? }`

## Mapping output AI → builder

| Output AI                   | →   | Campo builder                                               | Note                                                      |
| --------------------------- | --- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `day_index`                 | →   | `Session.order`                                             | 0-indexed ✓                                               |
| `day_name`                  | →   | `Session.focus` (o `name`)                                  | **decisione** (vedi sotto)                                |
| `focus`                     | →   | `Session.focus`                                             | italiano                                                  |
| `exercises[]`               | →   | `ProgrammedExercise[]`                                      |                                                           |
| `name`                      | →   | `ProgrammedExercise.exercise_name` (+ lookup `exercise_id`) | **decisione**                                             |
| `sets` (N)                  | →   | genera N `ProgrammedSet`                                    |                                                           |
| `reps`                      | →   | `ProgrammedSet.reps_target`                                 | stringa diretta                                           |
| `load` ("70%"/"RPE 7"/"BW") | →   | `percent_1rm_target` / `rpe_target` / `coach_notes`         | **parsing necessario** (campo `load` non esiste nel tipo) |
| `rpe`                       | →   | `ProgrammedSet.rpe_target`                                  |                                                           |
| `rest_seconds`              | →   | `ProgrammedSet.rest_seconds`                                |                                                           |
| `notes`                     | →   | `ProgrammedExercise.coach_notes`                            |                                                           |
| `rationale`                 | →   | `ProgramBlock.description`                                  | traccia intent                                            |

## Da implementare

1. **Store action** `replaceWeekWithAiProgram(weekId, sessions: Session[])` in `src/stores/programBuilder/useProgramBuilderStore.ts` (oggi manca un bulk-replace; esistono solo add singolo e `duplicateWeek`).
2. **Hook** `useGenerateProgram()` (React Query `useMutation` su `supabase.functions.invoke("generate-program", { body })`) — imitare il pattern di `src/components/coach/analytics/AiInsightCard.tsx` (~rr.85-104): gestire `error` **e** `data?.error`, `toast` success/errore, `isPending` per disabilitare il bottone.
3. **Bottone + modal** nel header di ProgramBuilder.
4. **Parser `load`** → `percent_1rm_target` / `rpe_target` / fallback `coach_notes` ("BW").
5. **Match `name` (EN) → `exercise_id`** dalla libreria esercizi.
6. Persistenza: nessuna nuova mutation — dopo l'applicazione, il coach salva con il `useSaveProgramBlock()` esistente (JSONB su `program_blocks`).

## Decisioni da proporre PRIMA di implementare (Code → Nick)

- **Match nome→`exercise_id`:** (A) lookup per nome nella libreria con fallback a `exercise_name`-only se non trovato **[consigliato]**, (B) crea esercizio al volo, (C) solo nome senza id. Impatta integrità dati e analytics che usano `exercise_id`.
- **`day_name` italiano:** metterlo in `Session.focus` e tenere `Session.name` ("Day 1"…), oppure rimpiazzare `name`.
- **`mode: "continue"`:** richiede `block.athlete_id` set + storico → validare e avvisare se manca.

## Guardrail (dal CLAUDE.md)

italiano · branch `claude/<slug>` (NON su main) · **MAI push** (sincronizza Nick) · build gate `tsc --noEmit -p tsconfig.app.json` verde · commit atomici · secrets li imposta Nick · security D5 report-only · **Esplora→pianifica→proponi PRIMA di modificare**.

---

## Stato implementazione (Claude Code, 2026-06-16)

Branch **`claude/genprogram-ui`** — 2 commit, **non pushati** (la feature è usabile solo dopo la UI):

- `b8d50c6` feat(coach): hook `useGenerateProgram` + mapper `aiProgramMapper`.
- `a9d635a` feat(coach): store action `replaceWeekWithAiProgram`.

### ✅ Fatto

- **`src/hooks/useGenerateProgram.ts`** — `useMutation` su `invoke("generate-program")`; gestione `error` ed `data?.error` + toast; `isPending`. (Success/applicazione = a carico del chiamante UI.)
- **`src/lib/program/aiProgramMapper.ts`** (puro, testabile) — `mapAiDaysToSessions(days, library)`, `parseLoad`, `matchExerciseId`, costanti `UNLINKED_EXERCISE_ID` (NIL sentinel) + `UNLINKED_EXERCISE_NOTE`, tipi `AiProgramResponse/Day/Exercise`. **Decisioni applicate:** (1) SENTINEL NIL per gli esercizi non in libreria + flag in `coach_notes`; (2) `load`: `NN%`→`percent_1rm_target`, campo `rpe` o `"RPE N"`→`rpe_target`, resto (es. `BW`) conservato grezzo in `coach_notes`; (3) `day_name`→`Session.name`, `focus`→`Session.focus`.
- **`replaceWeekWithAiProgram(weekId, sessions, rationale?)`** nello store — swap delle `sessions` della week (preserva l'identità della week) + `rationale` **appesa** a `block.description` con etichetta `IA — settimana N` (non sovrascrive); `isDirty=true`.
- Build gate `tsc` **verde** dopo ogni commit.

### ⏳ Resta — commit 3: UI

Bottone **"Genera Settimana IA"** (`Sparkles`) nel header di `src/pages/coach/ProgramBuilder.tsx` (accanto a "Clona Settimana") + **modal** (`focus_goal`, `equipment`, `mode`; `days_per_week = selectedWeek.sessions.length`). Flusso:

```
useGenerateProgram().mutate({ athlete_id: block.athlete_id, focus_goal, days_per_week, equipment, mode })
  → onSuccess: const sessions = mapAiDaysToSessions(data.days, libreria)   // useExerciseLibraryQuery
              store.replaceWeekWithAiProgram(selectedWeekId, sessions, data.rationale) + toast success
```

Disabilitare se `!block.athlete_id` o `selectedWeek` senza sessioni; `mode:"continue"` valida `athlete_id` + storico. Leggere prima: header di ProgramBuilder (`block` / `selectedWeekId` / `selectedWeek` / selettore atleta ~rr.605‑631) + un `Dialog` shadcn esistente per il pattern modal.

### ⚠️ Contesto critico

La tabella `exercises` è **vuota** (0 righe, verificato lato connettore) → il match nome→`exercise_id` fallisce sempre e il **SENTINEL è il path principale** finché la libreria non viene popolata (probabile buco di migrazione, da indagare a parte).
