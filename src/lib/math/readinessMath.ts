// Readiness Math — Statistical normalization utilities v2
// Pure TypeScript, zero dependencies.

/**
 * Calculate the arithmetic mean of a numeric array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the population standard deviation.
 * Uses N (not N-1) since we treat the 30-day window as the full population.
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Z-Score: how many standard deviations `current` is from `mean`.
 *
 *   z = (current - mean) / sd
 *
 * Returns 0 when sd is 0 (no variance → on baseline).
 */
export function calculateZScore(current: number, avg: number, sd: number): number {
  if (sd === 0) return 0;
  return (current - avg) / sd;
}

/**
 * Linear normalisation of `value` into [0, 100].
 * Clamps the output so it never leaves the 0-100 range.
 */
export function normalizeMetric(value: number, min: number, max: number): number {
  if (max === min) return 50; // degenerate range → midpoint
  const scaled = ((value - min) / (max - min)) * 100;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

// ── Readiness-specific helpers ────────────────────────────────────────

export type MetricStatus = "optimal" | "low" | "high";

/**
 * Derive a qualitative status from a Z-Score.
 *
 * | Z-Score          | Status    | Meaning                          |
 * |------------------|-----------|----------------------------------|
 * | z ≥ 0            | optimal   | At or above baseline             |
 * | −1 < z < 0       | optimal   | Slightly below, still normal     |
 * | z ≤ −1           | low       | ≥ 1 SD below baseline            |
 * | z ≥ 1.5          | high      | Unusually elevated (parasym.)    |
 */
export function metricStatusFromZ(z: number): MetricStatus {
  if (z <= -1) return "low";
  if (z >= 1.5) return "high";
  return "optimal";
}

/**
 * Convert an HRV Z-Score into a 0-100 sub-score (60 % weight).
 *
 * Mapping (piecewise linear):
 *   z ≤ −2   →  0
 *   z =  0   → 30   (baseline = midpoint of objective band)
 *   z ≥ +2   → 60
 */
export function hrvZToScore(z: number): number {
  const clamped = Math.max(-2, Math.min(2, z));
  // linear from [-2, +2] → [0, 60]
  return Math.round(((clamped + 2) / 4) * 60);
}

/**
 * Convert a Resting HR Z-Score into a 0-20 sub-score.
 * For RHR, *lower* is better, so we invert the z-score.
 *
 *   z ≤ −2  (much lower than baseline) → 20  (great)
 *   z = 0   → 10
 *   z ≥ +2  (elevated)                 → 0   (bad)
 */
export function rhrZToScore(z: number): number {
  const inverted = -z; // flip: lower HR = positive signal
  const clamped = Math.max(-2, Math.min(2, inverted));
  return Math.round(((clamped + 2) / 4) * 20);
}

/**
 * Map subjective inputs (energy, mood, inverted stress, sleep quality)
 * each on a 1-10 scale, to a 0-20 sub-score.
 */
export function subjectiveToScore(
  energy: number,
  mood: number,
  stress: number,
  sleepQuality: number,
): number {
  const energyNorm = (energy - 1) / 9;
  const moodNorm = (mood - 1) / 9;
  const stressNorm = (10 - stress) / 9; // inverted
  const sqNorm = (sleepQuality - 1) / 9;

  const avg = energyNorm * 0.3 + moodNorm * 0.25 + stressNorm * 0.25 + sqNorm * 0.2;
  return Math.round(avg * 20);
}

// ── Composite score ───────────────────────────────────────────────────

export interface ReadinessBreakdown {
  /** Final 0-100 score */
  score: number;
  /** HRV contribution (0-60) */
  hrvComponent: number;
  /** RHR contribution (0-20) */
  rhrComponent: number;
  /** Subjective contribution (0-20) */
  subjectiveComponent: number;
  /** Z-Scores for transparency */
  hrvZ: number;
  rhrZ: number;
  /** Qualitative statuses */
  hrvStatus: MetricStatus;
  rhrStatus: MetricStatus;
}

/**
 * Compute the composite readiness score.
 *
 * Weighting:
 *   60 %  HRV  (objective, z-score driven)
 *   20 %  RHR  (objective, z-score driven, inverted)
 *   20 %  Subjective  (energy, mood, stress, sleep quality)
 *
 * When HRV/RHR data is unavailable, the subjective portion is
 * scaled up to fill the gap (graceful degradation for new users).
 */
export function computeReadiness(params: {
  hrvToday: number | null;
  hrvMean: number;
  hrvSd: number;
  rhrToday: number | null;
  rhrMean: number;
  rhrSd: number;
  energy: number;
  mood: number;
  stress: number;
  sleepQuality: number;
  hasBaseline: boolean;
}): ReadinessBreakdown {
  const subjective = subjectiveToScore(
    params.energy,
    params.mood,
    params.stress,
    params.sleepQuality,
  );

  // No baseline → subjective-only mode (scaled to 0-100)
  if (!params.hasBaseline) {
    const scaled = Math.round((subjective / 20) * 100);
    return {
      score: scaled,
      hrvComponent: 0,
      rhrComponent: 0,
      subjectiveComponent: subjective,
      hrvZ: 0,
      rhrZ: 0,
      hrvStatus: "optimal",
      rhrStatus: "optimal",
    };
  }

  // HRV component
  let hrvComponent = 30; // neutral default if no today's reading
  let hrvZ = 0;
  if (params.hrvToday !== null && params.hrvSd > 0) {
    hrvZ = calculateZScore(params.hrvToday, params.hrvMean, params.hrvSd);
    hrvComponent = hrvZToScore(hrvZ);
  }

  // RHR component
  let rhrComponent = 10; // neutral default
  let rhrZ = 0;
  if (params.rhrToday !== null && params.rhrSd > 0) {
    rhrZ = calculateZScore(params.rhrToday, params.rhrMean, params.rhrSd);
    rhrComponent = rhrZToScore(rhrZ);
  }

  const total = Math.max(0, Math.min(100, hrvComponent + rhrComponent + subjective));

  return {
    score: total,
    hrvComponent,
    rhrComponent,
    subjectiveComponent: subjective,
    hrvZ,
    rhrZ,
    hrvStatus: metricStatusFromZ(hrvZ),
    rhrStatus: metricStatusFromZ(-rhrZ), // invert for RHR semantics
  };
}

// ── Daily check-in composite score ───────────────────────────────────

/**
 * Answers of the athlete's daily check-in, each on the DECLARED 1-10
 * domain (the DB CHECK constraint) — not on the observed slider steps,
 * so a finer slider never changes this formula. `fatigue` and `stress`
 * are inverted axes: 10 = worst.
 *
 * Pain (`has_pain`) and soreness zones are deliberately NOT inputs: a
 * real pain averaged with four good answers would output a reassuring
 * score on the very day it matters (CORE §0.7). They stay beside the
 * score, never inside it.
 */
export interface CheckinAnswers {
  /** Sleep quality, 1-10, higher is better. */
  sleep?: number | null;
  /** Fatigue, 1-10, higher is WORSE. */
  fatigue?: number | null;
  /** Stress, 1-10, higher is WORSE. */
  stress?: number | null;
  /** Mood, 1-10, higher is better. */
  mood?: number | null;
  /** Digestion, 1-10, higher is better. */
  digestion?: number | null;
}

/** Weights decided by Nicolò on 2026-08-22. A missing answer
 *  redistributes its weight over the present ones. */
const CHECKIN_WEIGHTS = {
  sleep: 30,
  fatigue: 25,
  stress: 20,
  mood: 15,
  digestion: 10,
} as const;

type CheckinKey = keyof typeof CHECKIN_WEIGHTS;

const INVERTED_CHECKIN_KEYS: ReadonlySet<CheckinKey> = new Set(["fatigue", "stress"]);

/**
 * Pure composite readiness score from the daily check-in answers.
 *
 * Each present answer is normalised linearly over the declared 1-10
 * domain ((v-1)/9; inverted axes (10-v)/9), weighted, and the weighted
 * mean maps to 0-100. Deterministic: same input → same output.
 *
 * Returns `null` when NO answer is present — absence is never a number,
 * and never 0: zero is a legitimate value of the scale, not a "don't
 * know" (an unanswered check-in must stay distinguishable from a
 * terrible one).
 */
export function computeCheckinScore(answers: CheckinAnswers): number | null {
  let weightSum = 0;
  let weighted = 0;
  for (const key of Object.keys(CHECKIN_WEIGHTS) as CheckinKey[]) {
    const raw = answers[key];
    if (raw == null) continue;
    const v = Math.max(1, Math.min(10, raw));
    const norm = INVERTED_CHECKIN_KEYS.has(key) ? (10 - v) / 9 : (v - 1) / 9;
    weighted += norm * CHECKIN_WEIGHTS[key];
    weightSum += CHECKIN_WEIGHTS[key];
  }
  if (weightSum === 0) return null;
  return Math.round((weighted / weightSum) * 100);
}

// ── Coach-side scale conversion ──────────────────────────────────────

/**
 * THE single conversion point from `daily_metrics.subjective_readiness`
 * (1-10, DB CHECK) to the 0-100 readiness scale. Every coach surface
 * (risk overview, athlete detail) converts through here — two screens
 * reading the same quantity on two different scales is the defect this
 * function exists to remove.
 */
export function subjectiveReadinessToScore(subjective: number): number {
  const v = Math.max(1, Math.min(10, subjective));
  return Math.round(v * 10);
}

// ── Soreness aggregate (display-only) ────────────────────────────────

export type SorenessIntensity = "mild" | "moderate" | "severe";

const SORENESS_INTENSITY_COST: Record<SorenessIntensity, number> = {
  mild: 2,
  moderate: 5,
  severe: 8,
};

/**
 * Aggregate a stored soreness map ({muscle: intensity}) into the 0-10
 * display value the check-in used to derive locally: 10 − average
 * intensity cost. An EMPTY map is an answered "nothing sore" → 10. A
 * null or unreadable map is NOT an answer → null (absent ≠ invented).
 * Display-only: this value never enters `computeCheckinScore`
 * (CORE §0.7).
 */
export function sorenessScoreFromMap(map: unknown): number | null {
  if (map === null || map === undefined) return null;
  if (typeof map !== "object" || Array.isArray(map)) return null;
  const values = Object.values(map);
  if (values.length === 0) return 10;
  const known = values.filter(
    (v): v is SorenessIntensity => v === "mild" || v === "moderate" || v === "severe",
  );
  if (known.length === 0) return null;
  const avg = known.reduce((acc, v) => acc + SORENESS_INTENSITY_COST[v], 0) / known.length;
  return Math.max(0, Math.min(10, 10 - avg));
}

// ── Smart Readiness Insights ─────────────────────────────────────────

/**
 * Generate a deterministic 1-2 sentence coaching insight based on
 * the athlete's daily check-in metrics. Zero-latency, offline-first.
 */
export function generateReadinessInsight(
  score: number,
  inputs: { sleepHours?: number; stress?: number; soreness?: number; mood?: number },
): string {
  // High Risk / Specific Flags
  if (inputs.sleepHours !== undefined && inputs.sleepHours < 6) {
    return "Hai dormito poco. Valuta di ridurre il volume del 10-20% e fai un riscaldamento più lungo per prevenire infortuni.";
  }
  if (inputs.stress !== undefined && inputs.stress > 7) {
    return "Lo stress percepito è alto. Non forzare i massimali oggi: concentrati sull'esecuzione tecnica e sul respiro.";
  }
  if (inputs.soreness !== undefined && inputs.soreness > 7) {
    return "I tuoi muscoli sono ancora molto affaticati. Lavora in 'buffer' (lontano dal cedimento) per favorire il recupero attivo.";
  }
  if (inputs.mood !== undefined && inputs.mood < 4) {
    return "L'umore è basso oggi. Inizia l'allenamento senza troppe aspettative, il movimento ti aiuterà a sentirti meglio.";
  }

  // General Score-based feedback
  if (score >= 80) {
    return "Il tuo recupero è ottimale. Hai il semaforo verde per spingere sull'intensità e puntare a nuovi record.";
  } else if (score >= 60) {
    return "Stato di forma moderato. Mantieni il piano previsto, ma ascolta il tuo corpo se ti senti affaticato a metà sessione.";
  } else {
    return "Fatica accumulata evidente. Oggi l'obiettivo è muoversi: taglia le serie extra e tieni i carichi conservativi.";
  }
}

/** Re-export baseline constant for convenience */
export { READINESS_BASELINE_DAYS } from "./constants";
