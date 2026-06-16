import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  ProgramBlock,
  ProgramGoal,
  Microcycle,
  Session,
  ProgrammedExercise,
  ProgrammedSetUpdate,
  NewProgrammedExercise,
  UUID,
} from "@/types/training";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * UUID generator. Uses the Web Crypto API (available in modern browsers
 * and Node 19+). Falls back to a timestamp-based pseudo-UUID for
 * environments where crypto.randomUUID is unavailable (rare in PWAs).
 */
const uuid = (): UUID => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback. Sufficient for client-side IDs.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Deep-clones an object via structuredClone (preferred) or JSON fallback.
 * Used by `duplicateWeek` to ensure source and target weeks share NO
 * references — every nested set must be independently mutable.
 */
const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

/**
 * Today's date in ISO format (YYYY-MM-DD), used as a sensible default
 * for newly-scaffolded blocks.
 */
const todayISO = (): string => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ProgramBuilderState {
  /** The currently-edited program block. Null until initialized or loaded. */
  block: ProgramBlock | null;
  /** Tracks unsaved changes for "save before leaving" guards. */
  isDirty: boolean;
  /**
   * The exercise currently focused in the Progression Inspector
   * (right-hand sidebar). Stored as `{ weekId, sessionId, exerciseId }`
   * triple because exercise IDs are unique in practice but the context
   * (which week / session it lives in) is what the inspector needs to
   * surface "previous week" / "next microcycle" rule triggers.
   *
   * Null when no exercise is selected — the inspector renders its
   * empty state in that case.
   */
  selectedContext: { weekId: UUID; sessionId: UUID; exerciseId: UUID } | null;
  /** Set / clear the active exercise context. Pass `null` to deselect. */
  setSelectedContext: (ctx: { weekId: UUID; sessionId: UUID; exerciseId: UUID } | null) => void;

  // ---- Lifecycle ----
  /**
   * Scaffold a new empty program block with N weeks × M sessions per week.
   * Useful for the "New Program" wizard. Each session is created with no
   * exercises — coaches fill those in next.
   */
  initializeBlock: (params: {
    name: string;
    goal?: ProgramGoal;
    athlete_id?: UUID;
    weeksCount: number;
    sessionsPerWeek: number;
    startDate?: string;
  }) => void;

  /** Replace the entire block (e.g. after loading from API). */
  loadBlock: (block: ProgramBlock) => void;

  /** Reset the store to its empty state. */
  reset: () => void;

  // ---- Exercise CRUD ----
  /**
   * Append a new programmed exercise to a specific session. The store
   * assigns `id` (if not provided) and `order` (next available index).
   */
  addExerciseToSession: (weekId: UUID, sessionId: UUID, exercise: NewProgrammedExercise) => void;

  /** Remove an exercise from a session and re-pack `order` indices. */
  removeExercise: (weekId: UUID, sessionId: UUID, exerciseId: UUID) => void;

  // ---- Set progression ----
  /**
   * Patch a single set's auto-regulation targets (RPE/RIR/%1RM/reps/rest).
   * The set is identified by its 1-indexed `set_number` within the exercise.
   * This is the primary mutation called when a coach types into the set
   * editor grid.
   */
  updateSetProgression: (
    weekId: UUID,
    sessionId: UUID,
    exerciseId: UUID,
    setNumber: number,
    updates: ProgrammedSetUpdate,
  ) => void;

  // ---- Set CRUD (append-only; deletion handled via removeExercise/replace) ----
  /**
   * Append a new working set to the end of an exercise. The new set is
   * pre-filled with sensible hypertrophy defaults (8 reps @ RPE 8, 90s rest)
   * which the coach typically overrides inline. Returns nothing — callers
   * read the resulting state from the store.
   */
  addSetToExercise: (weekId: UUID, sessionId: UUID, exerciseId: UUID) => void;

  // ---- Week duplication (the coach's killer feature) ----
  /**
   * Deep-copies all sessions, exercises, and sets from `sourceWeekId` into
   * `targetWeekId`. The target week's existing content is REPLACED. New
   * UUIDs are generated for every nested entity to prevent reference
   * collisions. The coach's typical workflow:
   *   1. Build Week 1 in detail.
   *   2. Duplicate to Weeks 2-4.
   *   3. Bump RPE/load on each subsequent week for progressive overload.
   */
  duplicateWeek: (sourceWeekId: UUID, targetWeekId: UUID) => void;

  // ---- AI week replacement ----
  /**
   * Rimpiazza in blocco le `sessions` della settimana `weekId` con quelle
   * generate dall'IA (già mappate da `aiProgramMapper`). Appende `rationale`
   * a `block.description` con etichetta, senza sovrascriverla.
   */
  replaceWeekWithAiProgram: (weekId: UUID, sessions: Session[], rationale?: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

/**
 * Internal helper: locate a session within the draft state, or return
 * undefined. Centralizes the week→session lookup logic used by most
 * mutations.
 */
const findSession = (
  block: ProgramBlock | null,
  weekId: UUID,
  sessionId: UUID,
): Session | undefined => {
  if (!block) return undefined;
  const week = block.weeks.find((w) => w.id === weekId);
  return week?.sessions.find((s) => s.id === sessionId);
};

export const useProgramBuilderStore = create<ProgramBuilderState>()(
  immer((set) => ({
    block: null,
    isDirty: false,
    selectedContext: null,

    setSelectedContext: (ctx) =>
      set((state) => {
        state.selectedContext = ctx;
      }),

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    initializeBlock: ({
      name,
      goal = "Hypertrophy",
      athlete_id = "",
      weeksCount,
      sessionsPerWeek,
      startDate,
    }) =>
      set((state) => {
        const weeks: Microcycle[] = Array.from({ length: weeksCount }, (_, w) => ({
          id: uuid(),
          order: w + 1, // 1-indexed for coach-facing UI
          sessions: Array.from({ length: sessionsPerWeek }, (_, s) => ({
            id: uuid(),
            name: `Day ${s + 1}`,
            order: s,
            exercises: [],
          })),
        }));

        state.block = {
          id: uuid(),
          name,
          goal,
          athlete_id,
          start_date: startDate ?? todayISO(),
          weeks,
          updated_at: new Date().toISOString(),
        };
        state.isDirty = true;
      }),

    loadBlock: (block) =>
      set((state) => {
        state.block = block;
        state.isDirty = false;
      }),

    reset: () =>
      set((state) => {
        state.block = null;
        state.isDirty = false;
      }),

    // -----------------------------------------------------------------------
    // Exercise CRUD
    // -----------------------------------------------------------------------

    addExerciseToSession: (weekId, sessionId, exercise) =>
      set((state) => {
        const session = findSession(state.block, weekId, sessionId);
        if (!session) return;

        const newExercise: ProgrammedExercise = {
          ...exercise,
          id: exercise.id ?? uuid(),
          order: session.exercises.length, // append at end
          // Ensure every nested set has an id (defensive — callers may forget).
          sets: exercise.sets.map((s) => ({ ...s, id: s.id ?? uuid() })),
        };

        session.exercises.push(newExercise);
        state.isDirty = true;
      }),

    removeExercise: (weekId, sessionId, exerciseId) =>
      set((state) => {
        const session = findSession(state.block, weekId, sessionId);
        if (!session) return;

        const idx = session.exercises.findIndex((e) => e.id === exerciseId);
        if (idx === -1) return;

        session.exercises.splice(idx, 1);

        // Re-pack `order` so it remains a contiguous 0..N-1 sequence.
        // This keeps drag-and-drop reordering stable downstream.
        session.exercises.forEach((ex, i) => {
          ex.order = i;
        });

        state.isDirty = true;
      }),

    // -----------------------------------------------------------------------
    // Set progression
    // -----------------------------------------------------------------------

    updateSetProgression: (weekId, sessionId, exerciseId, setNumber, updates) =>
      set((state) => {
        const session = findSession(state.block, weekId, sessionId);
        if (!session) return;

        const exercise = session.exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        const targetSet = exercise.sets.find((s) => s.set_number === setNumber);
        if (!targetSet) return;

        // Immer lets us "mutate" — under the hood this produces a new
        // immutable tree. We deliberately whitelist via ProgrammedSetUpdate
        // (which omits id and set_number) to prevent accidental key changes.
        Object.assign(targetSet, updates);

        state.isDirty = true;
      }),

    // -----------------------------------------------------------------------
    // Set CRUD
    // -----------------------------------------------------------------------

    addSetToExercise: (weekId, sessionId, exerciseId) =>
      set((state) => {
        const session = findSession(state.block, weekId, sessionId);
        if (!session) return;

        const exercise = session.exercises.find((e) => e.id === exerciseId);
        if (!exercise) return;

        // Inherit prescription from the previous set so coaches don't
        // re-type the same numbers — the most common pattern is "another
        // set of the same thing" rather than introducing a new scheme.
        const prev = exercise.sets[exercise.sets.length - 1];

        exercise.sets.push({
          id: uuid(),
          set_number: exercise.sets.length + 1,
          reps_target: prev?.reps_target ?? "8",
          rpe_target: prev?.rpe_target ?? 8,
          rir_target: prev?.rir_target,
          percent_1rm_target: prev?.percent_1rm_target,
          rest_seconds: prev?.rest_seconds ?? 90,
          tempo: prev?.tempo,
          // is_warmup deliberately not inherited — new sets default to working sets.
        });

        state.isDirty = true;
      }),

    // -----------------------------------------------------------------------
    // Week duplication
    // -----------------------------------------------------------------------

    duplicateWeek: (sourceWeekId, targetWeekId) =>
      set((state) => {
        if (!state.block) return;
        if (sourceWeekId === targetWeekId) return; // no-op guard

        const sourceWeek = state.block.weeks.find((w) => w.id === sourceWeekId);
        const targetIdx = state.block.weeks.findIndex((w) => w.id === targetWeekId);
        if (!sourceWeek || targetIdx === -1) return;

        const targetWeek = state.block.weeks[targetIdx];

        // Deep-clone sessions so source and target share no references.
        // Then re-stamp every id at every level — sessions, exercises,
        // sets, and superset groupings — so the cloned tree is fully
        // independent and won't collide with the source on save.
        const clonedSessions: Session[] = deepClone(sourceWeek.sessions).map((session) => {
          // Map old superset_ids -> new superset_ids so groups stay
          // intact within the cloned week (A1/A2 must remain paired).
          const supersetIdMap = new Map<UUID, UUID>();

          const remappedExercises: ProgrammedExercise[] = session.exercises.map((ex) => {
            let newSupersetId: UUID | undefined;
            if (ex.superset_id) {
              if (!supersetIdMap.has(ex.superset_id)) {
                supersetIdMap.set(ex.superset_id, uuid());
              }
              newSupersetId = supersetIdMap.get(ex.superset_id);
            }

            return {
              ...ex,
              id: uuid(),
              superset_id: newSupersetId,
              sets: ex.sets.map((s) => ({ ...s, id: uuid() })),
            };
          });

          return {
            ...session,
            id: uuid(),
            exercises: remappedExercises,
          };
        });

        // Replace target week contents while preserving its identity
        // (id, order, is_deload flag).
        state.block.weeks[targetIdx] = {
          ...targetWeek,
          sessions: clonedSessions,
        };

        state.isDirty = true;
      }),

    // -----------------------------------------------------------------------
    // AI week replacement
    // -----------------------------------------------------------------------

    replaceWeekWithAiProgram: (weekId, sessions, rationale) =>
      set((state) => {
        if (!state.block) return;
        const idx = state.block.weeks.findIndex((w) => w.id === weekId);
        if (idx === -1) return;

        const week = state.block.weeks[idx];
        // The mapper already produced fully-formed Session objects with their
        // own ids; we just swap them in, preserving the week identity.
        state.block.weeks[idx] = { ...week, sessions };

        // Append the AI rationale to the block description (never overwrite).
        const trimmed = rationale?.trim();
        if (trimmed) {
          const label = `IA — settimana ${week.order}: ${trimmed}`;
          state.block.description = state.block.description
            ? `${state.block.description}\n\n${label}`
            : label;
        }

        state.isDirty = true;
      }),
  })),
);

// ---------------------------------------------------------------------------
// Selectors (optional but recommended — keeps components lean)
// ---------------------------------------------------------------------------

// Internal selector scope alias (avoids exporting the full state type just
// for selector consumers).
type ProgrammedSelectorScope = Pick<ProgramBuilderState, "block">;

/** Selector: get a week by id without re-rendering on unrelated changes. */
const selectWeek =
  (weekId: UUID) =>
  (state: ProgramBuilderState): Microcycle | undefined =>
    state.block?.weeks.find((w) => w.id === weekId);

/** Selector: get a session by composite (week, session) key. */
const selectSession =
  (weekId: UUID, sessionId: UUID) =>
  (state: ProgrammedSelectorScope): Session | undefined => {
    return state.block?.weeks
      .find((w) => w.id === weekId)
      ?.sessions.find((s) => s.id === sessionId);
  };
