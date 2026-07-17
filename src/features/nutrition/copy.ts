// =============================================================================
// src/features/nutrition/copy.ts
// ALL user-facing strings of the nutrition screen in one place (Italian,
// plain language). The athlete NEVER sees technical spy names
// (daily_cap, fallback_mode…) and no clinical detail ever renders here.
// Banner/state copy is the task contract of 2026-07-17: change with Nick only.
// =============================================================================

export const STRATEGY_LABELS: Record<string, string> = {
  cut: "Taglio",
  maintain: "Mantieni",
  bulk: "Massa",
};

export const NUTRITION_COPY = {
  // Page chrome
  pageEyebrow: "Nutrizione",
  pageTitle: "La tua nutrizione",

  // Query states
  loadingTitle: "Caricamento",
  loadingBody: "Sto recuperando il tuo obiettivo…",
  errorTitle: "Errore di caricamento",
  errorBody: "Non riesco a recuperare il tuo obiettivo. Controlla la connessione e riprova.",
  errorRetry: "Riprova",

  // Empty (no release yet)
  emptyTitle: "Stiamo preparando il tuo primo obiettivo",
  emptyBody: "Registra peso e pasti per qualche giorno.",

  // Safety pause (neutral copy: zero clinical detail, by design)
  pauseTitle: "In revisione col tuo coach",
  pauseBody: "Il tuo obiettivo è in revisione: riceverai presto un aggiornamento.",
  pauseBadge: "In revisione",
  pauseLastTargetNote: "Ultimo obiettivo, in revisione: non seguirlo finché non ti ricontattiamo.",

  // Unreadable document (row from another schema_version)
  unreadableTitle: "Obiettivo in aggiornamento",
  unreadableBody:
    "Questo obiettivo è di una versione precedente: verrà rinnovato al prossimo rilascio.",

  // Badges + banners
  coldStartBadge: "In calibrazione",
  coldStartBanner:
    "Prima settimana: sto calibrando il tuo obiettivo. Registra i pasti e il peso; la prossima settimana affino.",
  bannerFallback:
    "Hai registrato pochi giorni: questa settimana mi baso solo sul tuo peso. Più registri, più divento preciso.",
  bannerMacroFloor: "Ho tenuto un minimo di sicurezza su grassi e carboidrati.",
  bannerGradual: "Ho reso il cambiamento graduale questa settimana.",
  bannerLifecycle: "Ho reso il cambiamento più graduale in base alla tua fase.",
  bannerDietBreak: (weeks: number) =>
    `Sei in deficit da ${weeks} settimane: valuta una breve pausa dalla dieta col tuo coach.`,
  bannerDietBreakGeneric:
    "Sei in deficit da diverse settimane: valuta una breve pausa dalla dieta col tuo coach.",
  bannerReferral:
    "Un confronto con uno specialista della nutrizione può esserti utile: parlane col tuo coach.",

  // Hero + collapsible details
  updatedOn: (date: string) => `Aggiornato il ${date}`,
  kcalUnit: "kcal",
  macroProtein: "Proteine",
  macroCarbs: "Carboidrati",
  macroFats: "Grassi",
  detailsToggle: "Come l'ho calcolato",
  detailsExpenditure: "Dispendio stimato",
  detailsConfidence: "Affidabilità della stima",
  detailsLoggedDays: "Giorni registrati",
  detailsWeight: "Peso di riferimento",
} as const;
