// supabase/functions/_shared/nutrition/consents.ts
// Consent gate for the nutrition loop. The ledger-resolution semantics MIRROR
// release-autonomous-program/release/consents.ts 1:1 (latest row per type
// wins, ISO timestamps compare lexicographically, ties go to the later row,
// missing type = not granted). Re-implemented only because that file lives in
// a folder this slice must not touch — keep the two in sync.

/** Consent required BEFORE any automated nutrition target (art. 9 GDPR). */
export const NUTRITION_REQUIRED_CONSENT = "nutrition_advice" as const;

/** Raw ledger row (consents table): current state = latest row per type. */
export interface ConsentRow {
  consent_type: string;
  granted: boolean;
  created_at: string;
}

/**
 * Current consent state from the append-only ledger: latest row per type wins
 * (ISO timestamps compare lexicographically). Missing type = not granted.
 */
export function resolveConsentState(rows: ConsentRow[]): Map<string, boolean> {
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const row of rows) {
    const prev = latest.get(row.consent_type);
    if (!prev || row.created_at >= prev.created_at) {
      latest.set(row.consent_type, { granted: row.granted, created_at: row.created_at });
    }
  }
  return new Map([...latest.entries()].map(([type, s]) => [type, s.granted]));
}

/** True only if the latest nutrition_advice row grants the consent. */
export function isNutritionConsentGranted(rows: ConsentRow[]): boolean {
  return resolveConsentState(rows).get(NUTRITION_REQUIRED_CONSENT) === true;
}
