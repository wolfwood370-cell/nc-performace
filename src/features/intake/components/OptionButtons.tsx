// =============================================================================
// src/features/intake/components/OptionButtons.tsx
// =============================================================================
// Touch-first choice controls for the intake form (.theme-athlete tokens,
// 44px+ targets per 02-ATHLETE-APP). Forced-choice semantics: nothing is
// pre-selected, tapping the selected value does NOT unselect it.
// =============================================================================

import { cn } from "@/lib/utils";

export interface ChoiceOption {
  value: string;
  label: string;
  /** Screen-reader label when the visible label alone is cryptic (e.g. "A"). */
  ariaLabel?: string;
}

interface OptionButtonsProps {
  options: ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Grid columns; defaults to a heuristic on label length. */
  columns?: number;
  ariaLabel?: string;
}

export function OptionButtons({
  options,
  value,
  onChange,
  columns,
  ariaLabel,
}: OptionButtonsProps) {
  const longest = Math.max(...options.map((option) => option.label.length));
  const cols = columns ?? (longest <= 3 ? Math.min(options.length, 6) : longest <= 14 ? 2 : 1);
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors",
              selected
                ? "border-[var(--nc-primary)] bg-[var(--nc-primary)] text-[var(--nc-surface)]"
                : "border-[var(--nc-track)] bg-[var(--nc-track)] text-[var(--nc-ink)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface BoolChoiceProps {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  ariaLabel?: string;
}

/** Forced Sì/No — undefined until the athlete answers (§E: empty ≠ datum). */
export function BoolChoice({ value, onChange, ariaLabel }: BoolChoiceProps) {
  return (
    <OptionButtons
      ariaLabel={ariaLabel}
      columns={2}
      options={[
        { value: "si", label: "Sì" },
        { value: "no", label: "No" },
      ]}
      value={value === undefined ? null : value ? "si" : "no"}
      onChange={(v) => onChange(v === "si")}
    />
  );
}
