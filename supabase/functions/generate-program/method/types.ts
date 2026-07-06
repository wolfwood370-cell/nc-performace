// Tipi condivisi del motore-metodo (M1). Moduli PURI: nessuna dipendenza da
// Supabase/rete. Rispecchiano lo schema REALE di public.exercises (954 righe,
// verificato da Cowork sul DB Hub il 2026-07-05).
// NB: le righe importate "MM*" possono avere NULL sugli enum arricchiti ->
// NULL = sconosciuto, MAI motivo di esclusione.

import type { NeurotypeSeed } from "./neurotypeSeed.ts";
import type { ExcludedZone } from "./zoneMap.ts";

export type ExerciseFamily = "forza" | "pliometrico" | "ciclico";
export type ExecutionMode = "grind" | "balistico" | "isometrico";
export type SuitedRepRange = "forza" | "ipertrofia" | "entrambi";
export type FatigueCost = "basso" | "medio" | "alto" | "scalabile";
export type TechnicalComplexity = "bassa" | "media" | "alta";
export type Laterality = "bilaterale" | "unilaterale";
export type StabilityDemand = "bassa" | "media" | "alta";

/** Riga di public.exercises — le sole colonne che il motore usa. */
export interface ExerciseRow {
  os_id: string;
  name: string;
  exercise_family: ExerciseFamily;
  /** Pattern principale (uno dei 15 canonici). */
  movement_pattern: string | null;
  /** Pattern aggiuntivi coperti dall'esercizio. */
  patterns: string[] | null;
  /** Attrezzi richiesti (vocabolario dei 28). NULL/[] = nessun attrezzo richiesto. */
  equipment: string[] | null;
  execution_mode: ExecutionMode | null;
  suited_rep_range: SuitedRepRange | null;
  fatigue_cost: FatigueCost | null;
  technical_complexity: TechnicalComplexity | null;
  laterality: Laterality;
  stability_demand: StabilityDemand | null;
  body_position: string | null;
  lift_phase: string | null;
  muscles: string[] | null;
  secondary_muscles: string[] | null;
  /** attributes jsonb della riga; usato per position_load (gate zone). NULL = nessuno. */
  attributes?: { position_load?: Record<string, string> } | null;
}

export type ExperienceLevel = "principiante" | "intermedio" | "avanzato";

/** Criteri di selezione per uno slot del programma (usati dallo Strato 4). */
export interface SelectionCriteria {
  /** Pattern richiesto dallo slot: uno dei 15 canonici (es. "squat", "hip hinge"). */
  pattern: string;
  /**
   * Attrezzi disponibili all'atleta (vocabolario dei 28).
   * Vuoto = palestra completa: tutto ammesso.
   */
  availableEquipment: string[];
  experienceLevel: ExperienceLevel;
  /** Range del target: confrontato con suited_rep_range ('entrambi' fitta sempre). */
  goalRepRange: "forza" | "ipertrofia";
  /** Esecuzione preferita per lo slot (es. 'balistico' per lavoro esplosivo). */
  preferredExecution?: ExecutionMode;
  /** Seed neurotipo (da neurotypeSeed()); NEUTRAL_SEED se non disponibile. */
  neurotype: NeurotypeSeed;
  /** Zone infortunate risolte (con tier per stato). Vedi zoneMap.zoneExcludes. */
  excludedZones: ExcludedZone[];
}

/** Esercizio fattibile per lo slot, con punteggio e tracciabilità del perché. */
export interface RankedExercise {
  exercise: ExerciseRow;
  score: number;
  /** Motivi leggibili: inclusione e provenienza di ogni bonus/malus. */
  reasons: string[];
}
