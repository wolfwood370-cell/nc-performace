// Selezione esercizi deterministica (mattone dello Strato 4) — modulo PURO:
// le righe arrivano già fetchate (il fetch è M2, in index.ts), nessuna query qui.
// Pipeline: filtri duri -> punteggio pesato -> ordinamento deterministico.
// Determinismo: stesso input -> stesso output (tie-break esplicito su os_id).

import type { ExerciseRow, RankedExercise, SelectionCriteria } from "./types.ts";
import { zoneExcludes } from "./zoneMap.ts";

/**
 * Pesi del punteggio — documentati e tunabili in un punto solo.
 * Regole:
 * - suited_rep_range che fitta il goal (o 'entrambi') è il segnale più forte (+2).
 * - execution_mode uguale a quella preferita per lo slot: +1.
 * - Neurotipo: +1 per ogni methodPref che matcha un attributo reale della riga,
 *   -1 per ogni avoid che matcha (vedi prefMatches per la semantica).
 * - Regola obiettivo: per 'forza' l'instabilità limita il carico -> stability_demand
 *   'bassa' +1 / 'alta' -1; per 'ipertrofia' conta l'accumulo di volume ->
 *   fatigue_cost 'basso' +1 / 'alto' -1. Le altre combinazioni sono neutre
 *   ('scalabile' e 'medio' = 0).
 * - NULL su un enum arricchito = 0 sulla dimensione, MAI esclusione.
 */
export const WEIGHTS = {
  repRangeFit: 2,
  executionMatch: 1,
  neuroPref: 1,
  neuroAvoid: -1,
  stabilityFitForza: 1,
  stabilityMismatchForza: -1,
  fatigueFitIpertrofia: 1,
  fatigueMismatchIpertrofia: -1,
} as const;

/**
 * Sinonimi documentati per il matching neurotipo -> attributi riga.
 * I seed parlano il linguaggio del metodo ("esplosivo"), le righe quello
 * dello schema ("balistico").
 */
const EXECUTION_SYNONYMS: Record<string, string> = {
  esplosivo: "balistico",
};

const norm = (s: string) => s.trim().toLowerCase();

/** Tutti i pattern coperti dalla riga (movement_pattern + patterns[]), normalizzati. */
function rowPatterns(row: ExerciseRow): string[] {
  const out: string[] = [];
  if (row.movement_pattern) out.push(norm(row.movement_pattern));
  for (const p of row.patterns ?? []) out.push(norm(p));
  return out;
}

/** Attributi "matchabili" dal neurotipo: esecuzione, famiglia, pattern. */
function rowAttributes(row: ExerciseRow): Set<string> {
  const attrs = new Set<string>();
  if (row.execution_mode) attrs.add(norm(row.execution_mode));
  attrs.add(norm(row.exercise_family));
  for (const p of rowPatterns(row)) attrs.add(p);
  return attrs;
}

/**
 * Una voce di methodPref/avoid matcha se almeno uno dei suoi token (split su
 * spazi e '/'), diretto o via sinonimo, è un attributo reale della riga.
 * Voci non mappabili ad attributi (es. "olimpica/derivate", "pump-only")
 * semplicemente non matchano: contribuiscono 0, per costruzione.
 */
function prefMatches(entry: string, attrs: Set<string>): boolean {
  const tokens = entry
    .split(/[\s/]+/)
    .map(norm)
    .filter(Boolean);
  return tokens.some((t) => attrs.has(EXECUTION_SYNONYMS[t] ?? t));
}

/**
 * Filtri duri: ritorna i motivi di esclusione (array vuoto = riga fattibile).
 * Esportata per tracciabilità e test; rankExercises la usa internamente.
 */
export function hardFilterReasons(row: ExerciseRow, c: SelectionCriteria): string[] {
  const reasons: string[] = [];

  // 1. Pattern: la riga deve coprire il pattern dello slot.
  const wanted = norm(c.pattern);
  if (!rowPatterns(row).includes(wanted)) {
    reasons.push(`escluso: pattern '${c.pattern}' non coperto`);
  }

  // 2. Equipment: con lista disponibile non vuota, equipment[] della riga deve
  //    esserne un sottoinsieme. Lista vuota = palestra completa, tutto ammesso.
  //    equipment NULL/[] = nessun attrezzo richiesto -> sempre fattibile.
  if (c.availableEquipment.length > 0) {
    const available = new Set(c.availableEquipment.map(norm));
    const missing = (row.equipment ?? []).filter((e) => !available.has(norm(e)));
    if (missing.length > 0) {
      reasons.push(`escluso: attrezzi non disponibili (${missing.join(", ")})`);
    }
  }

  // 3. Complessità tecnica alta esclusa per principiante (NULL non esclude).
  if (c.experienceLevel === "principiante" && row.technical_complexity === "alta") {
    reasons.push("escluso: complessità tecnica alta per principiante");
  }

  // 4. Zone infortunate: ponte zona -> muscoli/pattern/posizione/famiglia (zoneMap).
  const zoneReason = zoneExcludes(row, c.excludedZones);
  if (zoneReason) reasons.push(`escluso: ${zoneReason}`);

  return reasons;
}

/** Punteggio di una riga fattibile, con reasons tracciabili per ogni voce. */
function scoreRow(row: ExerciseRow, c: SelectionCriteria): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [`incluso: copre '${c.pattern}'`];

  if (row.suited_rep_range === c.goalRepRange || row.suited_rep_range === "entrambi") {
    score += WEIGHTS.repRangeFit;
    reasons.push(
      `+${WEIGHTS.repRangeFit} rep-range '${row.suited_rep_range}' fitta '${c.goalRepRange}'`,
    );
  }

  if (c.preferredExecution && row.execution_mode === c.preferredExecution) {
    score += WEIGHTS.executionMatch;
    reasons.push(`+${WEIGHTS.executionMatch} esecuzione '${row.execution_mode}' preferita`);
  }

  const attrs = rowAttributes(row);
  for (const pref of c.neurotype.methodPref) {
    if (prefMatches(pref, attrs)) {
      score += WEIGHTS.neuroPref;
      reasons.push(`+${WEIGHTS.neuroPref} neurotipo: preferenza '${pref}'`);
    }
  }
  for (const avoid of c.neurotype.avoid) {
    if (prefMatches(avoid, attrs)) {
      score += WEIGHTS.neuroAvoid;
      reasons.push(`${WEIGHTS.neuroAvoid} neurotipo: da evitare '${avoid}'`);
    }
  }

  if (c.goalRepRange === "forza") {
    if (row.stability_demand === "bassa") {
      score += WEIGHTS.stabilityFitForza;
      reasons.push(`+${WEIGHTS.stabilityFitForza} stabilità bassa: carico esprimibile (forza)`);
    } else if (row.stability_demand === "alta") {
      score += WEIGHTS.stabilityMismatchForza;
      reasons.push(`${WEIGHTS.stabilityMismatchForza} stabilità alta: limita il carico (forza)`);
    }
  } else {
    if (row.fatigue_cost === "basso") {
      score += WEIGHTS.fatigueFitIpertrofia;
      reasons.push(
        `+${WEIGHTS.fatigueFitIpertrofia} costo di fatica basso: volume accumulabile (ipertrofia)`,
      );
    } else if (row.fatigue_cost === "alto") {
      score += WEIGHTS.fatigueMismatchIpertrofia;
      reasons.push(
        `${WEIGHTS.fatigueMismatchIpertrofia} costo di fatica alto: limita il volume (ipertrofia)`,
      );
    }
  }

  return { score, reasons };
}

/** Confronto stringhe per codepoint (niente localeCompare: dipende dal locale). */
function byOsIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ordina i candidati fattibili per lo slot: filtri duri, poi punteggio.
 * PURO e deterministico: score decrescente, tie-break os_id ascendente.
 */
export function rankExercises(candidates: ExerciseRow[], c: SelectionCriteria): RankedExercise[] {
  const ranked: RankedExercise[] = [];
  for (const row of candidates) {
    if (hardFilterReasons(row, c).length > 0) continue;
    const { score, reasons } = scoreRow(row, c);
    ranked.push({ exercise: row, score, reasons });
  }
  ranked.sort((a, b) => b.score - a.score || byOsIdAsc(a.exercise.os_id, b.exercise.os_id));
  return ranked;
}
