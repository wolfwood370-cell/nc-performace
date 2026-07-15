// Forma B deterministica del metodo di Nicolo (M2) — modulo PURO come M1:
// niente Supabase/rete/Date/Math.random. index.ts fa i fetch e passa AssembleInput.
// I 5 strati:
//   S0 gate di sicurezza  -> helper puri (safetyGate, buildExcludedZones) usati da index.ts
//   S1 obiettivo = arena  -> normalizeGoal / normalizeExperience (mappe documentate)
//   S2 telaio di seduta   -> SPLITS: slot [pattern | ruolo] per days_per_week
//   S3 nucleo dato-adattivo -> PRESCRIPTIONS (ruolo x goal) + seed neurotipo (feed-forward)
//   S4 fattibilita' + selezione -> parseEquipment + rankExercises (M1)
// Il seed neurotipo NON comanda: inclina i default; il dato misurato (loop RTS,
// fuori da M2) li modulera' a settimane.

import { percent1RM } from "./rpeTable.ts";
import { neurotypeSeed } from "./neurotypeSeed.ts";
import { rankExercises } from "./exerciseSelection.ts";
import type { ExerciseRow, ExperienceLevel, SelectionCriteria } from "./types.ts";
import type { ExcludedZone, ZoneTier } from "./zoneMap.ts";

// ---------------------------------------------------------------------------
// Tipi (contratto)
// ---------------------------------------------------------------------------

/** Riga candidata: ExerciseRow (M1) + l'uuid di exercises.id per l'output. */
export type CandidateRow = ExerciseRow & { id: string };

export interface AssembleInput {
  focusGoal: string;
  daysPerWeek: number;
  equipmentRaw: string | null;
  mode: "new" | "continue";
  experienceLevel: string | null;
  /** Fallback per derivare experienceLevel (onboarding_data.training_age). */
  trainingAge?: string | null;
  neurotype: string | null;
  excludedZones: ExcludedZone[];
  oneRmData: Record<string, unknown> | null;
  candidates: CandidateRow[];
}

/** Contratto d'uscita, identico a quello storico della edge fn + exercise_id. */
export interface AiProgramExercise {
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  rpe: number;
  rest_seconds: number;
  notes: string;
}
export interface AiProgramDay {
  day_index: number;
  day_name: string;
  focus: string;
  exercises: AiProgramExercise[];
}
export interface AiProgramResult {
  days: AiProgramDay[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// S0 — Gate di sicurezza (il cancello chiude PRIMA dell'obiettivo)
// ---------------------------------------------------------------------------

/** Messaggi canonici del gate (copy di Nick) — usati anche da index.ts. */
export const GATE_CLEARANCE_REASON =
  "Atleta da valutare: richiede clearance medica prima della generazione (rimando allo specialista)";
export const GATE_RED_FLAGS_REASON =
  "Atleta da valutare: red flag mediche nel questionario — serve il parere dello specialista prima della generazione";
export const NO_CANDIDATES_ERROR =
  "Nessun esercizio disponibile: libreria vuota o tutti esclusi dai filtri (attrezzatura/zone infortunate)";

/**
 * Cancello clearance/red-flags. L'onboarding scrive SEMPRE red_flags come
 * oggetto a 4 chiavi ({medical_clearance_required, medical_yes_questions,
 * fms_exclusion_zones, reduced_systemic_volume}), anche per un atleta sano:
 * si blocca sul CONTENUTO semantico, non sulla presenza dell'oggetto.
 * reduced_systemic_volume modula il volume (iterazione futura), non blocca.
 * Forme legacy (array o stringa non vuoti) restano bloccanti (conservativo).
 */
export function safetyGate(input: { medicalClearanceRequired: boolean; redFlags: unknown }): {
  blocked: boolean;
  reason: string;
} {
  if (input.medicalClearanceRequired) {
    return { blocked: true, reason: GATE_CLEARANCE_REASON };
  }
  const rf = input.redFlags;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    const flags = rf as Record<string, unknown>;
    if (flags.medical_clearance_required === true) {
      return { blocked: true, reason: GATE_CLEARANCE_REASON };
    }
    if (Array.isArray(flags.medical_yes_questions) && flags.medical_yes_questions.length > 0) {
      return { blocked: true, reason: GATE_RED_FLAGS_REASON };
    }
    return { blocked: false, reason: "" };
  }
  const hasLegacyFlags = Array.isArray(rf)
    ? rf.length > 0
    : typeof rf === "string"
      ? rf.trim().length > 0
      : false;
  if (hasLegacyFlags) {
    return { blocked: true, reason: GATE_RED_FLAGS_REASON };
  }
  return { blocked: false, reason: "" };
}

/**
 * Zone infortunate risolte con tier (deterministica: lowercase/trim, dedupe,
 * ordinata per zona). Tier: fms_exclusion_zones e infortuni in_rehab =
 * 'aggressivo' (conservativo); infortuni 'chronic' = 'moderato'. Se una zona
 * ricorre in due tier vince il piu' severo ('aggressivo'). Il filtro sugli
 * stati ('in_rehab'/'chronic' in corso, 'recovered' fuori) lo fa index.ts.
 */
export function buildExcludedZones(
  fmsZones: string[] | null | undefined,
  injuries: { zone: string; status: string }[],
): ExcludedZone[] {
  const tierByZone = new Map<string, ZoneTier>();
  const put = (raw: string, tier: ZoneTier) => {
    const z = raw?.trim().toLowerCase();
    if (!z) return;
    if (tier === "aggressivo" || !tierByZone.has(z)) tierByZone.set(z, tier);
  };
  for (const z of fmsZones ?? []) put(z, "aggressivo"); // FMS = conservativo
  for (const i of injuries) put(i.zone, i.status === "chronic" ? "moderato" : "aggressivo");
  return [...tierByZone.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([zone, tier]) => ({ zone, tier }));
}

// ---------------------------------------------------------------------------
// S1 — Obiettivo = arena (mappa in UN punto solo)
// ---------------------------------------------------------------------------

/** Sinonimi -> goal canonico. 'forza' e' valutata per prima (es. "potenza-forza"). */
const GOAL_SYNONYMS: ReadonlyArray<readonly ["forza" | "ipertrofia", readonly string[]]> = [
  ["forza", ["forza", "strength", "massimale", "potenza"]],
  [
    "ipertrofia",
    ["ipertrofia", "massa", "hypertrophy", "bodybuilding", "ricomposizione", "tonificazione"],
  ],
];

/** focus_goal (testo libero) -> goal canonico. Default 'ipertrofia' (piu' generale/sicuro). */
export function normalizeGoal(focusGoal: string): "forza" | "ipertrofia" {
  const text = focusGoal.trim().toLowerCase();
  for (const [goal, synonyms] of GOAL_SYNONYMS) {
    if (synonyms.some((s) => text.includes(s))) return goal;
  }
  return "ipertrofia";
}

/** Il FE (onboarding) scrive experience_level in INGLESE: mappa EN/IT -> canonico. */
const EXPERIENCE_MAP: Record<string, ExperienceLevel> = {
  principiante: "principiante",
  beginner: "principiante",
  intermedio: "intermedio",
  intermediate: "intermedio",
  avanzato: "avanzato",
  advanced: "avanzato",
};

/**
 * experience_level canonico (accetta i valori EN del FE); altrimenti derivazione
 * best-effort da training_age (testo libero onboarding); default 'intermedio'.
 * 'principiante' attiva il filtro anti-complessita'-alta di rankExercises.
 */
export function normalizeExperience(
  experienceLevel: string | null | undefined,
  trainingAge: string | null | undefined,
): ExperienceLevel {
  const level = experienceLevel?.trim().toLowerCase();
  if (level && level in EXPERIENCE_MAP) return EXPERIENCE_MAP[level];
  const age = trainingAge?.trim().toLowerCase() ?? "";
  if (age) {
    if (/principiante|beginner|mai allenat|nessun|mesi|^<\s*1|^0/.test(age)) return "principiante";
    if (/avanzat|advanced|\b(5|6|7|8|9|10)\+?\s*ann/.test(age)) return "avanzato";
  }
  return "intermedio";
}

// ---------------------------------------------------------------------------
// S2 — Telaio: split -> slot [pattern | ruolo] (tabella deterministica M2)
// ---------------------------------------------------------------------------

type SlotRole = "primary" | "secondary" | "accessory";
interface Slot {
  pattern: string;
  role: SlotRole;
}
interface DayTemplate {
  label: string;
  slots: Slot[];
}

const s = (pattern: string, role: SlotRole): Slot => ({ pattern, role });

const LOWER_A: DayTemplate = {
  label: "Lower A",
  slots: [
    s("squat", "primary"),
    s("hip hinge", "secondary"),
    s("lunge", "accessory"),
    s("core anti-estensione", "accessory"),
  ],
};
const UPPER_A: DayTemplate = {
  label: "Upper A",
  slots: [
    s("push orizzontale", "primary"),
    s("pull orizzontale", "primary"),
    s("push verticale", "secondary"),
    s("isolamento", "accessory"),
  ],
};
const LOWER_B: DayTemplate = {
  label: "Lower B",
  slots: [
    s("hip hinge", "primary"),
    s("squat", "secondary"),
    s("lunge", "accessory"),
    s("core anti-rotazione", "accessory"),
  ],
};
const UPPER_B: DayTemplate = {
  label: "Upper B",
  slots: [
    s("pull verticale", "primary"),
    s("push verticale", "primary"),
    s("pull orizzontale", "secondary"),
    s("isolamento", "accessory"),
  ],
};
const PUSH: DayTemplate = {
  label: "Push",
  slots: [
    s("push orizzontale", "primary"),
    s("push verticale", "secondary"),
    s("isolamento", "accessory"),
    s("core anti-estensione", "accessory"),
  ],
};
const PULL: DayTemplate = {
  label: "Pull",
  slots: [
    s("pull verticale", "primary"),
    s("pull orizzontale", "secondary"),
    s("hip hinge", "secondary"),
    s("isolamento", "accessory"),
  ],
};
const LEGS: DayTemplate = {
  label: "Legs",
  slots: [
    s("squat", "primary"),
    s("hip hinge", "primary"),
    s("lunge", "secondary"),
    s("core anti-rotazione", "accessory"),
  ],
};

const SPLITS: Record<number, DayTemplate[]> = {
  1: [
    {
      label: "Full Body",
      slots: [
        s("squat", "primary"),
        s("hip hinge", "secondary"),
        s("push orizzontale", "primary"),
        s("pull orizzontale", "primary"),
        s("core anti-estensione", "accessory"),
      ],
    },
  ],
  2: [
    {
      label: "Lower",
      slots: [
        s("squat", "primary"),
        s("hip hinge", "secondary"),
        s("lunge", "accessory"),
        s("core anti-rotazione", "accessory"),
      ],
    },
    {
      label: "Upper",
      slots: [
        s("push orizzontale", "primary"),
        s("pull orizzontale", "primary"),
        s("push verticale", "secondary"),
        s("pull verticale", "secondary"),
        s("isolamento", "accessory"),
      ],
    },
  ],
  3: [
    {
      label: "Full Body 1",
      slots: [
        s("squat", "primary"),
        s("push orizzontale", "secondary"),
        s("pull orizzontale", "secondary"),
        s("core anti-estensione", "accessory"),
      ],
    },
    {
      label: "Full Body 2",
      slots: [
        s("hip hinge", "primary"),
        s("push verticale", "secondary"),
        s("pull verticale", "secondary"),
        s("core anti-rotazione", "accessory"),
      ],
    },
    {
      label: "Full Body 3",
      slots: [
        s("squat", "secondary"),
        s("hip hinge", "secondary"),
        s("push orizzontale", "primary"),
        s("pull orizzontale", "primary"),
        s("isolamento", "accessory"),
      ],
    },
  ],
  4: [LOWER_A, UPPER_A, LOWER_B, UPPER_B],
  5: [
    LOWER_A,
    UPPER_A,
    LOWER_B,
    UPPER_B,
    {
      label: "Full / punti deboli",
      slots: [
        s("hip hinge", "secondary"),
        s("push orizzontale", "secondary"),
        s("isolamento", "accessory"),
        s("carry/locomozione", "accessory"),
      ],
    },
  ],
  6: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
};

const SPLIT_NAMES: Record<number, string> = {
  1: "Full Body",
  2: "Lower/Upper",
  3: "Full Body x3",
  4: "Lower/Upper x2",
  5: "Lower/Upper x2 + richiamo",
  6: "Push/Pull/Legs x2",
};

// ---------------------------------------------------------------------------
// S3 — Numeri per ruolo x goal (settimana 1, conservativi, RPE-primary)
// ---------------------------------------------------------------------------

interface Prescription {
  sets: number;
  reps: number;
  rpe: number;
  rest: number;
}

const PRESCRIPTIONS: Record<"forza" | "ipertrofia", Record<SlotRole, Prescription>> = {
  forza: {
    primary: { sets: 4, reps: 4, rpe: 7, rest: 180 },
    secondary: { sets: 3, reps: 6, rpe: 7, rest: 120 },
    accessory: { sets: 3, reps: 10, rpe: 8, rest: 60 },
  },
  ipertrofia: {
    primary: { sets: 3, reps: 8, rpe: 8, rest: 120 },
    secondary: { sets: 3, reps: 12, rpe: 8, rest: 75 },
    accessory: { sets: 3, reps: 15, rpe: 9, rest: 45 },
  },
};

/** Il seed inclina i default: restBias sposta il rest di tabella (min 30s). */
const REST_BIAS_SECONDS: Record<string, number> = { lungo: 30, medio: 0, corto: -15 };
const REST_MIN_SECONDS = 30;

/** Note brevi (IT) per ruolo — deterministiche, dai fatti dello slot. */
const ROLE_NOTES: Record<SlotRole, string> = {
  primary: "Alzata principale: tecnica prima del carico, fermati all'RPE target.",
  secondary: "Complementare: qualità costante, stesso buffer su ogni serie.",
  accessory: "Accessorio: controllo ed esecuzione pulita, recuperi brevi.",
};

// ---------------------------------------------------------------------------
// S4 — Attrezzatura (testo libero -> vocabolario dei 28) e helper 1RM
// ---------------------------------------------------------------------------

/** Vocabolario reale della colonna equipment (28 voci, lowercase). */
export const EQUIPMENT_VOCABULARY: readonly string[] = [
  "atlas stone",
  "axle",
  "bilanciere",
  "bow bar",
  "box",
  "cavi",
  "corpo libero",
  "disco",
  "ez bar",
  "frame",
  "keg",
  "kettlebell",
  "log",
  "macchina",
  "manubri",
  "medicine ball",
  "panca",
  "ruota addominale",
  "safety bar",
  "sandbag",
  "sbarra",
  "slitta",
  "smith machine",
  "stability ball",
  "swiss bar",
  "tire",
  "trap bar",
  "yoke",
];

/**
 * equipment (testo libero) -> sottoinsieme del vocabolario (match per substring,
 * best-effort). Vuoto o niente di riconosciuto = palestra piena = tutto ammesso.
 */
export function parseEquipment(raw: string | null | undefined): string[] {
  const text = raw?.trim().toLowerCase();
  if (!text) return [];
  return EQUIPMENT_VOCABULARY.filter((eq) => text.includes(eq));
}

const normName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * true se one_rm_data ha un 1RM (> 0) per il movimento, match per nome
 * normalizzato (best-effort). Accetta { estimated_1rm: n } o valore numerico.
 */
function hasOneRm(oneRmData: Record<string, unknown> | null, exerciseName: string): boolean {
  if (!oneRmData || typeof oneRmData !== "object") return false;
  const target = normName(exerciseName);
  return Object.entries(oneRmData).some(([key, value]) => {
    if (normName(key) !== target) return false;
    const estimated =
      value && typeof value === "object" ? (value as Record<string, unknown>).estimated_1rm : value;
    return Number(estimated) > 0;
  });
}

// ---------------------------------------------------------------------------
// Assemblaggio settimana (S1 -> S4)
// ---------------------------------------------------------------------------

export function assembleWeek(input: AssembleInput): AiProgramResult {
  const goal = normalizeGoal(input.focusGoal);
  const experience = normalizeExperience(input.experienceLevel, input.trainingAge ?? null);
  const seed = neurotypeSeed(input.neurotype);
  // Giorni agganciati a [1,6] (telaio M2); input non finito -> default 3 (documentato).
  const requestedDays = Number.isFinite(input.daysPerWeek) ? Math.round(input.daysPerWeek) : 3;
  const days = Math.min(6, Math.max(1, requestedDays));
  const availableEquipment = parseEquipment(input.equipmentRaw);
  // Zone gia' risolte con tier a monte (buildExcludedZones); la normalizzazione
  // e la mappa zona->muscoli/pattern vivono in zoneMap (usato da rankExercises).
  const excludedZones = input.excludedZones;

  const restBias = REST_BIAS_SECONDS[seed.restBias] ?? 0;
  // varieta' tollerata -> ruota i rank sugli slot ripetuti; bassa (1A/3) -> stesso gesto.
  const rotateRepeats = seed.varietyTolerance !== "bassa";

  const template = SPLITS[days];
  const patternUse = new Map<string, number>();
  const skippedSlots: string[] = [];

  const outDays: AiProgramDay[] = template.map((day, dayIndex) => {
    const exercises: AiProgramExercise[] = [];

    for (const slot of day.slots) {
      const criteria: SelectionCriteria = {
        pattern: slot.pattern,
        availableEquipment,
        experienceLevel: experience,
        goalRepRange: goal,
        neurotype: seed,
        excludedZones,
        // Compound pesanti = grind; il bias balistico (1B) passa dal punteggio del seed.
        ...(slot.role !== "accessory" ? { preferredExecution: "grind" as const } : {}),
      };

      const ranked = rankExercises(input.candidates, criteria);
      if (ranked.length === 0) {
        skippedSlots.push(`${day.label}: ${slot.pattern}`);
        continue;
      }

      // Slot ripetuti dello stesso pattern nella settimana: rank successivo
      // (modulo sui disponibili) per non ripetere lo stesso esercizio.
      const exposure = patternUse.get(slot.pattern) ?? 0;
      patternUse.set(slot.pattern, exposure + 1);
      const rankIndex = rotateRepeats ? exposure % ranked.length : 0;
      const chosen = ranked[rankIndex].exercise as CandidateRow;

      const prescription = PRESCRIPTIONS[goal][slot.role];
      const rest = Math.max(REST_MIN_SECONDS, prescription.rest + restBias);
      // Carico: %1RM SOLO dalla Tabella RPE (regola OS) se esiste un 1RM per il
      // movimento; altrimenti prescrizione RPE pura. Il mapper legge entrambe.
      const load = hasOneRm(input.oneRmData, chosen.name)
        ? `${percent1RM(prescription.rpe, prescription.reps)}%`
        : `RPE ${prescription.rpe}`;

      exercises.push({
        exercise_id: chosen.id,
        name: chosen.name,
        sets: prescription.sets,
        reps: String(prescription.reps),
        load,
        rpe: prescription.rpe,
        rest_seconds: rest,
        notes: ROLE_NOTES[slot.role],
      });
    }

    return {
      day_index: dayIndex,
      day_name: `Giorno ${dayIndex + 1} · ${day.label}`,
      focus: `${goal === "forza" ? "Forza" : "Ipertrofia"} · ${day.label}`,
      exercises,
    };
  });

  return {
    days: outDays,
    rationale: buildRationale(
      goal,
      days,
      requestedDays,
      seed,
      excludedZones,
      skippedSlots,
      input.mode,
    ),
  };
}

/** Rationale templato DAI FATTI (2-4 frasi, IT). Niente LLM. */
function buildRationale(
  goal: "forza" | "ipertrofia",
  days: number,
  requestedDays: number,
  seed: ReturnType<typeof neurotypeSeed>,
  excludedZones: ExcludedZone[],
  skippedSlots: string[],
  mode: "new" | "continue",
): string {
  const parts: string[] = [];
  parts.push(
    `Settimana ${goal} su ${days} ${days === 1 ? "giorno" : "giorni"} (${SPLIT_NAMES[days]}), assemblata in modo deterministico col metodo: RPE-primary, %1RM dalla Tabella quando esiste un 1RM registrato. Riscaldamento funzionale a inizio seduta a cura del coach.`,
  );
  if (seed.type) {
    parts.push(
      `Neurotipo ${seed.type} (${seed.label}): recuperi ${seed.restBias === "lungo" ? "allungati" : seed.restBias === "corto" ? "accorciati" : "standard"} e ${seed.varietyTolerance === "bassa" ? "stesso gesto sulle esposizioni ripetute" : "varianti ruotate sulle esposizioni ripetute"}.`,
    );
  } else {
    parts.push("Neurotipo non disponibile: default neutri dell'obiettivo.");
  }
  if (requestedDays !== days) {
    parts.push(`Giorni richiesti: ${requestedDays}, generati ${days} (il telaio M2 copre 1-6).`);
  }
  if (excludedZones.length > 0) {
    parts.push(
      `Zone escluse dal gate di sicurezza: ${excludedZones.map((z) => z.zone).join(", ")}.`,
    );
  }
  if (skippedSlots.length > 0) {
    parts.push(`Slot senza candidati in libreria (saltati): ${skippedSlots.join("; ")}.`);
  }
  if (mode === "continue") {
    parts.push(
      "Modalità progressione: l'autoregolazione a settimane (RTS) modulerà i numeri dai dati registrati.",
    );
  }
  return parts.join(" ");
}
