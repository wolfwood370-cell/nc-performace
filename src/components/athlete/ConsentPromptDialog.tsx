// =============================================================================
// src/components/athlete/ConsentPromptDialog.tsx
// =============================================================================
// In-app prompt for the ai_processing consent (art. 22 GDPR): shown when the
// autonomous release comes back `consentRequired` (or from the gate-mirror
// "consent required" card). The legal copy is imported from the intake
// single-source (CONSENT_LABELS — never rewritten here) and is a DRAFT
// pending legal validation (G9): the inline note stays until the text is
// validated.
//
// The component is intentionally dumb (ExitWorkoutDialog pattern): no
// business logic, callbacks only. The parent calls the record_consent RPC
// and retries the release. Backdrop click and Escape mean "not now" — the
// least committing intent for a consent — but are inert while the grant is
// in flight (isPending): a cancel racing an in-flight RPC would tell the
// user "not granted" about a consent that IS being recorded. autoFocus sits
// on "Non ora" so an accidental Enter can never grant consent.
//
// Accessibility: role="dialog" + aria-modal + aria-labelledby/describedby;
// CTA touch targets >= 48px (py-4). Tokens: athlete Tailwind namespace
// (brand/on-surface — same vocabulary as AthleteTraining, no new raw hex).
// =============================================================================

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSENT_LABELS } from "@/features/intake/config/labels";

interface ConsentPromptDialogProps {
  open: boolean;
  /** RPC call or release retry in flight — buttons lock. */
  isPending: boolean;
  /** Grant intent: the parent records the consent and retries the release. */
  onConfirm: () => void;
  /** "Not now" / backdrop / Escape: close without granting. */
  onCancel: () => void;
}

export function ConsentPromptDialog({
  open,
  isPending,
  onConfirm,
  onCancel,
}: ConsentPromptDialogProps) {
  // Escape -> "not now" (never grants; ignored while the RPC is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!isPending) onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-prompt-title"
      aria-describedby="consent-prompt-desc"
      onClick={isPending ? undefined : onCancel}
      className={cn(
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
        <div
          aria-hidden="true"
          className="h-16 w-16 rounded-full bg-brand-container/10 flex items-center justify-center mb-4"
        >
          <ShieldCheck className="h-7 w-7 text-brand-container" strokeWidth={2} />
        </div>

        <h2
          id="consent-prompt-title"
          className="font-display text-xl font-bold tracking-tight text-on-surface text-center mb-2"
        >
          Serve il tuo consenso
        </h2>

        <div id="consent-prompt-desc" className="mb-6">
          <p className="text-sm leading-snug text-on-surface text-center">
            {CONSENT_LABELS.ai_processing}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-on-surface-variant text-center">
            Il consenso è facoltativo: senza, il programma autonomo non può essere rilasciato. Puoi
            concederlo ora o in qualsiasi momento da questa pagina. Testo in attesa di validazione
            legale (bozza).
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={cn(
              "w-full py-4 rounded-full",
              "bg-brand-container text-white",
              "font-display text-sm font-bold tracking-wide",
              "shadow-[0_4px_14px_rgba(34,111,163,0.25)]",
              "transition-all duration-200",
              "hover:brightness-110 active:scale-[0.98]",
              "disabled:opacity-60 disabled:pointer-events-none",
            )}
          >
            {isPending ? "Invio…" : "Acconsento"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            autoFocus
            className={cn(
              "w-full py-4 rounded-full",
              "bg-surface-container text-on-surface",
              "font-display text-sm font-bold tracking-wide",
              "transition-colors hover:bg-surface-variant/60",
              "active:scale-[0.98] transition-transform duration-200",
              "disabled:opacity-60 disabled:pointer-events-none",
            )}
          >
            Non ora
          </button>
        </div>
      </div>
    </div>
  );
}
