// Single-source consent rules for the AUTONOMOUS release — import-free on
// purpose so the FE bundles it directly (same pattern as the submit-intake
// single-source modules): the required list and the ledger resolution NEVER
// drift between the edge gate and the athlete UI.

/**
 * Consents required BEFORE an automated release (art. 22 GDPR — CORE §6
 * requires explicit consent for the autonomous automated decision).
 * ai_processing exists in the DB enum but is still parked in the intake
 * collection (validateSpec.ts CONSENT_TYPES): un-parking it is a declared
 * GO-LIVE blocker of this slice, tracked in HANDOFF.
 */
export const REQUIRED_RELEASE_CONSENTS = [
  "health_required",
  "non_medical_disclaimer",
  "ai_processing",
] as const;

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

/** Release-consent types NOT currently granted, in required-list order. */
export function missingReleaseConsents(
  rows: ConsentRow[],
  required: readonly string[] = REQUIRED_RELEASE_CONSENTS,
): string[] {
  const state = resolveConsentState(rows);
  return required.filter((type) => state.get(type) !== true);
}
