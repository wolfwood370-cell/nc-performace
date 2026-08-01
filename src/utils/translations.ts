// ============================================
// CENTRALIZED ITALIAN LOCALIZATION UTILITY
// Maps database ENUMs and UI labels to Italian
// ============================================

// Cycle Phases
export const CYCLE_PHASE_LABELS: Record<string, string> = {
  menstrual: "Mestruale",
  follicular: "Follicolare",
  ovulatory: "Ovulatoria",
  luteal: "Luteale",
  luteal_early: "Luteale Precoce",
  luteal_late: "Luteale Tardiva",
};

// Muscle Groups (DB key → Italian label)
export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Pettorali",
  back: "Dorso",
  shoulders: "Spalle",
  arms: "Braccia",
  legs: "Gambe",
  core: "Core",
  glutes: "Glutei",
  calves: "Polpacci",
  forearms: "Avambracci",
  traps: "Trapezi",
};

// Intensity / Effort Labels
export const INTENSITY_LABELS: Record<string, string> = {
  RPE: "Scala RPE",
  RIR: "Ripetizioni in Riserva",
  "1RM": "Massimale Stimato",
  volume: "Volume",
  intensity: "Intensità",
  load: "Carico",
  tonnage: "Tonnellaggio",
};

// Alert Types (Coach Dashboard)
export const ALERT_TYPE_LABELS: Record<string, string> = {
  missed_workout: "Allenamento Saltato",
  low_readiness: "Readiness Bassa",
  active_injury: "Infortunio Attivo",
  high_acwr: "ACWR Elevato",
  rpe_spike: "RPE Elevato",
  no_checkin: "Nessun Check-in",
  injury_risk: "Rischio Infortunio",
  high_strain: "Strain Elevato",
};

// Alert Severity
export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critico",
  warning: "Attenzione",
  info: "Informativo",
};

// Coach alert types — `coach_alerts.type`, written server-side by the
// watchdog trigger, the intake semaforo, the autonomous release gate and
// the nutrition engine. A different vocabulary from ALERT_TYPE_LABELS
// above, which belongs to the client-side triage; the two are not
// interchangeable. The column is free TEXT with no CHECK, so `t()` falls
// back to the raw key when the server grows a type the UI does not know.
export const COACH_ALERT_TYPE_LABELS: Record<string, string> = {
  risk_alert: "Rischio Allenamento",
  routed_out: "Fuori Percorso",
  medical_clearance: "Nulla Osta Medico",
  condition_review: "Condizione da Rivedere",
  dca_screening: "Screening DCA",
  pain_gesture: "Segnale di Dolore",
  cycle_flag: "Ciclo Mestruale",
  reduced_volume: "Volume Ridotto",
  autonomous_gate_stop: "Rilascio Bloccato",
  nutrition_safety: "Sicurezza Nutrizionale",
  low_energy_availability: "Bassa Disponibilità Energetica",
  female_lifecycle_referral: "Invio a Specialista",
};

// Coach alert severity — the DB vocabulary (`high|medium|low`), kept
// separate from SEVERITY_LABELS (`critical|warning|info`) on purpose: the
// two enums were never reconciled, and folding one into the other here
// would invent a correspondence that does not exist in the data.
export const COACH_ALERT_SEVERITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Bassa",
};

// Soreness zones — the keys the athlete check-in writes into
// `daily_readiness.soreness_map` (`DailyCheckin.tsx` MUSCLE_GROUPS). The four
// after the blank line are not written by the current check-in: they belong to
// the older shape declared in `src/types/database.ts`, and are kept so legacy
// rows read as words. Anything else falls back to the raw key via `t()`.
export const SORENESS_ZONE_LABELS: Record<string, string> = {
  chest: "Petto",
  triceps: "Tricipiti",
  biceps: "Bicipiti",
  shoulders: "Spalle",
  traps: "Trapezi",
  lats: "Dorsali",
  lower_back: "Lombari",
  glutes: "Glutei",
  hamstrings: "Femorali",
  quads: "Quadricipiti",
  calves: "Polpacci",

  neck: "Collo",
  upper_back: "Dorso Alto",
  arms: "Braccia",
  core: "Core",
};

// Workout Status
export const WORKOUT_STATUS_LABELS: Record<string, string> = {
  pending: "In Attesa",
  scheduled: "Programmato",
  in_progress: "In Corso",
  completed: "Completato",
  missed: "Saltato",
  skipped: "Saltato",
};

// Subscription Status
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  trial: "Prova",
  past_due: "Scaduto",
  canceled: "Cancellato",
  none: "Nessuno",
};

// Billing Period
export const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "Mensile",
  yearly: "Annuale",
  "one-time": "Una Tantum",
};

// Content Types (Library)
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  pdf: "PDF",
  link: "Link",
  text: "Testo",
};

// Contraceptive Types
export const CONTRACEPTIVE_LABELS: Record<string, string> = {
  none: "Nessuno",
  pill: "Pillola",
  iud_hormonal: "IUD Ormonale",
  iud_copper: "IUD Rame",
};

// Training Day Types
export const TRAINING_DAY_LABELS: Record<string, string> = {
  training: "Giornata di Allenamento",
  rest: "Giornata di Recupero",
};

// Readiness Levels
export const READINESS_LABELS: Record<string, string> = {
  high: "Ottimale",
  moderate: "Moderato",
  low: "Basso",
};

// Phase Focus Types (Periodization)
export const PHASE_FOCUS_LABELS: Record<string, string> = {
  hypertrophy: "Ipertrofia",
  strength: "Forza",
  power: "Potenza",
  endurance: "Resistenza",
  deload: "Scarico",
  peaking: "Picco",
};

// FMS Status Labels
export const FMS_STATUS_LABELS: Record<string, string> = {
  optimal: "Ottimale",
  limited: "Limitato",
  dysfunctional: "Disfunzionale",
  pain: "Dolore",
};

// Injury Status Labels
export const INJURY_STATUS_LABELS: Record<string, string> = {
  in_rehab: "In Riabilitazione",
  recovered: "Recuperato",
  chronic: "Cronico",
};

// Generic helper to translate a key using any map, falling back to the key itself
export function t(map: Record<string, string>, key: string): string {
  return map[key] || key;
}
