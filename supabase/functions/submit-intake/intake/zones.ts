// Canonical body zones for the intake injury selector and the pain-gesture
// region capture. MUST stay 1:1 with the ZONE_MAP keys in
// ../../generate-program/method/zoneMap.ts (single source, v18 = 15 zones).
// ZONE_MAP itself is not exported; zones.test.ts guards parity by asserting
// that every zone listed here resolves to itself via resolveZone().

export const CANONICAL_ZONES = [
  "spalla",
  "gomito",
  "polso-mano",
  "cervicale",
  "dorsale",
  "toracica",
  "lombare",
  "addome",
  "anca",
  "inguine",
  "ginocchio",
  "ischiocrurali",
  "quadricipite",
  "caviglia",
  "polpaccio",
] as const;

export type CanonicalZone = (typeof CANONICAL_ZONES)[number];

export function isCanonicalZone(value: unknown): value is CanonicalZone {
  return typeof value === "string" && (CANONICAL_ZONES as readonly string[]).includes(value);
}

/** Allowed `injuries.status` values (CHECK constraint on the table). */
export const INJURY_STATUSES = ["in_rehab", "recovered", "chronic"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export function isInjuryStatus(value: unknown): value is InjuryStatus {
  return typeof value === "string" && (INJURY_STATUSES as readonly string[]).includes(value);
}
