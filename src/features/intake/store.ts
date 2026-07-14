// =============================================================================
// src/features/intake/store.ts
// =============================================================================
// Draft store for the in-progress intake (Zustand + persist, the documented
// pattern for multi-step athlete form state — 02-ATHLETE-APP). The draft
// lives ONLY in the athlete's browser localStorage (save/resume, like the
// legacy wizard); it must be cleared at EVERY terminal outcome because it
// contains health answers (art. 9 hygiene).
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createEmptyIntakeState, setAtPath } from "./state";
import type { IntakeFormState } from "./state";

const STORAGE_KEY = "intake_draft_v1";

interface IntakeDraftStore {
  form: IntakeFormState;
  stepIndex: number;
  savedAt: string | null;
  setField: (path: string, value: unknown) => void;
  setForm: (updater: (form: IntakeFormState) => IntakeFormState) => void;
  setStepIndex: (index: number) => void;
  reset: () => void;
}

export const useIntakeDraft = create<IntakeDraftStore>()(
  persist(
    (set) => ({
      form: createEmptyIntakeState(),
      stepIndex: 0,
      savedAt: null,
      setField: (path, value) =>
        set((s) => ({ form: setAtPath(s.form, path, value), savedAt: new Date().toISOString() })),
      setForm: (updater) =>
        set((s) => ({ form: updater(s.form), savedAt: new Date().toISOString() })),
      setStepIndex: (stepIndex) => set({ stepIndex }),
      reset: () => set({ form: createEmptyIntakeState(), stepIndex: 0, savedAt: null }),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);

/** Resets the draft AND wipes the persisted copy (terminal outcomes). */
export function clearIntakeDraft(): void {
  useIntakeDraft.getState().reset();
  useIntakeDraft.persist.clearStorage();
}
