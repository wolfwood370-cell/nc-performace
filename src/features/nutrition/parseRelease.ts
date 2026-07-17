// =============================================================================
// src/features/nutrition/parseRelease.ts
// Defensive parse of the two jsonb payloads of a nutrition_releases row.
// The document has a FIXED shape (14 keys) per the engine contract, but the
// UI must survive rows written by an older/newer schema_version: any missing
// or non-finite core value ⇒ null (the screen degrades, it never crashes and
// never renders NaN). safety_context instead degrades to "no signals" —
// the target is load-bearing, the advisory signals are not.
// =============================================================================

import type {
  CappedBy,
  NutritionDocument,
  NutritionReleaseDbRow,
  ParsedRelease,
  SafetyContextView,
} from "./types";

const CAPPED_BY_VALUES: readonly string[] = [
  "daily_cap",
  "weekly_pct_cap",
  "macro_floor",
  "lifecycle_cap",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const NUMERIC_DOCUMENT_KEYS = [
  "daily_calories",
  "protein_g",
  "carbs_g",
  "fats_g",
  "expenditure_estimate",
  "confidence",
  "logged_days",
  "imputed_days",
  "weight_kg_at_release",
] as const;

const BOOLEAN_DOCUMENT_KEYS = ["fallback_mode", "cold_start", "diet_break_suggested"] as const;

export function parseNutritionDocument(raw: unknown): NutritionDocument | null {
  const doc = asRecord(raw);
  if (!doc) return null;
  for (const key of NUMERIC_DOCUMENT_KEYS) {
    if (!isFiniteNumber(doc[key])) return null;
  }
  for (const key of BOOLEAN_DOCUMENT_KEYS) {
    if (typeof doc[key] !== "boolean") return null;
  }
  // strategy stays an OPEN string on purpose: a future strategy value must
  // not blank the whole screen (only the label pill hides).
  if (typeof doc.strategy !== "string" || typeof doc.computed_for_date !== "string") return null;
  return doc as unknown as NutritionDocument;
}

export function parseSafetyContext(raw: unknown): SafetyContextView {
  const ctx = asRecord(raw) ?? {};
  const cappedRaw = Array.isArray(ctx.capped_by) ? ctx.capped_by : [];
  return {
    capped_by: cappedRaw.filter(
      (value): value is CappedBy => typeof value === "string" && CAPPED_BY_VALUES.includes(value),
    ),
    lifecycle_referral_due: ctx.lifecycle_referral_due === true,
    deficit_streak_weeks: isFiniteNumber(ctx.deficit_streak_weeks) ? ctx.deficit_streak_weeks : 0,
  };
}

export function parseRelease(row: NutritionReleaseDbRow): ParsedRelease | null {
  const document = parseNutritionDocument(row.nutrition_document);
  if (!document) return null;
  return {
    document,
    safety: parseSafetyContext(row.safety_context),
    releasedAt: row.released_at,
  };
}
