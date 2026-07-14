// =============================================================================
// src/features/intake/steps/NeurotypeStep.tsx
// =============================================================================
// One page (6 statements) of the 30-item neurotype questionnaire. Answers
// are LETTERS A-E keyed q01..q30 (order binding — positional scoring on the
// server). The legend card explains the scale once per page; the buttons
// show only the letter. No group labels anywhere (contract §B8).
// =============================================================================

import {
  NEUROTYPE_ITEMS,
  NEUROTYPE_PER_PAGE,
  NEUROTYPE_SCALE,
  NEUROTYPE_TOTAL,
  neurotypeKey,
} from "../config/neurotypeItems";
import { OptionButtons } from "../components/OptionButtons";
import type { IntakeFormState } from "../state";

interface NeurotypeStepProps {
  /** 0-based page (5 pages of 6). */
  page: number;
  form: IntakeFormState;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

export function NeurotypeStep({ page, form, errors, onChange }: NeurotypeStepProps) {
  const start = page * NEUROTYPE_PER_PAGE;
  const end = Math.min(start + NEUROTYPE_PER_PAGE, NEUROTYPE_TOTAL);
  const answered = Object.values(form.neurotype).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-[var(--nc-track)] bg-[var(--nc-surface)] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nc-muted)]">
            Come rispondere
          </p>
          <p className="text-xs font-bold tabular-nums text-[var(--nc-primary)]">
            {answered} / {NEUROTYPE_TOTAL}
          </p>
        </div>
        {NEUROTYPE_SCALE.map(({ letter, label }) => (
          <div key={letter} className="flex items-baseline gap-2">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[var(--nc-track)] text-xs font-bold text-[var(--nc-deep)]">
              {letter}
            </span>
            <span className="text-[13px] leading-snug text-[var(--nc-muted)]">{label}</span>
          </div>
        ))}
      </div>

      {NEUROTYPE_ITEMS.slice(start, end).map((text, offset) => {
        const n = start + offset + 1;
        const key = neurotypeKey(n);
        const error = errors[`neurotype.${key}`];
        return (
          <div
            key={key}
            className={`space-y-3 rounded-2xl border p-4 ${
              error ? "border-destructive" : "border-[var(--nc-track)]"
            } bg-[var(--nc-surface)]`}
          >
            <p className="text-sm font-medium leading-snug text-[var(--nc-ink)]">
              <span className="mr-2 font-bold text-[var(--nc-muted)]">{n}.</span>
              {text}
            </p>
            <OptionButtons
              ariaLabel={`Affermazione ${n}: ${text}`}
              columns={5}
              options={NEUROTYPE_SCALE.map(({ letter, label }) => ({
                value: letter,
                label: letter,
                ariaLabel: `${letter} – ${label}`,
              }))}
              value={form.neurotype[key] ?? null}
              onChange={(letter) => onChange(`neurotype.${key}`, letter)}
            />
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}
