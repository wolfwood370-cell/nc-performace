// =============================================================================
// src/features/intake/config/model.ts
// =============================================================================
// Typed model of the config-driven intake form: the form STRUCTURE is data
// (FieldDef/StepDef), mode-awareness is declarative (visibleFor/requiredFor
// per coaching_mode), visibility conditions are data too (Condition — no
// functions in the config). Machine values are resolved through the server
// single-source modules re-exported by ./labels, never hand-copied.
// =============================================================================

import { LONG, SHORT } from "../../../../supabase/functions/submit-intake/intake/validateSpec.ts";
import { ENUM_LABELS, ENUMS, OBJECTIVES } from "./labels";

export { LONG, SHORT };

export type ModeFilter = "both" | "coached" | "autonomous";

/** Declarative visibility condition evaluated against the form state. */
export interface Condition {
  path: string;
  equals?: unknown;
  oneOf?: readonly unknown[];
}

export type FieldKind =
  | "text"
  | "longtext"
  | "enum"
  | "bool"
  | "boolDetail"
  | "number"
  | "date"
  | "scale"
  | "zone"
  | "stringList";

export interface FieldDef {
  /** Unique id == state/payload dot-path (mirrors validate.ts). */
  path: string;
  kind: FieldKind;
  label: string;
  help?: string;
  /** boolDetail: label of the follow-up detail textarea (shown when "Sì"). */
  detailLabel?: string;
  /** enum kind: key into ENUMS, or "objective" (OBJECTIVES). */
  enumKey?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  requiredFor: ModeFilter | "none";
  visibleFor: ModeFilter;
  visibleWhen?: Condition;
  /** Input hints (02-ATHLETE-APP: every input declares inputMode/autoComplete). */
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  autoComplete?: string;
}

export interface StepDef {
  id: string;
  title: string;
  subtitle?: string;
  kind: "fields" | "consents" | "injuries" | "neurotype";
  fields?: FieldDef[];
  visibleFor: ModeFilter;
  visibleWhen?: Condition;
  /** neurotype kind only: 0-based page of 6 statements (5 pages total). */
  page?: number;
}

/** Compact field factory: defaults optional + visible to both modes. */
export function f(
  path: string,
  kind: FieldKind,
  label: string,
  opts: Partial<Omit<FieldDef, "path" | "kind" | "label">> = {},
): FieldDef {
  return { path, kind, label, requiredFor: "none", visibleFor: "both", ...opts };
}

/** Resolves the machine values for an enum field. */
export function enumValues(enumKey: string): readonly string[] {
  if (enumKey === "objective") return OBJECTIVES;
  return ENUMS[enumKey] ?? [];
}

/** Resolves the Italian label of an enum machine value. */
export function enumLabel(enumKey: string, value: string): string {
  return ENUM_LABELS[enumKey]?.[value] ?? value;
}

export function appliesTo(filter: ModeFilter | "none", mode: "coached" | "autonomous"): boolean {
  return filter === "both" || filter === mode;
}
