/**
 * useSaveProgramBlock
 * ---------------------------------------------------------------------------
 * React Query mutation that persists a full V2 `ProgramBlock` (Macrocycle →
 * Microcycle → Session → ProgrammedExercise → ProgrammedSet) to Supabase.
 *
 * Architectural decision: JSONB-document persistence
 * --------------------------------------------------
 * The V2 engine models a deeply-nested, frequently-edited periodization
 * tree. We evaluated three persistence strategies:
 *
 *   1. Fully-normalized batch insert
 *      - 5 tables, foreign keys at every level (matches the legacy
 *        `program_plans/weeks/days/workouts/exercises` schema).
 *      - Pros: queryable in SQL, joinable with athlete logs.
 *      - Cons: a single "save" becomes a 5-table transaction with
 *        hundreds of rows for a 6-week × 5-day block. Without an RPC
 *        wrapper, partial failures leave orphans (PostgREST does not
 *        expose multi-statement transactions). Edits that move a single
 *        set still rewrite half the tree.
 *
 *   2. Hybrid (top-level row + JSONB payload)   ← chosen
 *      - One `program_blocks` row per block with a `data JSONB` column
 *        holding the entire `ProgramBlock` document.
 *      - Top-level scalar columns (`coach_id`, `athlete_id`, `name`,
 *        `goal`, `start_date`, `status`, `updated_at`) for indexing,
 *        RLS, and dashboard queries.
 *      - One round trip, atomic by definition (single row UPSERT),
 *        zero orphan risk, structurally identical to the in-memory
 *        Zustand model so save/load is symmetric.
 *      - Tradeoff: in-DB analytics on individual sets need
 *        `data->'weeks'->...` JSONB paths. Acceptable while the block
 *        is a coach-side draft; we publish to the normalized schema
 *        only when assigned to an athlete (out of scope for Phase 2).
 *
 *   3. Pure JSONB blob
 *      - One column, no indexable scalars. Rejected — RLS by athlete and
 *        listing "all my drafts" become full table scans.
 *
 * Required migration (run before this hook is used)
 * -------------------------------------------------
 * ```sql
 * CREATE TABLE public.program_blocks (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   coach_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 *   athlete_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 *   name        TEXT NOT NULL,
 *   goal        TEXT NOT NULL,
 *   start_date  DATE NOT NULL,
 *   status      TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived
 *   data        JSONB NOT NULL,                 -- full ProgramBlock document
 *   created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 * CREATE INDEX idx_program_blocks_coach   ON public.program_blocks(coach_id);
 * CREATE INDEX idx_program_blocks_athlete ON public.program_blocks(athlete_id);
 * ALTER TABLE public.program_blocks ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "coaches manage own blocks" ON public.program_blocks
 *   FOR ALL TO authenticated
 *   USING  (coach_id = auth.uid())
 *   WITH CHECK (coach_id = auth.uid());
 * ```
 *
 * The migration is applied and `program_blocks` is part of the generated
 * `Database` type (`src/integrations/supabase/types.ts`), so the client
 * below is fully typed.
 */

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ProgramBlock } from "@/types/training";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type SaveProgramBlockStatus = "draft" | "published" | "archived";

export interface SaveProgramBlockInput {
  block: ProgramBlock;
  /** Defaults to 'draft' — the typical autosave path. */
  status?: SaveProgramBlockStatus;
}

export interface SaveProgramBlockResult {
  id: string;
  updated_at: string;
}

/**
 * Typed error categories so the UI can branch (toast vs. login redirect
 * vs. retry button). Always thrown — never returned — so React Query's
 * `mutation.error` is well-typed.
 */
export type SaveProgramBlockErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_BLOCK"
  | "NETWORK"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

export class SaveProgramBlockError extends Error {
  readonly code: SaveProgramBlockErrorCode;
  readonly cause?: unknown;
  constructor(code: SaveProgramBlockErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "SaveProgramBlockError";
    this.code = code;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Lightweight runtime validation — catches obvious shape bugs early. */
function validateBlock(block: ProgramBlock): void {
  if (!block || typeof block !== "object") {
    throw new SaveProgramBlockError("INVALID_BLOCK", "Block is missing.");
  }
  if (!block.id) {
    throw new SaveProgramBlockError("INVALID_BLOCK", "Block id is required.");
  }
  if (!block.name?.trim()) {
    throw new SaveProgramBlockError("INVALID_BLOCK", "Block name is required.");
  }
  if (!Array.isArray(block.weeks)) {
    throw new SaveProgramBlockError("INVALID_BLOCK", "Block.weeks must be an array.");
  }
  if (!block.start_date) {
    throw new SaveProgramBlockError("INVALID_BLOCK", "Block.start_date is required.");
  }
}

/** Map a Supabase PostgrestError to one of our typed error codes. */
function classifySupabaseError(err: { code?: string; message: string }): SaveProgramBlockError {
  // Postgres permission / RLS denial.
  if (err.code === "42501" || /permission denied|row-level security/i.test(err.message)) {
    return new SaveProgramBlockError(
      "PERMISSION_DENIED",
      "You do not have permission to save this block.",
      err,
    );
  }
  // PostgREST/network-ish failures bubble up with no code.
  if (!err.code) {
    return new SaveProgramBlockError("NETWORK", err.message, err);
  }
  return new SaveProgramBlockError("UNKNOWN", err.message, err);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook to persist a `ProgramBlock` to Supabase as a single
 * UPSERTed JSONB document.
 *
 * @example
 * const { saveBlock, isPending, error } = useSaveProgramBlock();
 *
 * const handleSave = async () => {
 *   try {
 *     const { id } = await saveBlock(block);
 *     toast({ title: 'Saved', description: `Block ${id}` });
 *   } catch (e) {
 *     if (e instanceof SaveProgramBlockError && e.code === 'UNAUTHENTICATED') {
 *       navigate('/auth');
 *     } else {
 *       toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
 *     }
 *   }
 * };
 */
export function useSaveProgramBlock(): UseMutationResult<
  SaveProgramBlockResult,
  SaveProgramBlockError,
  SaveProgramBlockInput | ProgramBlock
> & {
  /** Convenience wrapper accepting either a bare block or a full input. */
  saveBlock: (input: ProgramBlock | SaveProgramBlockInput) => Promise<SaveProgramBlockResult>;
} {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    SaveProgramBlockResult,
    SaveProgramBlockError,
    SaveProgramBlockInput | ProgramBlock
  >({
    mutationFn: async (raw) => {
      // Normalise input — callers can pass a bare ProgramBlock for ergonomics.
      const { block, status = "draft" }: SaveProgramBlockInput =
        "block" in raw ? raw : { block: raw };

      validateBlock(block);

      // Get the current coach. We fetch this fresh per save (rather than
      // caching) so token rotation / sign-out is honoured immediately.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new SaveProgramBlockError(
          "UNAUTHENTICATED",
          "Could not verify your session.",
          authError,
        );
      }
      if (!user) {
        throw new SaveProgramBlockError(
          "UNAUTHENTICATED",
          "You must be signed in to save a program.",
        );
      }

      // Stamp updated_at so the in-memory store can stay in sync after save.
      const nowISO = new Date().toISOString();
      const blockToSave: ProgramBlock = { ...block, updated_at: nowISO };

      // UPSERT on `id` — same call handles both first save and subsequent
      // edits. Atomic by virtue of being a single row write.
      const { data, error } = await supabase
        .from("program_blocks")
        .upsert(
          {
            id: blockToSave.id,
            coach_id: user.id,
            athlete_id: blockToSave.athlete_id ?? null,
            name: blockToSave.name,
            goal: blockToSave.goal,
            start_date: blockToSave.start_date,
            status,
            // ProgramBlock has no string index signature, so it does not
            // satisfy the generated `Json` type structurally; the document
            // is JSON-serializable by construction (plain data, no methods).
            data: blockToSave as unknown as Json, // entire document goes here
            updated_at: nowISO,
          },
          { onConflict: "id" },
        )
        .select("id, updated_at")
        .single();

      if (error) {
        throw classifySupabaseError(error);
      }
      if (!data) {
        throw new SaveProgramBlockError("UNKNOWN", "Save returned no row.");
      }

      return {
        id: data.id as string,
        updated_at: data.updated_at as string,
      };
    },
    onSuccess: (result, variables) => {
      // Invalidate any list views that show this block.
      queryClient.invalidateQueries({ queryKey: ["program-blocks"] });
      queryClient.invalidateQueries({
        queryKey: ["program-block", result.id],
      });
      // If saving for a specific athlete, refresh their assigned-program views.
      const block = "block" in variables ? variables.block : variables;
      if (block.athlete_id) {
        queryClient.invalidateQueries({
          queryKey: ["athlete-programs", block.athlete_id],
        });
      }
    },
  });

  // Stable convenience wrapper. Returns the awaited result instead of the
  // mutation object so callers can `await saveBlock(block)` ergonomically.
  const saveBlock = (input: ProgramBlock | SaveProgramBlockInput) => mutation.mutateAsync(input);

  return Object.assign(mutation, { saveBlock });
}

// ---------------------------------------------------------------------------
// Cache-key helpers (exported for invalidation from sibling hooks)
// ---------------------------------------------------------------------------

const programBlockQueryKey = (id: string) => ["program-block", id] as const;

const programBlocksListQueryKey = () => ["program-blocks"] as const;
