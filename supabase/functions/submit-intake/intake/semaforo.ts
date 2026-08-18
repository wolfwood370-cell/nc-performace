// Deterministic eligibility gate ("semaforo") for the intake — CORE safety,
// both coaching modes. Pure module: no I/O, no Date (age is computed at the
// I/O boundary), no randomness — two runs on the same input give the same
// output (invariant 8). CORE §0.8: hard-stops act on STRUCTURED fields only;
// free text (pain-gesture) can only RAISE caution — see :113-121.
//
// Signal -> effect mapping (decided with Nicolo 2026-07-13):
// - RED (hold): any PAR-Q+ yes · current pain · unintentional weight loss ·
//   DIAGNOSED condition (escalates to Nicolo: coach_alert + hold — NOT an
//   automatic referral). Effect: medical_clearance_required = true + code in
//   red_flags.medical_yes_questions, so the engine gate blocks downstream.
// - RED + routed OUT: DCA flag · pregnancy · minor (<18). The minor case is
//   rejected UPSTREAM without persisting health data (only a lean audit row).
// - YELLOW (alert high, proceeds): pain tied to a movement — with the
//   canonical zone captured for zoneMap protection — · cycle_status
//   assente_3m/menopausa (co-management, coaching stays in-scope).
//   EXCEPTION: pain-gesture WITHOUT a mappable zone in AUTONOMOUS mode ->
//   HOLD for Nicolo (clearance): never proceed silently.
// - NOTE (no gate): medications/supplements · safety allergies (coach data).
// - reduced_systemic_volume: high stress or poor sleep (parity with the
//   legacy wizard rule) — modulates volume downstream, never blocks.
//
// red_flags keeps the CANONICAL 4-key shape the engine gate consumes
// (assembleWeek.ts safetyGate): extra keys are intentionally NOT added.

export type GateLevel = "red" | "yellow" | "green";
export type CoachingMode = "coached" | "autonomous";

export const PARQ_KEYS = [
  "heart",
  "chest_pain",
  "balance",
  "other_chronic",
  "meds",
  "msk",
  "supervised",
] as const;
export type ParqKey = (typeof PARQ_KEYS)[number];

export interface SafetyInput {
  mode: CoachingMode;
  athleteName: string;
  /** Age in full years, computed at the I/O boundary from birth_date. */
  age: number;
  parq: Record<ParqKey, boolean>;
  painNow: boolean;
  /** zone = canonical ZONE_MAP key validated upstream, or null if unmapped. */
  painGesture: { present: boolean; zone: string | null };
  weightLossUnintentional: boolean;
  /** «patologia diagnosticata» — split from medications (Nicolo 2026-07-13). */
  conditionDiagnosed: boolean;
  /** Farmaci/integratori: nota per il coach, mai un gate. */
  medicationsReported: boolean;
  dcaFlag: boolean;
  pregnancy: "si" | "no" | "na" | null;
  cycleStatus: string | null;
  stressLevel: string | null;
  sleepQuality: string | null;
}

export interface CoachAlert {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface CanonicalRedFlags {
  medical_clearance_required: boolean;
  medical_yes_questions: string[];
  fms_exclusion_zones: string[];
  reduced_systemic_volume: boolean;
}

export interface SafetyResult {
  level: GateLevel;
  routedOut: boolean;
  /** Minor case: the caller must reject WITHOUT persisting health data. */
  minor: boolean;
  medicalClearanceRequired: boolean;
  /** Blocking machine codes (mirror of red_flags.medical_yes_questions). */
  reasons: string[];
  /** Non-blocking yellow machine codes (stored in the intake record). */
  yellowSignals: string[];
  redFlags: CanonicalRedFlags;
  alerts: CoachAlert[];
}

const CYCLE_FLAG_VALUES = ["assente_3m", "menopausa"];
const HIGH_STRESS = ["alto", "molto_alto"];
const POOR_SLEEP = ["scarsa", "pessima"];

export function evaluateSafety(input: SafetyInput): SafetyResult {
  const name = input.athleteName.trim() || "L'atleta";
  const alerts: CoachAlert[] = [];

  // --- RED: hold (clearance), athlete stays in the service -----------------
  const plainRed: string[] = [];
  for (const key of PARQ_KEYS) {
    if (input.parq[key]) plainRed.push(`parq_${key}`);
  }
  if (input.painNow) plainRed.push("pain_now"); // dolore ATTUALE = STOP/rinvio, mai auto-injury
  if (input.weightLossUnintentional) plainRed.push("weight_loss_unintentional");

  // --- RED + routed OUT -----------------------------------------------------
  const minor = input.age < 18;
  const routedOutCodes: string[] = [];
  if (minor) routedOutCodes.push("minor");
  if (input.pregnancy === "si") routedOutCodes.push("pregnancy");
  if (input.dcaFlag) routedOutCodes.push("dca_flag");

  // --- YELLOW ---------------------------------------------------------------
  const yellowSignals: string[] = [];
  let unmappedHold = false;
  if (input.painGesture.present) {
    if (input.painGesture.zone) {
      yellowSignals.push("pain_gesture");
    } else if (input.mode === "autonomous") {
      unmappedHold = true; // no coach reads the free text -> hold for Nicolo
    } else {
      yellowSignals.push("pain_gesture_unmapped");
    }
  }
  if (input.cycleStatus && CYCLE_FLAG_VALUES.includes(input.cycleStatus)) {
    yellowSignals.push("cycle_flag");
  }

  const reducedSystemicVolume =
    (input.stressLevel !== null && HIGH_STRESS.includes(input.stressLevel)) ||
    (input.sleepQuality !== null && POOR_SLEEP.includes(input.sleepQuality));

  // --- Blocking set + canonical red_flags -----------------------------------
  const reasons = [
    ...plainRed,
    ...(input.conditionDiagnosed ? ["condition_diagnosed"] : []),
    ...routedOutCodes,
    ...(unmappedHold ? ["pain_gesture_unmapped"] : []),
  ];
  const routedOut = routedOutCodes.length > 0;
  const medicalClearanceRequired = reasons.length > 0;
  const level: GateLevel = medicalClearanceRequired
    ? "red"
    : yellowSignals.length > 0
      ? "yellow"
      : "green";

  // --- Alerts (Nicolo is the safety net, especially in autonomous mode) -----
  if (plainRed.length > 0) {
    alerts.push({
      type: "medical_clearance",
      severity: "high",
      message: `${name}: l'intake ha segnali di sicurezza strutturati — serve valutazione prima del carico.`,
    });
  }
  if (input.conditionDiagnosed) {
    alerts.push({
      type: "condition_review",
      severity: "high",
      message: `${name} riporta una patologia diagnosticata: valuta triage/co-gestione prima del programma.`,
    });
  }
  if (input.dcaFlag) {
    alerts.push({
      type: "dca_screening",
      severity: "high",
      message: `${name}: screening benessere alimentare positivo — instradare a un professionista (nessun punteggio disponibile).`,
    });
  }
  if (input.pregnancy === "si") {
    alerts.push({
      type: "routed_out",
      severity: "high",
      message: `${name} segnala una gravidanza: percorso clinico prima del carico; coaching in-scope se pertinente.`,
    });
  }
  if (minor) {
    alerts.push({
      type: "routed_out",
      severity: "high",
      message: `${name}: intake respinto — requisito di età non soddisfatto. Nessun dato salute registrato.`,
    });
  }
  if (input.painGesture.present) {
    if (input.painGesture.zone) {
      alerts.push({
        type: "pain_gesture",
        severity: "high",
        message: `${name} riporta dolore ricorrente legato a un gesto (zona: ${input.painGesture.zone}) — pattern da co-gestire.`,
      });
    } else if (unmappedHold) {
      alerts.push({
        type: "pain_gesture",
        severity: "high",
        message: `${name}: dolore-gesto senza zona mappata — submission in HOLD, serve la tua revisione.`,
      });
    } else {
      alerts.push({
        type: "pain_gesture",
        severity: "high",
        message: `${name}: dolore-gesto con zona non mappata — leggi il dettaglio nell'intake.`,
      });
    }
  }
  if (yellowSignals.includes("cycle_flag")) {
    alerts.push({
      type: "cycle_flag",
      severity: "high",
      message: `${name}: stato del ciclo da approfondire con specialista (co-gestione female-lifecycle).`,
    });
  }
  if (reducedSystemicVolume) {
    alerts.push({
      type: "reduced_volume",
      severity: "medium",
      message: `${name}: stress/sonno indicano recupero ridotto — considera volume sistemico ridotto.`,
    });
  }

  return {
    level,
    routedOut,
    minor,
    medicalClearanceRequired,
    reasons,
    yellowSignals,
    redFlags: {
      medical_clearance_required: medicalClearanceRequired,
      medical_yes_questions: reasons,
      fms_exclusion_zones: [],
      reduced_systemic_volume: reducedSystemicVolume,
    },
    alerts,
  };
}
