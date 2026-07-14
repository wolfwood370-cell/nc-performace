// =============================================================================
// src/features/intake/store.ts
// =============================================================================
// Draft store for the in-progress intake (Zustand + persist, the documented
// pattern for multi-step athlete form state — 02-ATHLETE-APP). The draft
// lives ONLY in the athlete's browser localStorage (save/resume, like the
// legacy wizard) and contains health answers, so (art. 9 hygiene):
//   - it is OWNED by one user: claimOwner() wipes it when a different
//     account logs in on the same browser (shared-device leak);
//   - signOut removes the storage key (useAuth.tsx — key pinned by test);
//   - it is cleared at every terminal outcome (submit success/routed-out/
//     already-submitted) but KEPT on authError and network errors, where
//     nothing was persisted server-side and the athlete must retry.
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createEmptyIntakeState, setAtPath } from "./state";
import type { IntakeFormState } from "./state";

/** Also removed on signOut in src/hooks/useAuth.tsx (literal, pinned by test). */
export const INTAKE_DRAFT_STORAGE_KEY = "intake_draft_v1";

interface IntakeDraftStore {
  form: IntakeFormState;
  stepIndex: number;
  savedAt: string | null;
  /** auth user id the draft belongs to; a different login wipes the draft. */
  ownerId: string | null;
  setField: (path: string, value: unknown) => void;
  setForm: (updater: (form: IntakeFormState) => IntakeFormState) => void;
  setStepIndex: (index: number) => void;
  claimOwner: (userId: string) => void;
  reset: () => void;
}

const emptySlice = () => ({
  form: createEmptyIntakeState(),
  stepIndex: 0,
  savedAt: null as string | null,
});

export const useIntakeDraft = create<IntakeDraftStore>()(
  persist(
    (set) => ({
      ...emptySlice(),
      ownerId: null,
      setField: (path, value) =>
        set((s) => ({ form: setAtPath(s.form, path, value), savedAt: new Date().toISOString() })),
      setForm: (updater) =>
        set((s) => ({ form: updater(s.form), savedAt: new Date().toISOString() })),
      setStepIndex: (stepIndex) => set({ stepIndex }),
      claimOwner: (userId) =>
        set((s) => {
          if (s.ownerId === userId) return s;
          // Different account (or first claim): never surface another
          // user's health answers — adopt fresh state for the new owner.
          return s.ownerId === null
            ? { ...s, ownerId: userId }
            : { ...s, ...emptySlice(), ownerId: userId };
        }),
      reset: () => set({ ...emptySlice(), ownerId: null }),
    }),
    {
      name: INTAKE_DRAFT_STORAGE_KEY,
      version: 1,
      // Deep-merge the persisted draft over fresh defaults so a draft saved
      // by an OLDER shape (missing sections/keys) can never crash the form.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<IntakeDraftStore>;
        const base = createEmptyIntakeState();
        const pf = (p.form ?? {}) as Partial<IntakeFormState>;
        return {
          ...current,
          ...p,
          form: {
            ...base,
            ...pf,
            anagrafica: { ...base.anagrafica, ...pf.anagrafica },
            pain: { ...base.pain, ...pf.pain },
            condition: { ...base.condition, ...pf.condition },
            medications: { ...base.medications, ...pf.medications },
            safety_allergy: { ...base.safety_allergy, ...pf.safety_allergy },
            equipment: { ...base.equipment, ...pf.equipment },
            readiness: { ...base.readiness, ...pf.readiness },
            cycle: { ...base.cycle, ...pf.cycle },
          },
        };
      },
    },
  ),
);

/** Resets the draft AND wipes the persisted copy (terminal outcomes). */
export function clearIntakeDraft(): void {
  useIntakeDraft.getState().reset();
  useIntakeDraft.persist.clearStorage();
}
