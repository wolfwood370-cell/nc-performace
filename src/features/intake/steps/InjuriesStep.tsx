// =============================================================================
// src/features/intake/steps/InjuriesStep.tsx
// =============================================================================
// Past injuries as structured rows: canonical zone (15, single-source) +
// status + optional date/note — max 30 rows like the contract. An athlete
// with no injuries simply adds nothing.
// =============================================================================

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CANONICAL_ZONES,
  INJURY_STATUS_LABELS,
  INJURY_STATUSES,
  ZONE_LABELS,
} from "../config/labels";
import { OptionButtons } from "../components/OptionButtons";
import type { InjuryDraft, IntakeFormState } from "../state";

const MAX_INJURIES = 30;
const EMPTY_ROW: InjuryDraft = { zone: "", status: "", injury_date: "", note: "" };

interface InjuriesStepProps {
  form: IntakeFormState;
  errors: Record<string, string>;
  onChangeForm: (updater: (form: IntakeFormState) => IntakeFormState) => void;
}

export function InjuriesStep({ form, errors, onChangeForm }: InjuriesStepProps) {
  const setRow = (index: number, patch: Partial<InjuryDraft>) =>
    onChangeForm((f) => ({
      ...f,
      injuries: f.injuries.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  return (
    <div className="space-y-4">
      {form.injuries.length === 0 && (
        <p className="text-sm text-[var(--nc-muted)]">
          Nessun infortunio da segnalare? Vai pure avanti.
        </p>
      )}
      {form.injuries.map((injury, index) => (
        <div
          key={index}
          className="space-y-3 rounded-2xl border border-[var(--nc-track)] bg-[var(--nc-surface)] p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--nc-ink)]">Infortunio {index + 1}</p>
            <button
              type="button"
              aria-label={`Rimuovi infortunio ${index + 1}`}
              onClick={() =>
                onChangeForm((f) => ({ ...f, injuries: f.injuries.filter((_, i) => i !== index) }))
              }
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--nc-muted)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            <select
              aria-label="Zona"
              value={injury.zone}
              onChange={(e) => setRow(index, { zone: e.target.value as InjuryDraft["zone"] })}
              className="h-12 w-full rounded-2xl border border-[var(--nc-track)] bg-[var(--nc-surface)] px-3 text-sm text-[var(--nc-ink)]"
            >
              <option value="">Zona…</option>
              {CANONICAL_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {ZONE_LABELS[zone]}
                </option>
              ))}
            </select>
            {errors[`injuries.${index}.zone`] && (
              <p className="text-xs font-medium text-destructive">
                {errors[`injuries.${index}.zone`]}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <OptionButtons
              ariaLabel="Stato"
              columns={3}
              options={INJURY_STATUSES.map((status) => ({
                value: status,
                label: INJURY_STATUS_LABELS[status],
              }))}
              value={injury.status || null}
              onChange={(status) => setRow(index, { status: status as InjuryDraft["status"] })}
            />
            {errors[`injuries.${index}.status`] && (
              <p className="text-xs font-medium text-destructive">
                {errors[`injuries.${index}.status`]}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              type="date"
              aria-label="Quando (facoltativo)"
              value={injury.injury_date}
              onChange={(e) => setRow(index, { injury_date: e.target.value })}
              className="h-12"
            />
            {errors[`injuries.${index}.injury_date`] && (
              <p className="text-xs font-medium text-destructive">
                {errors[`injuries.${index}.injury_date`]}
              </p>
            )}
          </div>
          <Input
            type="text"
            aria-label="Note (facoltative)"
            placeholder="Note (es. operato, limita ancora il gesto…)"
            value={injury.note}
            maxLength={500}
            onChange={(e) => setRow(index, { note: e.target.value })}
            className="h-12"
          />
        </div>
      ))}
      {form.injuries.length < MAX_INJURIES && (
        <button
          type="button"
          onClick={() =>
            onChangeForm((f) => ({ ...f, injuries: [...f.injuries, { ...EMPTY_ROW }] }))
          }
          className="h-12 w-full rounded-full border border-[var(--nc-primary)] text-sm font-semibold text-[var(--nc-primary)]"
        >
          + Aggiungi un infortunio
        </button>
      )}
    </div>
  );
}
