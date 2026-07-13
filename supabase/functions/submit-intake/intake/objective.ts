// objective -> arena seed, per 00-OS/regola-obiettivo-arena.md (validated
// with Nicolo 2026-07-06). The seed is a PROPOSAL for layer 1 (Nicolo
// confirms or overrides); the safety gate (layer 0) always runs first.
// Deterministic: free text is only scanned for explicit tokens, never
// interpreted — on ambiguity the seed carries a [chiedi] flag instead of
// guessing (HARD RULE of the source file).

export const OBJECTIVES = [
  "estetica",
  "dimagrimento",
  "forza",
  "powerlifting",
  "performance_sport",
  "resistenza",
  "generale",
  "altro",
] as const;

export type Objective = (typeof OBJECTIVES)[number];

export function isObjective(value: unknown): value is Objective {
  return typeof value === "string" && (OBJECTIVES as readonly string[]).includes(value);
}

export type Arena =
  | "forza-generale"
  | "ipertrofia"
  | "powerlifting"
  | "condizionamento"
  | "prep-atletica";

export interface ArenaSeed {
  primaria: Arena;
  enfasi?: Arena;
  confidence: "alta" | "media" | "bassa";
  note?: string;
  flags: string[];
}

export interface ArenaContext {
  experienceLevel?: string | null;
  barbellExperience?: string | null;
  recentMaxes?: string | null;
  currentSport?: string | null;
  sportsHistory?: string | null;
}

/** Explicit SBD/meet tokens: only these promote `forza` -> powerlifting. */
const SBD_CONTEXT = /\b(gara|gare|federazione|fipl|ipf|wpc|powerlifting|sbd)\b/i;

const hasText = (v?: string | null): boolean => typeof v === "string" && v.trim().length > 0;

export function deriveArena(objective: Objective, ctx: ArenaContext): ArenaSeed {
  switch (objective) {
    case "estetica":
      return { primaria: "ipertrofia", confidence: "alta", flags: [] };
    case "dimagrimento":
      // Novice -> forza-generale base; deficit is F6's job, never a data point
      // for the intake itself.
      return {
        primaria: ctx.experienceLevel === "novizio" ? "forza-generale" : "ipertrofia",
        enfasi: "condizionamento",
        confidence: "media",
        note: "deficit -> F6",
        flags: [],
      };
    case "forza": {
      const blob = [ctx.barbellExperience, ctx.recentMaxes, ctx.currentSport, ctx.sportsHistory]
        .filter(hasText)
        .join(" ");
      return SBD_CONTEXT.test(blob)
        ? {
            primaria: "powerlifting",
            confidence: "media",
            note: "contesto gara/SBD dal testo libero",
            flags: [],
          }
        : { primaria: "forza-generale", confidence: "alta", flags: [] };
    }
    case "powerlifting":
      return { primaria: "powerlifting", confidence: "alta", flags: [] };
    case "performance_sport": {
      const hasSport = hasText(ctx.currentSport) || hasText(ctx.sportsHistory);
      return hasSport
        ? { primaria: "prep-atletica", confidence: "alta", flags: [] }
        : { primaria: "prep-atletica", confidence: "bassa", flags: ["chiedi_sport"] };
    }
    case "resistenza":
      return { primaria: "condizionamento", confidence: "alta", flags: [] };
    case "generale":
      return {
        primaria: "forza-generale",
        enfasi: "condizionamento",
        confidence: "alta",
        note: "condizionamento leggero",
        flags: [],
      };
    case "altro":
      return { primaria: "forza-generale", confidence: "bassa", flags: ["chiedi"] };
  }
}
