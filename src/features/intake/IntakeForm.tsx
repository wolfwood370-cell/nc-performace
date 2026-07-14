// =============================================================================
// src/features/intake/IntakeForm.tsx
// =============================================================================
// Shell of the config-driven intake form (route /onboarding). Reads
// coaching_mode from the profile (fallback coached, mirroring the server),
// resolves the visible steps from the config, gates navigation on the
// client-side UX checks and — on the last step — builds the payload and
// hands it to submit-intake. The UI renders the server outcome, it never
// recomputes gates. Draft save/resume via the persisted Zustand store.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { buildIntakePayload } from "./buildPayload";
import { INTAKE_STEPS, stepIdForServerField } from "./config/intakeForm";
import { IntakeOutcome } from "./IntakeOutcome";
import { clearIntakeDraft, useIntakeDraft } from "./store";
import { submitIntake } from "./submit";
import type { SubmitOutcome } from "./submit";
import type { CoachingMode } from "./state";
import { ConsentsStep } from "./steps/ConsentsStep";
import { FieldsStep } from "./steps/FieldsStep";
import { InjuriesStep } from "./steps/InjuriesStep";
import { stepErrors, visibleSteps } from "./validation";

export default function IntakeForm() {
  const { user, profile, loading, signOut } = useAuth();
  const draft = useIntakeDraft();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [showResume, setShowResume] = useState(() => {
    const s = useIntakeDraft.getState();
    return s.savedAt !== null && s.stepIndex > 0;
  });
  const mainRef = useRef<HTMLElement>(null);

  // Fallback coached mirrors submit-intake/index.ts (legacy invite without mode).
  const mode: CoachingMode = profile?.coaching_mode === "autonomous" ? "autonomous" : "coached";

  const steps = useMemo(() => visibleSteps(INTAKE_STEPS, mode, draft.form), [mode, draft.form]);
  const stepIndex = Math.min(draft.stepIndex, steps.length - 1);
  const step = steps[stepIndex];
  const errors = useMemo(() => stepErrors(step, mode, draft.form), [step, mode, draft.form]);
  const shownErrors = attempted ? errors : {};

  // Prefill the name we already know from the invite-created profile.
  const setField = draft.setField;
  useEffect(() => {
    if (profile?.full_name && useIntakeDraft.getState().form.anagrafica.full_name === "") {
      setField("anagrafica.full_name", profile.full_name);
    }
  }, [profile?.full_name, setField]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [stepIndex]);

  if (loading) {
    return (
      <div className="theme-athlete flex min-h-[100dvh] items-center justify-center bg-[var(--nc-surface)]">
        <p className="text-sm text-[var(--nc-muted)]">Caricamento…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.role === "coach") return <Navigate to="/coach" replace />;
  if (profile?.onboarding_completed) return <Navigate to="/athlete" replace />;

  if (outcome && outcome.kind !== "invalidPayload" && outcome.kind !== "missingConsents") {
    return (
      <div className="theme-athlete min-h-[100dvh] bg-[var(--nc-surface)]">
        <IntakeOutcome outcome={outcome} onRetry={() => setOutcome(null)} onSignOut={signOut} />
      </div>
    );
  }

  const jumpToStep = (stepId: string | null) => {
    if (!stepId) return;
    const index = steps.findIndex((s) => s.id === stepId);
    if (index >= 0) draft.setStepIndex(index);
  };

  const submit = async () => {
    setSubmitting(true);
    const result = await submitIntake(buildIntakePayload(draft.form));
    setSubmitting(false);
    if (result.kind === "invalidPayload") {
      toast.error("Controlla i dati inseriti: c'è un campo non valido.");
      setAttempted(true);
      jumpToStep(result.field ? stepIdForServerField(result.field) : null);
      return;
    }
    if (result.kind === "missingConsents") {
      toast.error("Mancano i consensi necessari per proseguire.");
      setAttempted(true);
      jumpToStep("consensi");
      return;
    }
    if (result.kind !== "error") clearIntakeDraft();
    setOutcome(result);
  };

  const next = () => {
    if (Object.keys(errors).length > 0) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    if (stepIndex === steps.length - 1) {
      void submit();
    } else {
      draft.setStepIndex(stepIndex + 1);
    }
  };

  const back = () => {
    setAttempted(false);
    if (stepIndex > 0) draft.setStepIndex(stepIndex - 1);
  };

  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="theme-athlete flex min-h-[100dvh] flex-col bg-[var(--nc-surface)] text-[var(--nc-ink)]">
      <header className="mx-auto w-full max-w-lg px-5 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nc-muted)]">
          Passo {stepIndex + 1} di {steps.length}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold">{step.title}</h1>
        {step.subtitle && <p className="mt-1 text-sm text-[var(--nc-muted)]">{step.subtitle}</p>}
        <div className="mt-3 h-1.5 w-full rounded-full bg-[var(--nc-track)]">
          <div
            className="h-1.5 rounded-full bg-[var(--nc-primary)] transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <main ref={mainRef} className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-5 pb-36">
        {step.kind === "consents" && (
          <ConsentsStep form={draft.form} errors={shownErrors} onChange={draft.setField} />
        )}
        {step.kind === "fields" && (
          <FieldsStep
            step={step}
            form={draft.form}
            mode={mode}
            errors={shownErrors}
            onChange={draft.setField}
          />
        )}
        {step.kind === "injuries" && (
          <InjuriesStep form={draft.form} errors={shownErrors} onChangeForm={draft.setForm} />
        )}
        {/* kind === "neurotype" lands with the autonomous slice (tappa 3). */}
        {attempted && Object.keys(errors).length > 0 && (
          <p className="mt-4 text-sm font-medium text-destructive">
            Completa i campi segnalati per continuare.
          </p>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--nc-track)] bg-[var(--nc-surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg gap-3 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={back}
              disabled={submitting}
              className="h-12 flex-1 rounded-full border border-[var(--nc-track)] text-sm font-semibold text-[var(--nc-ink)]"
            >
              Indietro
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={submitting}
            className="h-12 flex-[2] rounded-full bg-[var(--nc-primary)] text-sm font-semibold text-[var(--nc-surface)] disabled:opacity-60"
          >
            {submitting ? "Invio…" : isLast ? "Invia" : "Avanti"}
          </button>
        </div>
      </footer>

      <Dialog open={showResume} onOpenChange={(open) => !open && setShowResume(false)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>Riprendere da dove eri rimasto?</DialogTitle>
            <DialogDescription>
              Abbiamo trovato risposte salvate su questo dispositivo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button
              type="button"
              onClick={() => setShowResume(false)}
              className="h-12 w-full rounded-full bg-[var(--nc-primary)] text-sm font-semibold text-[var(--nc-surface)]"
            >
              Riprendi
            </button>
            <button
              type="button"
              onClick={() => {
                clearIntakeDraft();
                setShowResume(false);
              }}
              className="h-12 w-full rounded-full border border-[var(--nc-track)] text-sm font-semibold text-[var(--nc-ink)]"
            >
              Ricomincia da capo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
