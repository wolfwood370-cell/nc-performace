// supabase/functions/compute-nutrition-target/target/alerts.ts
// PURE alert/audit content for the nutrition loop — Italian copy, coach-facing.
// Golden rule: never "dieta prescritta" — always an ADAPTIVE SUGGESTION that
// got suspended. index.ts inserts these rows as-is (unit-pinned shapes).

/** I/O-level gate reasons (engine reasons + consent/capture/escalation). */
export type NutritionGateReason =
  | "consent"
  | "safety_capture"
  | "unintended_weight_loss"
  | "low_energy_availability"
  | "anomalous_adjustment";

export interface NutritionAlertContent {
  type: "nutrition_safety" | "low_energy_availability" | "female_lifecycle_referral";
  severity: "high" | "medium" | "low";
  message: string;
}

/**
 * Alert for a blocking gate. Consent returns null: a missing consent is a
 * normal state (twin: consentRequired), not a coach escalation.
 */
export function alertForGate(
  reason: NutritionGateReason,
  athleteName: string,
  detail?: string,
): NutritionAlertContent | null {
  const suffix = detail ? ` Dettaglio: ${detail}.` : "";
  switch (reason) {
    case "consent":
      return null;
    case "safety_capture":
      return {
        type: "nutrition_safety",
        severity: "medium",
        message:
          `${athleteName}: segnale di dolore nell'ultimo check-in. Il suggerimento ` +
          `nutrizionale settimanale e' stato sospeso in via prudenziale: ti chiediamo di verificare.`,
      };
    case "unintended_weight_loss":
      return {
        type: "nutrition_safety",
        severity: "high",
        message:
          `${athleteName}: calo di peso non previsto dai dati recenti. Il suggerimento ` +
          `nutrizionale adattivo e' stato sospeso: valuta un contatto con l'atleta.${suffix}`,
      };
    case "low_energy_availability":
      return {
        type: "low_energy_availability",
        severity: "high",
        message:
          `${athleteName}: possibile bassa disponibilita' energetica. Il suggerimento ` +
          `adattivo e' stato sospeso: valuta un contatto diretto con l'atleta.${suffix}`,
      };
    case "anomalous_adjustment":
      return {
        type: "nutrition_safety",
        severity: "high",
        message:
          `${athleteName}: l'aggiornamento nutrizionale calcolato esce dai limiti di ` +
          `sicurezza, nessun suggerimento rilasciato questa settimana. Serve una tua revisione.${suffix}`,
      };
  }
}

/** One-shot lifecycle referral (NON-blocking: the release proceeds). */
export function lifecycleReferralAlert(athleteName: string): NutritionAlertContent {
  return {
    type: "female_lifecycle_referral",
    severity: "medium",
    message:
      `${athleteName}: il quadro del ciclo suggerisce un confronto con una figura ` +
      `specializzata. Il suggerimento nutrizionale resta adattivo e prudenziale ` +
      `e non sostituisce un parere medico.`,
  };
}
