// =============================================================================
// src/features/intake/steps/FieldsStep.tsx
// =============================================================================
// Generic renderer for a "fields" step: filters the fields visible for the
// current mode/state and delegates each one to FieldRenderer.
// =============================================================================

import { FieldRenderer } from "../components/FieldRenderer";
import type { StepDef } from "../config/model";
import type { CoachingMode, IntakeFormState } from "../state";
import { fieldVisible } from "../validation";

interface FieldsStepProps {
  step: StepDef;
  form: IntakeFormState;
  mode: CoachingMode;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}

export function FieldsStep({ step, form, mode, errors, onChange }: FieldsStepProps) {
  return (
    <div className="space-y-6">
      {(step.fields ?? [])
        .filter((field) => fieldVisible(field, mode, form))
        .map((field) => (
          <FieldRenderer
            key={field.path}
            field={field}
            form={form}
            error={errors[field.path]}
            onChange={onChange}
          />
        ))}
    </div>
  );
}
