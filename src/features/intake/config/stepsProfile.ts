// =============================================================================
// src/features/intake/config/stepsProfile.ts
// =============================================================================
// Profile steps — goals/training/lifestyle/nutrition/logistics/equipment plus
// the structured autonomous-only layer (objective, readiness rulers, 30-item
// neurotype). Coached keeps the narrative richness (long-text fields
// visibleFor "coached"); autonomous stays lean and structured (plan §A).
// Field labels come from the intake contract §B3-B7 (nc-questionnaire).
// =============================================================================

import { f } from "./model";
import type { StepDef } from "./model";

export const PROFILE_STEPS: StepDef[] = [
  {
    id: "obiettivi",
    title: "Obiettivi",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("goals.main_goal", "longtext", "Qual è il tuo obiettivo principale?", {
        requiredFor: "both",
      }),
      f("objective", "enum", "In quale direzione principale?", {
        enumKey: "objective",
        requiredFor: "autonomous",
      }),
      f("goals.weight_target", "text", "Peso obiettivo (se ne hai uno)", {}),
      f("goals.deadline_event", "text", "Scadenza o evento di riferimento", {}),
      f("goals.weight_history", "longtext", "Storia del peso (massimo e minimo da adulto)", {
        visibleFor: "coached",
      }),
      f(
        "goals.aesthetic_goal",
        "longtext",
        "Qualcosa dell'aspetto fisico che vorresti migliorare",
        {
          visibleFor: "coached",
        },
      ),
      f(
        "goals.movement_goal",
        "longtext",
        "Qualcosa nel modo di muoverti che vorresti migliorare",
        {
          visibleFor: "coached",
        },
      ),
    ],
  },
  {
    id: "allenamento",
    title: "Allenamento",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("training.experience_level", "enum", "Livello di esperienza coi pesi", {
        enumKey: "experience_level",
        requiredFor: "both",
      }),
      f("training.max_days_week", "enum", "Massimo giorni a settimana di allenamento", {
        enumKey: "max_days_week",
        requiredFor: "both",
      }),
      f("training.session_minutes", "text", "Minuti a disposizione per sessione", {
        inputMode: "numeric",
      }),
      f(
        "training.barbell_experience",
        "longtext",
        "Uso di bilanciere/attrezzi (crossfit, powerlifting, pesistica, kettlebell) e per quanto",
        {},
      ),
      f(
        "training.recent_maxes",
        "longtext",
        "Massimali recenti con data (Squat/Panca/Stacco/Lento), se li conosci",
        {},
      ),
      f("training.current_sport", "text", "Sport attuale o più recente, da quando", {}),
      f("training.workload", "enum", "Carico di lavoro abituale", { enumKey: "workload" }),
      f("training.recovery_capacity", "enum", "Capacità di recupero", {
        enumKey: "recovery_capacity",
      }),
      f("training.sports_history", "longtext", "Sport praticati e per quanto", {
        visibleFor: "coached",
      }),
      f("training.favorite_activity", "text", "Attività fisica preferita", {
        visibleFor: "coached",
      }),
    ],
  },
  {
    id: "vita",
    title: "Stile di vita",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("lifestyle.stress_level", "enum", "Stress quotidiano", {
        enumKey: "stress_level",
        requiredFor: "both",
      }),
      f("lifestyle.sleep_quality", "enum", "Qualità del sonno", {
        enumKey: "sleep_quality",
        requiredFor: "both",
      }),
      f("lifestyle.sleep_hours", "text", "Ore di sonno a notte", { inputMode: "numeric" }),
      f("lifestyle.neat_steps", "enum", "Attività quotidiana non sportiva (passi al giorno)", {
        enumKey: "neat_steps",
      }),
      f(
        "lifestyle.work_desc",
        "longtext",
        "Che lavoro fai? Ore a settimana, sedentario o in movimento, orari",
        { visibleFor: "coached" },
      ),
      f("lifestyle.water_liters", "text", "Acqua al giorno (litri)", {
        visibleFor: "coached",
        inputMode: "decimal",
      }),
      f("lifestyle.alcohol_week", "text", "Alcol a settimana", { visibleFor: "coached" }),
      f("lifestyle.smoking", "text", "Fumo (quante al giorno)", { visibleFor: "coached" }),
      f(
        "lifestyle.lifestyle_goal",
        "longtext",
        "Qualcosa nello stile di vita che vorresti migliorare",
        {
          visibleFor: "coached",
        },
      ),
    ],
  },
  {
    id: "nutrizione",
    title: "Nutrizione",
    subtitle: "Sezione attiva perché hai scelto di ricevere suggerimenti alimentari.",
    kind: "fields",
    visibleFor: "both",
    visibleWhen: { path: "consents.nutrition_advice", equals: true },
    fields: [
      f("nutrition.diet_assessment", "enum", "Come valuteresti la tua dieta attuale?", {
        enumKey: "diet_assessment",
      }),
      f("nutrition.meals_desc", "longtext", "Quanti pasti al giorno e a che orari", {}),
      f("nutrition.diet_history", "longtext", "Diete passate, risultati, oscillazioni yo-yo", {
        visibleFor: "coached",
      }),
      f("nutrition.foods_love_avoid", "longtext", "Cibi che ami / che eviti", {
        visibleFor: "coached",
      }),
      f(
        "nutrition.intolerances",
        "longtext",
        "Intolleranze, allergie o esclusioni (mediche/religiose/etiche)",
        {},
      ),
      f("nutrition.supplements", "longtext", "Integratori che assumi ora", {}),
      f("nutrition.who_cooks", "text", "Chi cucina e dove mangi di solito", {
        visibleFor: "coached",
      }),
    ],
  },
  {
    id: "logistica",
    title: "Gestione e logistica",
    kind: "fields",
    visibleFor: "coached",
    fields: [
      f("logistics.work_mode", "enum", "Come preferisci lavorare?", {
        enumKey: "work_mode",
        visibleFor: "coached",
      }),
      f("logistics.availability", "longtext", "Disponibilità (giorni e fasce orarie)", {
        visibleFor: "coached",
      }),
      f("logistics.why_now", "longtext", "Perché proprio ora?", { visibleFor: "coached" }),
      f(
        "logistics.past_coaching",
        "longtext",
        "Hai già lavorato con un coach o in palestra? Cosa ha funzionato e cosa no",
        { visibleFor: "coached" },
      ),
      f("logistics.foreseen_obstacles", "longtext", "Ostacoli che prevedi", {
        visibleFor: "coached",
      }),
      f(
        "logistics.success_definition",
        "longtext",
        "Fra qualche mese, cosa dovrà essere successo per dirti soddisfatto/a?",
        { visibleFor: "coached" },
      ),
      f("logistics.support_network", "text", "Supporto attorno a te (famiglia/amici/partner)", {
        visibleFor: "coached",
      }),
    ],
  },
  {
    id: "attrezzatura",
    title: "Attrezzatura",
    kind: "fields",
    visibleFor: "both",
    fields: [
      f("equipment.text", "longtext", "Dove ti alleni e con quale attrezzatura?", {
        requiredFor: "coached",
        visibleFor: "coached",
      }),
      f("equipment.items", "stringList", "Che attrezzatura hai a disposizione?", {
        help: "Aggiungi una voce alla volta (es. bilanciere, manubri, panca).",
        max: 30,
        maxLength: 60,
        requiredFor: "autonomous",
        visibleFor: "autonomous",
      }),
    ],
  },
  {
    id: "readiness",
    title: "Prontezza",
    kind: "fields",
    visibleFor: "autonomous",
    fields: [
      f("readiness.importance", "scale", "Quanto è importante per te questo percorso, da 0 a 10?", {
        min: 0,
        max: 10,
        requiredFor: "autonomous",
        visibleFor: "autonomous",
      }),
      f("readiness.confidence", "scale", "Quanto ti senti fiducioso/a di riuscirci, da 0 a 10?", {
        min: 0,
        max: 10,
        requiredFor: "autonomous",
        visibleFor: "autonomous",
      }),
    ],
  },
  // 5 pages of 6 statements — neutral pagination copy ("Pagina X di 5"):
  // the pages coincide positionally with the 5 neurotype groups, which must
  // never be suggested to the athlete (contract §B8).
  ...Array.from({ length: 5 }, (_, page): StepDef => {
    return {
      id: `neurotipo-${page + 1}`,
      title: "Come funzioni",
      subtitle: `Pagina ${page + 1} di 5 — indica quanto ti descrive ogni affermazione.`,
      kind: "neurotype",
      visibleFor: "autonomous",
      page,
    };
  }),
];
