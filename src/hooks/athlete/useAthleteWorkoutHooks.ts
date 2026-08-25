// =============================================================================
// src/hooks/athlete/useAthleteWorkoutHooks.ts
// =============================================================================
// React Query hooks for athlete workout sessions and per-set logging.
//
// Data model:
//   - `workout_logs` row  = one session header (start/end/elapsed/RPE/notes).
//   - `exercise_logs` rows = one row per completed set, FK'd to the session.
//
// Hooks:
//   - useStartSessionMutation  → INSERT workout_logs, status='in_progress'.
//   - useLogSetMutation        → INSERT exercise_logs (one set).
//   - useFinishSessionMutation → UPDATE workout_logs with end/duration/RPE/notes.
//   - useSessionSetsQuery      → SELECT exercise_logs for a session.
//
// `workout_logs.workout_id` is nullable (see migration
// 20260517171000_workout_logs_optional_workout.sql) so freestyle sessions
// without a coach-prescribed `workouts` row can still be persisted.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type WorkoutLogRow = Tables<"workout_logs">;
export type ExerciseLogRow = Tables<"exercise_logs">;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const sessionSetsKey = (sessionId: string | null) => ["session-sets", sessionId ?? "none"] as const;

// ---------------------------------------------------------------------------
// Start session
// ---------------------------------------------------------------------------

export interface StartSessionInput {
  /** Optional FK to a coach-prescribed workouts row. Null for freestyle. */
  workout_id?: string | null;
}

/**
 * Insert a new `workout_logs` row in `in_progress` state, stamped with
 * `started_at = now()`. Returns the new row so the caller can stash the
 * session id (used as the FK target for `exercise_logs`).
 *
 * Identity is resolved inside `mutationFn` via `supabase.auth.getSession()`
 * — which awaits client initialization and refreshes an expired token —
 * NOT captured from React state at render time. The INSERT must never
 * depend on when a per-instance `useAuth` finishes populating (that race
 * used to silently return a fabricated local row and persist nothing).
 * No authenticated session → throw; `onError` surfaces the red toast.
 */
export function useStartSessionMutation() {
  return useMutation({
    mutationFn: async (input: StartSessionInput = {}): Promise<WorkoutLogRow> => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user?.id) {
        throw new Error("Non sei autenticato: accedi di nuovo per salvare l'allenamento.");
      }
      const payload: TablesInsert<"workout_logs"> = {
        athlete_id: session.user.id,
        workout_id: input.workout_id ?? null,
        started_at: new Date().toISOString(),
        status: "in_progress",
      };
      const { data, error } = await supabase.from("workout_logs").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onError: (error: Error) => {
      toast.error("Avvio sessione fallito", {
        description: error.message,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Log a set
// ---------------------------------------------------------------------------

export interface LogSetInput {
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  is_completed?: boolean;
}

/**
 * Insert one `exercise_logs` row for the active session. Invalidates the
 * session's sets query on success so the UI's completed-count refreshes.
 */
export function useLogSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LogSetInput): Promise<ExerciseLogRow> => {
      const payload: TablesInsert<"exercise_logs"> = {
        session_id: input.session_id,
        exercise_id: input.exercise_id,
        set_number: input.set_number,
        weight: input.weight,
        reps: input.reps,
        is_completed: input.is_completed ?? true,
      };
      const { data, error } = await supabase
        .from("exercise_logs")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: sessionSetsKey(row.session_id),
      });
    },
    onError: (error: Error, input) => {
      // Unique violation of (session_id, exercise_id, set_number): the DB
      // already guards the double tap — the row exists, this attempt was
      // rightly rejected. Say so in the athlete's words (never a raw
      // Postgres message) and refetch the rows so the stale count that
      // produced the duplicate set_number resyncs itself.
      if ((error as { code?: string }).code === "23505") {
        toast.error("Serie già registrata", {
          description: "Questa serie risultava già salvata: il conteggio è stato aggiornato.",
        });
        queryClient.invalidateQueries({
          queryKey: sessionSetsKey(input.session_id),
        });
        return;
      }
      toast.error("Salvataggio serie fallito", {
        description: error.message,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Finish session
// ---------------------------------------------------------------------------

export interface FinishSessionInput {
  session_id: string;
  duration_seconds: number;
  /** Session RPE (CR-10 of Foster) → `workout_logs.srpe`, ITS column.
   *  `rpe_global` is deliberately not part of this payload anymore: the
   *  two DB CHECKs are identical (1..10), only the column name separates
   *  the scales — so the code must (B-22). Untouched scale = null. */
  srpe?: number | null;
  notes?: string | null;
}

/**
 * Mark a session complete — stamps `completed_at`, persists final
 * duration / session RPE / notes, flips status to 'completed'.
 */
export function useFinishSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FinishSessionInput): Promise<WorkoutLogRow> => {
      const update: TablesUpdate<"workout_logs"> = {
        completed_at: new Date().toISOString(),
        duration_seconds: input.duration_seconds,
        srpe: input.srpe ?? null,
        notes: input.notes ?? null,
        status: "completed",
      };
      const { data, error } = await supabase
        .from("workout_logs")
        .update(update)
        .eq("id", input.session_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: sessionSetsKey(row.id),
      });
    },
    onError: (error: Error) => {
      toast.error("Chiusura sessione fallita", {
        description: error.message,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Read: sets in a session
// ---------------------------------------------------------------------------

/**
 * Fetch all `exercise_logs` rows for a session, ordered by set_number.
 * Disabled while `sessionId` is null (no active session).
 */
export function useSessionSetsQuery(sessionId: string | null) {
  return useQuery({
    queryKey: sessionSetsKey(sessionId),
    queryFn: async (): Promise<ExerciseLogRow[]> => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("exercise_logs")
        .select("*")
        .eq("session_id", sessionId)
        .order("set_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(sessionId),
  });
}
