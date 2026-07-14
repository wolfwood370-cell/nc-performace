// =============================================================================
// src/features/intake/config/labels.ts
// =============================================================================
// Italian user-facing copy for the intake form. MACHINE VALUES never live
// here: enum values, consent types, zones and PAR-Q keys are imported from
// the server single-source modules (supabase/functions/submit-intake/intake/*,
// pure and dependency-free — imported, never modified). This file only maps
// machine value -> Italian label.
//
// Copy provenance:
//   - PAR-Q, consents, most field labels: nc-questionnaire
//     docs/intake-contract.md §B0-B7 verbatim (ASCII apostrophes fixed),
//     per Nick's decision 2026-07-14 (point A/C — consents are a DRAFT that
//     Nick approves before merge).
//   - pain/weight-loss/condition/medications texts: decided with Nick
//     2026-07-14 (point B — condition intentionally names no example
//     pathologies: an open list invites false "no" on a gate field).
//   - DCA texts: imported from dca.ts (declared single source for this UI).
// =============================================================================

import {
  CONSENT_TYPES,
  ENUMS,
} from "../../../../supabase/functions/submit-intake/intake/validateSpec.ts";
import { PARQ_KEYS } from "../../../../supabase/functions/submit-intake/intake/semaforo.ts";
import type { ParqKey } from "../../../../supabase/functions/submit-intake/intake/semaforo.ts";
import {
  CANONICAL_ZONES,
  INJURY_STATUSES,
} from "../../../../supabase/functions/submit-intake/intake/zones.ts";
import { OBJECTIVES } from "../../../../supabase/functions/submit-intake/intake/objective.ts";

export { CANONICAL_ZONES, CONSENT_TYPES, ENUMS, INJURY_STATUSES, OBJECTIVES, PARQ_KEYS };
export type { ParqKey };

/** Bumped together with the legal copy (Fase 1 decision, Addendum r.133). */
export const CONSENT_VERSION = "hub-v1";

export type ConsentType = (typeof CONSENT_TYPES)[number];

/** DRAFT legal copy (contract §B0, accents fixed) — Nick approves pre-merge. */
export const CONSENT_LABELS: Record<ConsentType, string> = {
  health_required:
    "Acconsento al trattamento dei miei dati relativi alla salute per la preparazione sportiva (necessario per iniziare)",
  non_medical_disclaimer:
    "Presa d'atto: il servizio ha finalità di benessere fisico, non mediche; Nicolò è un personal trainer, non un medico/nutrizionista, e non li sostituisce",
  nutrition_advice:
    "Desidero ricevere suggerimenti alimentari a supporto dell'allenamento e mi impegno a sottoporli al mio medico",
  photos_measurements: "Autorizzo foto e misurazioni corporee per monitorare i progressi",
  medical_sharing: "Autorizzo la condivisione dei dati col mio medico o altri professionisti",
  marketing: "Desidero ricevere comunicazioni e materiale informativo non essenziali",
};

/** The two consents the server gate requires as true (validateParts.ts). */
export const REQUIRED_CONSENTS: readonly ConsentType[] = [
  "health_required",
  "non_medical_disclaimer",
];

/** PAR-Q+ short form — contract §B2 verbatim, 1:1 with PARQ_KEYS order. */
export const PARQ_LABELS: Record<ParqKey, string> = {
  heart: "Condizione cardiaca o pressione alta?",
  chest_pain: "Dolore al torace a riposo o in attività?",
  balance: "Perso equilibrio per capogiri o perso conoscenza negli ultimi 12 mesi?",
  other_chronic: "Altra condizione medica cronica diagnosticata?",
  meds: "Assumi farmaci prescritti per una condizione cronica?",
  msk: "Problemi a ossa/articolazioni/tessuti molli che potrebbero peggiorare?",
  supervised: "Il medico ti ha detto di fare attività solo sotto supervisione?",
};

/** Italian labels for every machine enum value (validateSpec.ts ENUMS). */
export const ENUM_LABELS: Record<string, Record<string, string>> = {
  sex: { maschio: "Maschio", femmina: "Femmina" },
  pronoun: { tu_lei: "Tu/Lei", tu_lui: "Tu/Lui", voi_loro: "Voi/Loro" },
  stress_level: {
    molto_alto: "Molto alto",
    alto: "Alto",
    medio: "Medio",
    basso: "Basso",
    molto_basso: "Molto basso",
  },
  sleep_quality: {
    ottima: "Ottima",
    buona: "Buona",
    media: "Media",
    scarsa: "Scarsa",
    pessima: "Pessima",
  },
  recovery_capacity: {
    ottima: "Ottima",
    buona: "Buona",
    media: "Media",
    scarsa: "Scarsa",
    pessima: "Pessima",
  },
  neat_steps: {
    "<5000": "Meno di 5.000",
    "5000-7500": "5.000 – 7.500",
    "7500-10000": "7.500 – 10.000",
    "10000-12500": "10.000 – 12.500",
    ">12500": "Più di 12.500",
  },
  experience_level: {
    novizio: "Novizio",
    principiante: "Principiante",
    intermedio: "Intermedio",
    avanzato: "Avanzato",
    master: "Master",
  },
  workload: {
    molto_basso: "Molto basso",
    basso: "Basso",
    medio: "Medio",
    alto: "Alto",
    molto_alto: "Molto alto",
  },
  max_days_week: { "2": "2", "3": "3", "4": "4", "5": "5", "6": "6" },
  work_mode: { presenza: "In presenza", remoto: "Da remoto", ibrido: "Ibrido", app: "Solo app" },
  diet_assessment: {
    iper: "Ipercalorica",
    iso: "Isocalorica",
    ipo: "Ipocalorica",
    non_so: "Non saprei",
  },
  pregnancy: { si: "Sì", no: "No", na: "Non applicabile" },
  cycle_status: {
    regolare: "Regolare",
    irregolare: "Irregolare",
    assente_3m: "Assente da 3+ mesi",
    menopausa: "Menopausa",
    contraccezione_ormonale: "Contraccezione ormonale",
  },
  objective: {
    estetica: "Estetica",
    dimagrimento: "Dimagrimento",
    forza: "Forza",
    powerlifting: "Powerlifting",
    performance_sport: "Performance sportiva",
    resistenza: "Resistenza",
    generale: "Benessere generale",
    altro: "Altro",
  },
};

export type CanonicalZone = (typeof CANONICAL_ZONES)[number];

/** Display labels for the 15 canonical zones (machine values stay verbatim). */
export const ZONE_LABELS: Record<CanonicalZone, string> = {
  spalla: "Spalla",
  gomito: "Gomito",
  "polso-mano": "Polso / mano",
  cervicale: "Cervicale",
  dorsale: "Dorsale",
  toracica: "Toracica",
  lombare: "Lombare",
  addome: "Addome",
  anca: "Anca",
  inguine: "Inguine",
  ginocchio: "Ginocchio",
  ischiocrurali: "Ischiocrurali (femorali)",
  quadricipite: "Quadricipite",
  caviglia: "Caviglia",
  polpaccio: "Polpaccio",
};

export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export const INJURY_STATUS_LABELS: Record<InjuryStatus, string> = {
  in_rehab: "In riabilitazione",
  recovered: "Recuperato",
  chronic: "Cronico",
};
