// Whitelists + primitive validators for the submit-intake payload.
// Enum values are VERBATIM from intake-contract.md (B0-B8) — whitelist-first:
// a value outside these lists never reaches Postgres, so it can never leak
// into the DB logs (art. 9, nc-questionnaire security-review lesson).

export const SCHEMA_VERSION = 1;

export const SHORT = 200;
export const LONG = 4000;

export const ENUMS: Record<string, readonly string[]> = {
  sex: ["maschio", "femmina"],
  pronoun: ["tu_lei", "tu_lui", "voi_loro"],
  stress_level: ["molto_alto", "alto", "medio", "basso", "molto_basso"],
  sleep_quality: ["ottima", "buona", "media", "scarsa", "pessima"],
  recovery_capacity: ["ottima", "buona", "media", "scarsa", "pessima"],
  neat_steps: ["<5000", "5000-7500", "7500-10000", "10000-12500", ">12500"],
  experience_level: ["novizio", "principiante", "intermedio", "avanzato", "master"],
  workload: ["molto_basso", "basso", "medio", "alto", "molto_alto"],
  max_days_week: ["2", "3", "4", "5", "6"],
  work_mode: ["presenza", "remoto", "ibrido", "app"],
  diet_assessment: ["iper", "iso", "ipo", "non_so"],
  pregnancy: ["si", "no", "na"],
  cycle_status: ["regolare", "irregolare", "assente_3m", "menopausa", "contraccezione_ormonale"],
};

/** The 6 consent types collected at intake (ai_processing is parked — CORE §6). */
export const CONSENT_TYPES = [
  "health_required",
  "non_medical_disclaimer",
  "nutrition_advice",
  "photos_measurements",
  "medical_sharing",
  "marketing",
] as const;

export interface Invalid {
  ok: false;
  error: "invalid_payload" | "missing_required_consents";
  field?: string;
}

export const fail = (field: string): Invalid => ({ ok: false, error: "invalid_payload", field });

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isBool = (v: unknown): v is boolean => typeof v === "boolean";
export const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
export const isDateStr = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
};
export const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
export const isNumIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export type Spec = ["text" | "long" | "enum" | "bool", boolean]; // [kind, required]

/**
 * Copies whitelisted keys from src into a sanitized object (unknown keys are
 * dropped). Returns the offending key on the first violation, null otherwise.
 */
export function copySection(
  src: Record<string, unknown>,
  out: Record<string, unknown>,
  specs: Record<string, Spec>,
): string | null {
  for (const [key, [kind, required]] of Object.entries(specs)) {
    const v = src[key];
    if (v === undefined || v === null || v === "") {
      if (required) return key;
      continue;
    }
    if (kind === "bool") {
      if (!isBool(v)) return key;
      out[key] = v;
    } else if (kind === "enum") {
      if (typeof v !== "string" || !ENUMS[key]?.includes(v)) return key;
      out[key] = v;
    } else {
      const max = kind === "long" ? LONG : SHORT;
      if (!isText(v, max)) return key;
      out[key] = (v as string).trim();
    }
  }
  return null;
}

/** Free-text/enum sections of the intake record (contract B4/B5/B3/B7/B6). */
export const SECTION_SPECS: Record<string, Record<string, Spec>> = {
  lifestyle: {
    work_desc: ["long", false],
    stress_level: ["enum", false],
    sleep_hours: ["text", false],
    sleep_quality: ["enum", false],
    neat_steps: ["enum", false],
    water_liters: ["text", false],
    alcohol_week: ["text", false],
    smoking: ["text", false],
    lifestyle_goal: ["long", false],
  },
  training: {
    sports_history: ["long", false],
    current_sport: ["text", false],
    favorite_activity: ["text", false],
    barbell_experience: ["long", false],
    experience_level: ["enum", false],
    workload: ["enum", false],
    recovery_capacity: ["enum", false],
    max_days_week: ["enum", false],
    session_minutes: ["text", false],
    recent_maxes: ["long", false],
  },
  goals: {
    main_goal: ["long", true],
    weight_history: ["long", false],
    weight_target: ["text", false],
    aesthetic_goal: ["long", false],
    deadline_event: ["text", false],
    movement_goal: ["long", false],
  },
  logistics: {
    work_mode: ["enum", false],
    availability: ["long", false],
    why_now: ["long", false],
    past_coaching: ["long", false],
    foreseen_obstacles: ["long", false],
    success_definition: ["long", false],
    support_network: ["text", false],
  },
};

export const NUTRITION_SPECS: Record<string, Spec> = {
  diet_assessment: ["enum", false],
  meals_desc: ["long", false],
  diet_history: ["long", false],
  foods_love_avoid: ["long", false],
  intolerances: ["long", false],
  supplements: ["long", false],
  who_cooks: ["text", false],
};

/**
 * Contract levels not covered by the engine's EXPERIENCE_MAP (assembleWeek.ts)
 * are folded to the nearest covered level at WRITE time; the raw value stays
 * in the intake record. The engine itself is out of scope (VIETATO).
 */
export function experienceForColumn(v: string | undefined): string | undefined {
  if (v === "novizio") return "principiante";
  if (v === "master") return "avanzato";
  return v;
}
