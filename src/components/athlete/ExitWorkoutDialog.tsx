// =============================================================================
// src/components/athlete/ExitWorkoutDialog.tsx
// =============================================================================
// Phase 7 — Friction modal shown when the athlete tries to exit an
// active workout session. Adapted from
// exit_workout_confirmation_friction_modal.html.
//
// Three actions, stacked vertically:
//   1. "Riprendi Allenamento"  → primary brand pill, closes the modal
//   2. "Termina e Salva"       → neutral pill, exits the session "as completed"
//   3. "Annulla Workout"       → destructive text-only, exits and discards
//
// The component is intentionally dumb: it owns no business logic. It
// renders nothing when `open === false` and routes user intent to the
// callback props. The parent (`ActiveWorkout`) decides how to navigate
// and what toasts to fire.
//
// Accessibility:
//   - role="dialog" + aria-modal + aria-labelledby + aria-describedby
//   - Backdrop click closes (treated as "Resume" intent — least
//     destructive option, mirrors native iOS/Android sheet behaviour)
//   - Escape key closes (Resume)
//   - Focus trap NOT implemented in this commit — single-purpose
//     bottom-of-stack modal, the keyboard tab order falls through to
//     the three buttons in declaration order which is already correct.
// =============================================================================

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMMSS } from "@/lib/time/duration";

interface ExitWorkoutDialogProps {
  open: boolean;
  /** Current global workout timer, in seconds — rendered live in the body. */
  timerSeconds: number;
  /** Close without changing state (Resume / backdrop / Escape). */
  onResume: () => void;
  /** Confirm finish with save semantics. */
  onFinish: () => void;
  /** Destructive: confirm discard. */
  onDiscard: () => void;
}

export function ExitWorkoutDialog({
  open,
  timerSeconds,
  onResume,
  onFinish,
  onDiscard,
}: ExitWorkoutDialogProps) {
  // Escape key → Resume (least destructive intent).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onResume]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-workout-title"
      aria-describedby="exit-workout-desc"
      onClick={onResume}
      className={cn(
        // Sits above the ActiveWorkout overlay (z-50) so backdrop blur
        // visibly attenuates the workout surface behind it.
        "fixed inset-0 z-[60]",
        "bg-on-surface/40 backdrop-blur-[40px]",
        "flex items-center justify-center p-5",
      )}
    >
      {/* Stop click propagation so taps inside the card don't dismiss. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-sm",
          "bg-white rounded-3xl",
          "border border-[#c0c7d0]/25",
          "shadow-[0_20px_60px_-15px_rgba(80,118,142,0.3)]",
          "p-6 flex flex-col items-center",
        )}
      >
        {/* Icon */}
        <div
          aria-hidden="true"
          className="h-16 w-16 rounded-full bg-surface-container flex items-center justify-center mb-4"
        >
          <TriangleAlert className="h-7 w-7 text-on-surface" strokeWidth={2} />
        </div>

        {/* Title */}
        <h2
          id="exit-workout-title"
          className="font-display text-xl font-bold tracking-tight text-on-surface text-center mb-2"
        >
          Pausa o termina l'allenamento?
        </h2>

        {/* Body — surfaces the live timer to anchor the choice in real cost. */}
        <p id="exit-workout-desc" className="text-sm text-on-surface-variant text-center mb-7">
          Il timer è a{" "}
          <span className="font-display text-base font-bold tabular-nums text-on-surface">
            {formatMMSS(timerSeconds)}
          </span>
          . Cosa vuoi fare?
        </p>

        {/* Action stack */}
        <div className="w-full flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            autoFocus
            className={cn(
              "w-full py-4 rounded-full",
              "bg-brand-container text-white",
              "font-display text-sm font-bold tracking-wide",
              "shadow-[0_4px_14px_rgba(34,111,163,0.25)]",
              "transition-all duration-200",
              "hover:brightness-110 active:scale-[0.98]",
            )}
          >
            Riprendi Allenamento
          </button>

          <button
            type="button"
            onClick={onFinish}
            className={cn(
              "w-full py-4 rounded-full",
              "bg-surface-container text-on-surface",
              "font-display text-sm font-bold tracking-wide",
              "transition-colors hover:bg-surface-variant/60",
              "active:scale-[0.98] transition-transform duration-200",
            )}
          >
            Termina e Salva
          </button>

          <button
            type="button"
            onClick={onDiscard}
            className={cn(
              "w-full py-2 mt-2",
              "font-sans text-xs font-semibold tracking-widest uppercase text-error",
              "transition-opacity hover:opacity-80",
            )}
          >
            Annulla Workout
          </button>
        </div>
      </div>
    </div>
  );
}
