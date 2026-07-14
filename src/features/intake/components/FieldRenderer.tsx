// =============================================================================
// src/features/intake/components/FieldRenderer.tsx
// =============================================================================
// Renders ONE FieldDef by kind. Purely presentational: reads the value via
// the field path, writes back through onChange(path, value). Machine values
// come from the config resolvers (enumValues), labels from config/labels.
// =============================================================================

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CANONICAL_ZONES, ZONE_LABELS } from "../config/labels";
import { enumLabel, enumValues, LONG, SHORT } from "../config/model";
import type { FieldDef } from "../config/model";
import { getAtPath } from "../state";
import type { BoolDetailState, IntakeFormState } from "../state";
import { BoolChoice, OptionButtons } from "./OptionButtons";
import { StringListField } from "./StringListField";

/** Sent when the athlete picks "no mappable zone" — never reaches the payload. */
export const ZONE_OTHER = "altro";

interface FieldRendererProps {
  field: FieldDef;
  form: IntakeFormState;
  error?: string;
  onChange: (path: string, value: unknown) => void;
}

export function FieldRenderer({ field, form, error, onChange }: FieldRendererProps) {
  const value = getAtPath(form, field.path);
  const set = (v: unknown) => onChange(field.path, v);

  const control = (() => {
    switch (field.kind) {
      case "bool":
        return (
          <BoolChoice value={value as boolean | undefined} onChange={set} ariaLabel={field.label} />
        );
      case "boolDetail": {
        const v = value as BoolDetailState;
        return (
          <div className="space-y-2">
            <BoolChoice
              value={v.has}
              onChange={(has) => set({ ...v, has })}
              ariaLabel={field.label}
            />
            {v.has === true && (
              <Textarea
                value={v.detail}
                onChange={(e) => set({ ...v, detail: e.target.value })}
                placeholder={field.detailLabel}
                aria-label={field.detailLabel}
                maxLength={LONG}
                rows={3}
              />
            )}
          </div>
        );
      }
      case "enum": {
        const values = enumValues(field.enumKey ?? "");
        return (
          <OptionButtons
            ariaLabel={field.label}
            options={values.map((v) => ({ value: v, label: enumLabel(field.enumKey ?? "", v) }))}
            value={(value as string) || null}
            onChange={set}
          />
        );
      }
      case "zone":
        return (
          <select
            aria-label={field.label}
            value={(value as string) ?? ""}
            onChange={(e) => set(e.target.value)}
            className="h-12 w-full rounded-2xl border border-[var(--nc-track)] bg-[var(--nc-surface)] px-3 text-sm text-[var(--nc-ink)]"
          >
            <option value="">Scegli una zona…</option>
            {CANONICAL_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {ZONE_LABELS[zone]}
              </option>
            ))}
            <option value={ZONE_OTHER}>Altra zona / non so</option>
          </select>
        );
      case "scale": {
        const min = field.min ?? 0;
        const max = field.max ?? 10;
        const options = Array.from({ length: max - min + 1 }, (_, i) => String(min + i));
        return (
          <OptionButtons
            ariaLabel={field.label}
            columns={6}
            options={options.map((v) => ({ value: v, label: v }))}
            value={typeof value === "number" ? String(value) : null}
            onChange={(v) => set(Number(v))}
          />
        );
      }
      case "stringList":
        return (
          <StringListField
            items={(value as string[]) ?? []}
            onChange={set}
            maxItems={field.max ?? 30}
            maxLength={field.maxLength ?? 60}
            ariaLabel={field.label}
          />
        );
      case "longtext":
        return (
          <Textarea
            value={(value as string) ?? ""}
            onChange={(e) => set(e.target.value)}
            maxLength={field.maxLength ?? LONG}
            rows={4}
            aria-label={field.label}
          />
        );
      case "date":
        return (
          <Input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => set(e.target.value)}
            autoComplete={field.autoComplete}
            aria-label={field.label}
            className="h-12"
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={(value as string) ?? ""}
            onChange={(e) => set(e.target.value)}
            min={field.min}
            max={field.max}
            inputMode={field.inputMode ?? "numeric"}
            aria-label={field.label}
            className="h-12"
          />
        );
      case "text":
        return (
          <Input
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => set(e.target.value)}
            maxLength={field.maxLength ?? SHORT}
            inputMode={field.inputMode}
            autoComplete={field.autoComplete}
            aria-label={field.label}
            className="h-12"
          />
        );
    }
  })();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium leading-snug text-[var(--nc-ink)]">{field.label}</p>
      {field.help && <p className="text-xs text-[var(--nc-muted)]">{field.help}</p>}
      {control}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
