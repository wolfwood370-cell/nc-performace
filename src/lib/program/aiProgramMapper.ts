// =============================================================================
// src/lib/program/aiProgramMapper.ts
// =============================================================================
// Mappa pura (no React) dell'output della edge function `generate-program`
// nelle strutture del Program Builder (src/types/training.ts).
//
// Contesto (2026-07-05): la libreria `exercises` è POPOLATA (954 esercizi del
// metodo) e il motore deterministico passa `exercise_id` per ogni esercizio →
// il path principale è prefer-id (nessun match per nome). Il match nome→id
// resta come fallback per output legacy senza id; gli esercizi "scollegati"
// usano il SENTINEL UNLINKED_EXERCISE_ID e restano riconoscibili in blocco.
// =============================================================================

import type { Session, ProgrammedExercise, ProgrammedSet, UUID } from "@/types/training";
import type { LibraryExercise } from "@/hooks/useExerciseLibraryQuery";

/** NIL uuid: esercizio IA non presente nella libreria del coach (decisione D11.1). */
export const UNLINKED_EXERCISE_ID: UUID = "00000000-0000-0000-0000-000000000000";

/** Marcatore in `coach_notes` per gli esercizi scollegati dalla libreria. */
export const UNLINKED_EXERCISE_NOTE = "⚠ IA: esercizio da collegare alla libreria";

// --- Contratto output di `generate-program` (vedi supabase/functions/generate-program) ---
export interface AiProgramExercise {
  /** exercises.id scelto dal motore deterministico; assente negli output legacy. */
  exercise_id?: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  rpe?: number;
  rest_seconds: number;
  notes: string;
}
export interface AiProgramDay {
  day_index: number;
  day_name: string;
  focus: string;
  exercises: AiProgramExercise[];
}
export interface AiProgramResponse {
  days: AiProgramDay[];
  rationale: string;
}

interface ParsedLoad {
  percent_1rm_target?: number;
  rpe_target?: number;
  /** Stringa `load` grezza, conservata nelle note quando non mappata a target numerico. */
  rawNote?: string;
}

/**
 * Parsa il campo `load` dell'IA. Regole (decisione D11.2):
 *   "70%"   → percent_1rm_target: 70
 *   "RPE 7" → rpe_target: 7
 *   "BW" / testo non parsabile → rawNote ("Carico: <testo>") da appendere alle note.
 */
export function parseLoad(load: string | undefined): ParsedLoad {
  const trimmed = (load ?? "").trim();
  if (!trimmed) return {};
  const pct = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return { percent_1rm_target: Number(pct[1]) };
  const rpe = trimmed.match(/rpe\s*(\d+(?:\.\d+)?)/i);
  if (rpe) return { rpe_target: Number(rpe[1]) };
  return { rawNote: `Carico: ${trimmed}` };
}

/** Normalizza un nome per il match (lowercase + spazi collassati). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Risolve `exercise_id` dalla libreria per nome; NIL sentinel se assente. */
export function matchExerciseId(name: string, library: LibraryExercise[]): UUID {
  const target = normalizeName(name);
  return library.find((e) => normalizeName(e.name) === target)?.id ?? UNLINKED_EXERCISE_ID;
}

/** Genera gli N set programmati per un esercizio IA. */
function buildSets(ex: AiProgramExercise, parsed: ParsedLoad): ProgrammedSet[] {
  const count = Math.max(1, Math.floor(Number(ex.sets) || 1));
  // `rpe` esplicito ha priorità sul valore derivato dal parsing di `load`.
  const rpeTarget = typeof ex.rpe === "number" ? ex.rpe : parsed.rpe_target;
  return Array.from({ length: count }, (_, i) => {
    const set: ProgrammedSet = {
      id: crypto.randomUUID(),
      set_number: i + 1,
      reps_target: String(ex.reps ?? ""),
      rest_seconds: Number(ex.rest_seconds) || 0,
    };
    if (parsed.percent_1rm_target !== undefined) set.percent_1rm_target = parsed.percent_1rm_target;
    if (rpeTarget !== undefined) set.rpe_target = rpeTarget;
    return set;
  });
}

/** Compone `coach_notes`: note IA + carico grezzo non mappato + flag scollegato. */
function buildNotes(
  ex: AiProgramExercise,
  parsed: ParsedLoad,
  unlinked: boolean,
): string | undefined {
  const parts: string[] = [];
  if (ex.notes?.trim()) parts.push(ex.notes.trim());
  if (parsed.rawNote) parts.push(parsed.rawNote);
  if (unlinked) parts.push(UNLINKED_EXERCISE_NOTE);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Mappa i `days` della risposta IA nelle `Session` del builder.
 * `day_name` → Session.name, `focus` → Session.focus, `day_index` → Session.order.
 */
export function mapAiDaysToSessions(days: AiProgramDay[], library: LibraryExercise[]): Session[] {
  return [...days]
    .sort((a, b) => a.day_index - b.day_index)
    .map((day) => ({
      id: crypto.randomUUID(),
      name: day.day_name?.trim() || `Giorno ${day.day_index + 1}`,
      order: day.day_index,
      focus: day.focus?.trim() || undefined,
      exercises: (day.exercises ?? []).map((ex, idx): ProgrammedExercise => {
        // Prefer-id: l'id del motore viene dalla libreria del coach ed è già
        // collegato; il match per nome resta come fallback per output legacy.
        const exercise_id = ex.exercise_id?.trim()
          ? (ex.exercise_id as UUID)
          : matchExerciseId(ex.name, library);
        const parsed = parseLoad(ex.load);
        return {
          id: crypto.randomUUID(),
          exercise_id,
          exercise_name: ex.name,
          order: idx,
          sets: buildSets(ex, parsed),
          coach_notes: buildNotes(ex, parsed, exercise_id === UNLINKED_EXERCISE_ID),
        };
      }),
    }));
}
