// =============================================================================
// src/features/intake/steps/ConsentsStep.tsx
// =============================================================================
// Six granular consent rows (§D: never bundled). Types/order come from the
// server single-source (CONSENT_TYPES); the two required ones gate the whole
// intake and are marked as such. Unchecked = not granted (explicit opt-in).
// Legal copy is a DRAFT pending Nick's approval (see config/labels.ts).
// =============================================================================

import { Checkbox } from "@/components/ui/checkbox";
import { CONSENT_LABELS, CONSENT_TYPES, REQUIRED_CONSENTS } from "../config/labels";
import type { ConsentType } from "../config/labels";
import type { IntakeFormState } from "../state";

interface ConsentsStepProps {
  form: IntakeFormState;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

export function ConsentsStep({ form, errors, onChange }: ConsentsStepProps) {
  return (
    <div className="space-y-3">
      {CONSENT_TYPES.map((type: ConsentType) => {
        const required = REQUIRED_CONSENTS.includes(type);
        const error = errors[`consents.${type}`];
        return (
          <label
            key={type}
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              error ? "border-destructive" : "border-[var(--nc-track)]"
            } bg-[var(--nc-surface)]`}
          >
            <Checkbox
              checked={form.consents[type] === true}
              onCheckedChange={(checked) => onChange(`consents.${type}`, checked === true)}
              className="mt-0.5 h-6 w-6"
              aria-required={required}
            />
            <span className="text-sm leading-snug text-[var(--nc-ink)]">
              {CONSENT_LABELS[type]}
              {required && (
                <span className="mt-1 block text-xs font-semibold text-[var(--nc-primary)]">
                  Necessario per proseguire
                </span>
              )}
              {error && (
                <span className="mt-1 block text-xs font-medium text-destructive">{error}</span>
              )}
            </span>
          </label>
        );
      })}
      <p className="text-xs leading-relaxed text-[var(--nc-muted)]">
        Puoi modificare i consensi facoltativi in qualsiasi momento scrivendo al tuo coach.
        Trattiamo i tuoi dati secondo l&apos;
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[var(--nc-primary)] underline"
        >
          Informativa sulla Privacy
        </a>
        . I dati sulla salute (art. 9 GDPR) sono categorie particolari di dati e sono trattati solo
        per preparare e adattare il tuo programma.
      </p>
    </div>
  );
}
