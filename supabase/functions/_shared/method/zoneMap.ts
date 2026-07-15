// method/zoneMap.ts — ponte zona-infortunio -> muscoli/pattern/posizione/famiglia (gate S0).
// PURO e deterministico. v18 — fonte: §2 di 00-OS/mappa-zona-esclusione.md (riconciliata,
// validata C6): split dorsale (lat/scapolare) / toracica (erettori, deroga mobilita') +
// clamp del tier per-zona (ZONE_BASE) + conform-delta FASE B (polso-mano pressing, addome).

import type { ExerciseRow } from "./types.ts";

/** aggressivo = infortunio in_rehab o fms_exclusion_zone; moderato = chronic. */
export type ZoneTier = "aggressivo" | "moderato";
export interface ExcludedZone {
  zone: string;
  tier: ZoneTier;
}

interface ZoneRule {
  muscoli: string[]; // match ESATTO su muscles/secondary_muscles
  patternForte: string[]; // esclusi in entrambi i tier
  patternCautela: string[]; // esclusi solo tier aggressivo
  famigliaForte?: string[]; // exercise_family esclusa in entrambi i tier
  famigliaCautela?: string[]; // exercise_family esclusa solo tier aggressivo
}

const norm = (s: string) => s.trim().toLowerCase();

/** alias/sinonimo/EN -> zona canonica. */
const ALIAS: Record<string, string> = {
  spalla: "spalla",
  spalle: "spalla",
  shoulder: "spalla",
  deltoide: "spalla",
  deltoidi: "spalla",
  cuffia: "spalla",
  "cuffia dei rotatori": "spalla",
  "rotator cuff": "spalla",
  gomito: "gomito",
  elbow: "gomito",
  epicondilite: "gomito",
  epitrocleite: "gomito",
  "tennis elbow": "gomito",
  "golfer elbow": "gomito",
  "polso-mano": "polso-mano",
  polso: "polso-mano",
  mano: "polso-mano",
  wrist: "polso-mano",
  hand: "polso-mano",
  cervicale: "cervicale",
  collo: "cervicale",
  neck: "cervicale",
  dorsale: "dorsale",
  dorso: "dorsale",
  toracica: "toracica",
  thoracic: "toracica",
  "dorso rigido": "toracica", // solo mobilita'-toracica esplicita; le ambigue restano 'dorsale'
  "schiena alta": "dorsale",
  scapola: "dorsale",
  "upper back": "dorsale",
  "mid back": "dorsale",
  lombare: "lombare",
  "zona lombare": "lombare",
  "schiena bassa": "lombare",
  "low back": "lombare",
  lumbar: "lombare",
  lombalgia: "lombare",
  "mal di schiena": "lombare",
  addome: "addome",
  addominali: "addome",
  abs: "addome",
  abdominal: "addome",
  pancia: "addome",
  core: "addome",
  anca: "anca",
  hip: "anca",
  gluteo: "anca",
  glutei: "anca",
  fianco: "anca",
  inguine: "inguine",
  groin: "inguine",
  adduttori: "inguine",
  pubalgia: "inguine",
  adductor: "inguine",
  ginocchio: "ginocchio",
  knee: "ginocchio",
  rotula: "ginocchio",
  patella: "ginocchio",
  lca: "ginocchio",
  acl: "ginocchio",
  menisco: "ginocchio",
  ischiocrurali: "ischiocrurali",
  hamstring: "ischiocrurali",
  hamstrings: "ischiocrurali",
  "femorale posteriore": "ischiocrurali",
  "coscia posteriore": "ischiocrurali",
  "bicipite femorale": "ischiocrurali",
  quadricipite: "quadricipite",
  quadricipiti: "quadricipite",
  quad: "quadricipite",
  quads: "quadricipite",
  "coscia anteriore": "quadricipite",
  caviglia: "caviglia",
  ankle: "caviglia",
  "distorsione caviglia": "caviglia",
  polpaccio: "polpaccio",
  polpacci: "polpaccio",
  calf: "polpaccio",
  calves: "polpaccio",
  gastrocnemio: "polpaccio",
  soleo: "polpaccio",
  achille: "polpaccio",
  "tendine d'achille": "polpaccio",
  achilles: "polpaccio",
};

/** bucket grossolani FMS -> zone canoniche (dal tipo-app fms_exclusion_zones). */
const COARSE: Record<string, string[]> = {
  upper_body: ["spalla", "gomito", "polso-mano"],
  lower_body: [
    "anca",
    "inguine",
    "ginocchio",
    "ischiocrurali",
    "quadricipite",
    "caviglia",
    "polpaccio",
  ],
  spine: ["cervicale", "dorsale", "toracica", "lombare", "addome"],
  general: ["__general__"],
};

/** zona canonica -> regole. Fonte: mappa v2 §4. spalla = VALIDATA; resto = BOZZA. */
const ZONE_MAP: Record<string, ZoneRule> = {
  spalla: {
    muscoli: [
      "deltoide anteriore",
      "deltoide laterale",
      "deltoide posteriore",
      "cuffia dei rotatori",
    ],
    patternForte: ["push verticale"],
    patternCautela: ["push orizzontale", "pull verticale", "pull orizzontale"],
  },
  gomito: {
    muscoli: ["tricipite", "bicipite brachiale", "brachiale", "avambracci"],
    patternForte: [],
    patternCautela: ["push verticale", "push orizzontale", "pull orizzontale", "pull verticale"],
  },
  "polso-mano": {
    muscoli: ["avambracci"],
    patternForte: [],
    patternCautela: [
      "push verticale",
      "push orizzontale",
      "carry/locomozione",
      "pull verticale",
      "pull orizzontale",
    ],
  },
  cervicale: {
    muscoli: ["trapezio"],
    patternForte: [],
    patternCautela: ["carry/locomozione", "push verticale", "squat"],
  },
  dorsale: {
    muscoli: ["gran dorsale", "trapezio", "romboidi"], // solo lat/scapolare
    patternForte: [],
    patternCautela: ["pull orizzontale", "pull verticale", "carry/locomozione"],
  },
  toracica: {
    muscoli: ["erettori spinali"], // rachide toracico = mobilita' (deroga: ZONE_BASE ceil)
    patternForte: [],
    patternCautela: ["push verticale", "squat", "hip hinge"],
  },
  lombare: {
    muscoli: ["erettori spinali"],
    patternForte: ["hip hinge", "squat", "core flessione", "carry/locomozione"],
    patternCautela: ["core anti-estensione", "core rotazione", "lunge"],
  },
  addome: {
    muscoli: ["retto dell'addome", "trasverso dell'addome", "obliqui"],
    patternForte: ["core flessione", "core rotazione", "core flessione laterale"],
    patternCautela: ["core anti-estensione", "core anti-rotazione", "core anti-flessione laterale"],
  },
  anca: {
    muscoli: ["grande gluteo", "medio gluteo", "ileo-psoas"],
    patternForte: ["squat", "hip hinge", "lunge"],
    patternCautela: ["carry/locomozione"],
  },
  inguine: {
    muscoli: ["adduttori"],
    patternForte: ["lunge"],
    patternCautela: ["squat", "carry/locomozione"],
    famigliaCautela: ["pliometrico"],
  },
  ginocchio: {
    muscoli: ["quadricipiti", "ischiocrurali", "polpacci"],
    patternForte: ["squat", "lunge"],
    patternCautela: ["hip hinge"],
    famigliaForte: ["pliometrico"],
  },
  ischiocrurali: {
    muscoli: ["ischiocrurali"],
    patternForte: ["hip hinge"],
    patternCautela: ["lunge", "squat"],
    famigliaForte: ["pliometrico"],
  },
  quadricipite: {
    muscoli: ["quadricipiti"],
    patternForte: ["squat", "lunge"],
    patternCautela: ["hip hinge"],
    famigliaCautela: ["pliometrico"],
  },
  caviglia: {
    muscoli: ["polpacci"],
    patternForte: ["lunge"],
    patternCautela: ["squat", "carry/locomozione"],
    famigliaForte: ["pliometrico"],
    famigliaCautela: ["ciclico"],
  },
  polpaccio: {
    muscoli: ["polpacci"],
    patternForte: [],
    patternCautela: ["squat"],
    famigliaForte: ["pliometrico"],
    famigliaCautela: ["ciclico"],
  },
};

/**
 * Deroghe cliniche per-zona: `floor` forza 'aggressivo', `ceil` limita a 'moderato'.
 * Si applica PER canonical dentro zoneExcludes (una zona grezza risolve a piu' canonici).
 */
const ZONE_BASE: Record<string, { floor?: ZoneTier; ceil?: ZoneTier }> = {
  "polso-mano": { floor: "aggressivo" }, // pressing su mani: anche chronic -> aggressivo
  toracica: { ceil: "moderato" }, // mobilita': anche in_rehab -> moderato
};
const clampTier = (canonical: string, tier: ZoneTier): ZoneTier => {
  const b = ZONE_BASE[canonical];
  if (!b) return tier;
  if (b.floor === "aggressivo") return "aggressivo";
  if (b.ceil === "moderato" && tier === "aggressivo") return "moderato";
  return tier;
};

/** raw zone -> zone canoniche. []=non risolta (il chiamante applica il fallback). */
export function resolveZone(raw: string): string[] {
  const z = norm(raw);
  if (z in COARSE) return COARSE[z];
  if (z in ALIAS) return [ALIAS[z]];
  return [];
}

/** true se la zona (o una qualsiasi delle sue attive) e' 'general' -> blocca la generazione. */
export function hasGeneralBlock(zones: ExcludedZone[]): boolean {
  return zones.some((z) => resolveZone(z.zone).includes("__general__"));
}

const rowPatterns = (row: ExerciseRow): Set<string> => {
  const out = new Set<string>();
  if (row.movement_pattern) out.add(norm(row.movement_pattern));
  for (const p of row.patterns ?? []) out.add(norm(p));
  return out;
};
const rowMuscles = (row: ExerciseRow): Set<string> => {
  const out = new Set<string>();
  for (const m of row.muscles ?? []) out.add(norm(m));
  for (const m of row.secondary_muscles ?? []) out.add(norm(m));
  return out;
};
const hits = (a: Set<string>, b: string[]): boolean => b.some((x) => a.has(norm(x)));

/**
 * Motivo d'esclusione della riga per le zone infortunate, o null.
 * Fallback conservativo (match a sottostringa, come il vecchio codice) per le
 * zone NON risolte -> non si regredisce mai sotto il comportamento attuale.
 */
export function zoneExcludes(row: ExerciseRow, excluded: ExcludedZone[]): string | null {
  const muscles = rowMuscles(row);
  const patterns = rowPatterns(row);
  const posLoad = (row.attributes?.position_load ?? {}) as Record<string, string>;

  for (const { zone, tier } of excluded) {
    const canonicals = resolveZone(zone);

    if (canonicals.length === 0) {
      // zona non mappata -> fallback vecchio comportamento (sottostringa) + flag.
      const z = norm(zone);
      const hay = [...muscles, ...patterns];
      if (z && hay.some((h) => h.includes(z))) return `zona non mappata '${zone}' (fallback)`;
      continue;
    }

    for (const canonical of canonicals) {
      if (canonical === "__general__") return "zona 'general': rimando / clearance";
      const rule = ZONE_MAP[canonical];
      if (!rule) continue;
      const eff = clampTier(canonical, tier); // deroga per-zona (ZONE_BASE)
      const aggr = eff === "aggressivo";

      if (hits(muscles, rule.muscoli)) return `zona '${canonical}': muscolo coinvolto`;
      if (hits(patterns, rule.patternForte)) return `zona '${canonical}': pattern forte`;
      if (aggr && hits(patterns, rule.patternCautela))
        return `zona '${canonical}': pattern (cautela)`;
      if (rule.famigliaForte?.includes(norm(row.exercise_family)))
        return `zona '${canonical}': famiglia`;
      if (aggr && rule.famigliaCautela?.includes(norm(row.exercise_family)))
        return `zona '${canonical}': famiglia (cautela)`;

      const pos = posLoad[canonical];
      if (pos === "forte") return `zona '${canonical}': posizione (forte)`;
      if (aggr && pos === "cautela") return `zona '${canonical}': posizione (cautela)`;
    }
  }
  return null;
}
