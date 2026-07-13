// Payload validation at the submit-intake I/O boundary — orchestrator.
// Whitelists/primitives in validateSpec.ts, block validators in
// validateParts.ts. Deterministic and Date-free: age/minor logic lives in
// index.ts (the Date boundary). Unknown keys are DROPPED from the record.

import { isObjective } from "./objective.ts";
import type { ArenaContext, Objective } from "./objective.ts";
import { normalizeNeuroAnswers } from "./neurotype.ts";
import type { DcaAnswers } from "./dca.ts";
import { PARQ_KEYS } from "./semaforo.ts";
import type { CoachingMode, ParqKey } from "./semaforo.ts";
import { isCanonicalZone } from "./zones.ts";
import {
  copySection,
  fail,
  isBool,
  isDateStr,
  isIntIn,
  isNumIn,
  isObj,
  NUTRITION_SPECS,
  SCHEMA_VERSION,
  SECTION_SPECS,
} from "./validateSpec.ts";
import type { Invalid } from "./validateSpec.ts";
import {
  validateConsents,
  validateCycle,
  validateEquipment,
  validateForcedSignal,
  validateInjuries,
} from "./validateParts.ts";
import type { ConsentRow, CycleBlock, InjuryRow } from "./validateParts.ts";

export { CONSENT_TYPES, ENUMS, experienceForColumn, SCHEMA_VERSION } from "./validateSpec.ts";

export interface ValidatedIntake {
  /** Sanitized intake block (only whitelisted keys, trimmed/capped). */
  intakeRecord: Record<string, unknown>;
  consents: ConsentRow[];
  consentVersion: string;
  injuries: InjuryRow[];
  cycle?: CycleBlock;
  extract: {
    birthDate: string;
    sex: string;
    parq: Record<ParqKey, boolean>;
    painNow: boolean;
    painGesture: { present: boolean; zone: string | null };
    weightLossUnintentional: boolean;
    conditionDiagnosed: boolean;
    medicationsReported: boolean;
    dca: DcaAnswers;
    stressLevel: string | null;
    sleepQuality: string | null;
    objective?: Objective;
    experienceLevel?: string;
    neurotypeAnswers?: string[];
    arenaCtx: ArenaContext;
  };
}

export type ValidationResult = { ok: true; data: ValidatedIntake } | Invalid;

export function validateIntakePayload(body: unknown, mode: CoachingMode): ValidationResult {
  if (!isObj(body)) return fail("payload");
  if (body.schema_version !== SCHEMA_VERSION) return fail("schema_version");
  const intake = body.intake;
  if (!isObj(intake)) return fail("intake");

  const record: Record<string, unknown> = {};

  // --- anagrafica -----------------------------------------------------------
  const ana = intake.anagrafica;
  if (!isObj(ana)) return fail("intake.anagrafica");
  const anaOut: Record<string, unknown> = {};
  const badAna = copySection(ana, anaOut, {
    full_name: ["text", false],
    sex: ["enum", true],
    pronoun: ["enum", false],
    phone: ["text", true],
    tax_code: ["text", false],
    address: ["text", false],
  });
  if (badAna) return fail(`intake.anagrafica.${badAna}`);
  if (!isDateStr(ana.birth_date)) return fail("intake.anagrafica.birth_date");
  if (!isNumIn(ana.height_cm, 100, 250)) return fail("intake.anagrafica.height_cm");
  if (!isNumIn(ana.weight_kg, 30, 300)) return fail("intake.anagrafica.weight_kg");
  anaOut.birth_date = ana.birth_date;
  anaOut.height_cm = ana.height_cm;
  anaOut.weight_kg = ana.weight_kg;
  record.anagrafica = anaOut;

  // --- PAR-Q+ (7 bool obbligatori) --------------------------------------------
  const parqSrc = intake.parq;
  if (!isObj(parqSrc)) return fail("intake.parq");
  const parq = {} as Record<ParqKey, boolean>;
  for (const key of PARQ_KEYS) {
    if (!isBool(parqSrc[key])) return fail(`intake.parq.${key}`);
    parq[key] = parqSrc[key] as boolean;
  }
  record.parq = { ...parq };

  // --- dolore (attuale + gesto, con zona canonica opzionale) -------------------
  const pain = intake.pain;
  if (!isObj(pain)) return fail("intake.pain");
  const painOut: Record<string, unknown> = {};
  const badPain = copySection(pain, painOut, {
    pain_now: ["bool", true],
    pain_where: ["long", false],
    pain_gesture: ["bool", true],
    pain_gesture_desc: ["long", false],
  });
  if (badPain) return fail(`intake.pain.${badPain}`);
  if (pain.pain_gesture_zone !== undefined && pain.pain_gesture_zone !== null) {
    if (!isCanonicalZone(pain.pain_gesture_zone)) return fail("intake.pain.pain_gesture_zone");
    painOut.pain_gesture_zone = pain.pain_gesture_zone;
  }
  record.pain = painOut;

  // --- segnali forzati (il vuoto non e' un dato, §E) ---------------------------
  if (!isBool(intake.weight_loss_unintentional)) return fail("intake.weight_loss_unintentional");
  record.weight_loss_unintentional = intake.weight_loss_unintentional;

  const signals = {} as Record<"condition" | "medications" | "safety_allergy", boolean>;
  for (const key of ["condition", "medications", "safety_allergy"] as const) {
    const res = validateForcedSignal(intake, key);
    if ("error" in res) return res;
    record[key] = res.signal;
    signals[key] = res.signal.has;
  }

  // --- DCA (3 bool, entrambe le modalita') -------------------------------------
  const dcaSrc = intake.dca;
  if (!isObj(dcaSrc)) return fail("intake.dca");
  for (const q of ["q1", "q2", "q3"] as const) {
    if (!isBool(dcaSrc[q])) return fail(`intake.dca.${q}`);
  }
  const dca: DcaAnswers = {
    q1: dcaSrc.q1 as boolean,
    q2: dcaSrc.q2 as boolean,
    q3: dcaSrc.q3 as boolean,
  };
  record.dca = { ...dca };

  // --- sezioni testo/enum (B3/B4/B5/B7) ----------------------------------------
  for (const [name, specs] of Object.entries(SECTION_SPECS)) {
    const src = intake[name];
    if (src === undefined) {
      if (name === "goals") return fail("intake.goals"); // main_goal obbligatorio
      continue;
    }
    if (!isObj(src)) return fail(`intake.${name}`);
    const out: Record<string, unknown> = {};
    const bad = copySection(src, out, specs);
    if (bad) return fail(`intake.${name}.${bad}`);
    record[name] = out;
  }

  // --- equipment / righelli / objective / neurotipo ----------------------------
  const equipRes = validateEquipment(intake, mode);
  if ("error" in equipRes) return equipRes;
  record.equipment = equipRes.equipment;

  if (intake.readiness !== undefined) {
    const r = intake.readiness;
    if (!isObj(r) || !isIntIn(r.importance, 0, 10) || !isIntIn(r.confidence, 0, 10)) {
      return fail("intake.readiness");
    }
    record.readiness = { importance: r.importance, confidence: r.confidence };
  } else if (mode === "autonomous") {
    return fail("intake.readiness");
  }

  let objective: Objective | undefined;
  if (intake.objective !== undefined && intake.objective !== null && intake.objective !== "") {
    if (!isObjective(intake.objective)) return fail("intake.objective");
    objective = intake.objective;
    record.objective = objective;
  } else if (mode === "autonomous") {
    return fail("intake.objective"); // Autonoma: nessuno fa il ponte a mano (§G)
  }

  let neurotypeAnswers: string[] | undefined;
  if (intake.neurotype_answers !== undefined) {
    if (!isObj(intake.neurotype_answers)) return fail("intake.neurotype_answers");
    const normalized = normalizeNeuroAnswers(intake.neurotype_answers);
    if (normalized.some((l) => l === "")) return fail("intake.neurotype_answers");
    neurotypeAnswers = normalized;
    record.neurotype_answers = { ...intake.neurotype_answers };
  } else if (mode === "autonomous") {
    return fail("intake.neurotype_answers");
  }

  // --- consensi (cancello) + nutrizione consent-gated ---------------------------
  const consentsRes = validateConsents(body);
  if ("error" in consentsRes) return consentsRes;
  const nutritionGranted = consentsRes.consents.some(
    (c) => c.type === "nutrition_advice" && c.granted,
  );
  if (intake.nutrition !== undefined) {
    if (!nutritionGranted || !isObj(intake.nutrition)) return fail("intake.nutrition");
    const out: Record<string, unknown> = {};
    const bad = copySection(intake.nutrition, out, NUTRITION_SPECS);
    if (bad) return fail(`intake.nutrition.${bad}`);
    record.nutrition = out;
  }

  // --- injuries + ciclo ----------------------------------------------------------
  const injuriesRes = validateInjuries(body);
  if ("error" in injuriesRes) return injuriesRes;
  const cycleRes = validateCycle(body, anaOut.sex as string);
  if ("error" in cycleRes) return cycleRes;

  const training = (record.training ?? {}) as Record<string, unknown>;
  const lifestyle = (record.lifestyle ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      intakeRecord: record,
      consents: consentsRes.consents,
      consentVersion: consentsRes.consentVersion,
      injuries: injuriesRes.injuries,
      cycle: cycleRes.cycle,
      extract: {
        birthDate: anaOut.birth_date as string,
        sex: anaOut.sex as string,
        parq,
        painNow: painOut.pain_now as boolean,
        painGesture: {
          present: painOut.pain_gesture as boolean,
          zone: (painOut.pain_gesture_zone as string | undefined) ?? null,
        },
        weightLossUnintentional: record.weight_loss_unintentional as boolean,
        conditionDiagnosed: signals.condition,
        medicationsReported: signals.medications,
        dca,
        stressLevel: (lifestyle.stress_level as string | undefined) ?? null,
        sleepQuality: (lifestyle.sleep_quality as string | undefined) ?? null,
        objective,
        experienceLevel: training.experience_level as string | undefined,
        neurotypeAnswers,
        arenaCtx: {
          experienceLevel: (training.experience_level as string | undefined) ?? null,
          barbellExperience: (training.barbell_experience as string | undefined) ?? null,
          recentMaxes: (training.recent_maxes as string | undefined) ?? null,
          currentSport: (training.current_sport as string | undefined) ?? null,
          sportsHistory: (training.sports_history as string | undefined) ?? null,
        },
      },
    },
  };
}
