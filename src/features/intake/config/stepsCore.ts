// =============================================================================
// src/features/intake/config/stepsCore.ts
// =============================================================================
// CORE steps — shared by BOTH coaching modes (plan §A): consents, anagrafica,
// PAR-Q, pain, health signals (condition/medications/allergy/weight-loss/DCA),
// cycle (femmina only), injuries. Question texts per Nick's decisions
// 2026-07-14 (points A/B); DCA texts imported from their single source.
// =============================================================================

import { DCA_ITEMS } from "../../../../supabase/functions/submit-intake/intake/dca.ts";
import { PARQ_KEYS, PARQ_LABELS } from "./labels";
import { f } from "./model";
import type { StepDef } from "./model";

export const CORE_STEPS: StepDef[] = [
  {
    id: "consensi",
    title: "Consensi",
    subtitle: "Sei voci separate: leggi e scegli una per una.",
    kind: "consents",
    visibleFor: "both",
  },
  {
    id: "anagrafica",
    title: "I tuoi dati",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("anagrafica.full_name", "text", "Nome e cognome", {
        requiredFor: "both",
        autoComplete: "name",
      }),
      f("anagrafica.sex", "enum", "Sesso biologico", { enumKey: "sex", requiredFor: "both" }),
      f("anagrafica.pronoun", "enum", "Come preferisci essere chiamato/a?", {
        enumKey: "pronoun",
      }),
      f("anagrafica.birth_date", "date", "Data di nascita", {
        requiredFor: "both",
        autoComplete: "bday",
      }),
      f("anagrafica.phone", "text", "Telefono", {
        requiredFor: "both",
        inputMode: "tel",
        autoComplete: "tel",
      }),
      f("anagrafica.height_cm", "number", "Altezza (cm)", {
        min: 100,
        max: 250,
        requiredFor: "both",
        inputMode: "numeric",
      }),
      f("anagrafica.weight_kg", "number", "Peso attuale (kg)", {
        min: 30,
        max: 300,
        requiredFor: "both",
        inputMode: "decimal",
      }),
      f("anagrafica.tax_code", "text", "Codice fiscale (facoltativo)", {}),
      f("anagrafica.address", "text", "Indirizzo (facoltativo)", {
        autoComplete: "street-address",
      }),
    ],
  },
  {
    id: "parq",
    title: "Sicurezza",
    subtitle: "Sette domande rapide sulla tua salute (PAR-Q+).",
    kind: "fields",
    visibleFor: "both",
    fields: PARQ_KEYS.map((key) =>
      f(`parq.${key}`, "bool", PARQ_LABELS[key], { requiredFor: "both" }),
    ),
  },
  {
    id: "dolore",
    title: "Dolore",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("pain.pain_now", "bool", "Hai dolore in questo momento?", { requiredFor: "both" }),
      f("pain.pain_where", "longtext", "Dove?", {
        visibleWhen: { path: "pain.pain_now", equals: true },
      }),
      f(
        "pain.pain_gesture",
        "bool",
        "C'è un movimento o gesto che ti provoca dolore in modo ricorrente?",
        {
          requiredFor: "both",
        },
      ),
      f("pain.pain_gesture_desc", "longtext", "Quale? Descrivilo brevemente", {
        visibleWhen: { path: "pain.pain_gesture", equals: true },
      }),
      f("pain.pain_gesture_zone", "zone", "In quale zona lo senti?", {
        help: "Se non trovi la zona esatta scegli «Altra zona / non so».",
        visibleWhen: { path: "pain.pain_gesture", equals: true },
      }),
    ],
  },
  {
    id: "salute",
    title: "Salute",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("condition", "boolDetail", "Ti è stata diagnosticata una patologia o condizione medica?", {
        detailLabel: "Quale?",
        requiredFor: "both",
      }),
      f("medications", "boolDetail", "Assumi regolarmente farmaci o integratori?", {
        detailLabel: "Quali?",
        requiredFor: "both",
      }),
      f(
        "safety_allergy",
        "boolDetail",
        "Hai allergie o reazioni gravi rilevanti per la sicurezza (anafilassi, lattice, farmaci, punture)?",
        { detailLabel: "Quali?", requiredFor: "both" },
      ),
      f("weight_loss_unintentional", "bool", "Negli ultimi mesi hai perso peso senza volerlo?", {
        requiredFor: "both",
      }),
      f("dca.q1", "bool", DCA_ITEMS.q1, { requiredFor: "both" }),
      f("dca.q2", "bool", DCA_ITEMS.q2, { requiredFor: "both" }),
      f("dca.q3", "bool", DCA_ITEMS.q3, { requiredFor: "both" }),
    ],
  },
  {
    id: "ciclo",
    title: "Ciclo e gravidanza",
    kind: "fields",
    visibleFor: "both",
    visibleWhen: { path: "anagrafica.sex", equals: "femmina" },
    fields: [
      f("cycle.pregnancy", "enum", "Sei in gravidanza o post-partum?", {
        enumKey: "pregnancy",
        requiredFor: "both",
      }),
      f("cycle.cycle_status", "enum", "Il tuo ciclo mestruale è:", {
        enumKey: "cycle_status",
        requiredFor: "both",
      }),
      f("cycle.cycle_since", "text", "Da quando?", {
        visibleWhen: { path: "cycle.cycle_status", oneOf: ["irregolare", "assente_3m"] },
      }),
    ],
  },
  {
    id: "infortuni",
    title: "Infortuni passati",
    subtitle: "Zona, stato e quando: aggiungi una voce per infortunio (se ne hai avuti).",
    kind: "injuries",
    visibleFor: "both",
  },
];
