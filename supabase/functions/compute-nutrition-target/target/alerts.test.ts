import { assert, assertEquals } from "jsr:@std/assert@1";
import { alertForGate, lifecycleReferralAlert } from "./alerts.ts";
import type { NutritionGateReason } from "./alerts.ts";

const BLOCKING: NutritionGateReason[] = [
  "safety_capture",
  "unintended_weight_loss",
  "low_energy_availability",
  "anomalous_adjustment",
];

Deno.test("consenso mancante NON genera alert (stato normale, come il gemello)", () => {
  assertEquals(alertForGate("consent", "Anna"), null);
});

Deno.test("mappa type/severity dei gate bloccanti", () => {
  assertEquals(alertForGate("safety_capture", "Anna")!.type, "nutrition_safety");
  assertEquals(alertForGate("safety_capture", "Anna")!.severity, "medium");
  assertEquals(alertForGate("unintended_weight_loss", "Anna")!.severity, "high");
  assertEquals(alertForGate("low_energy_availability", "Anna")!.type, "low_energy_availability");
  assertEquals(alertForGate("anomalous_adjustment", "Anna")!.type, "nutrition_safety");
  assertEquals(alertForGate("anomalous_adjustment", "Anna")!.severity, "high");
});

Deno.test("regola d'oro: mai linguaggio prescrittivo, sempre suggerimento adattivo", () => {
  const messages = [
    ...BLOCKING.map((r) => alertForGate(r, "Anna", "x")!.message),
    lifecycleReferralAlert("Anna").message,
  ];
  for (const msg of messages) {
    assert(!/prescri/i.test(msg), `linguaggio prescrittivo in: ${msg}`);
    assert(!/dieta/i.test(msg), `"dieta" in: ${msg}`);
  }
});

Deno.test("il dettaglio numerico arriva al coach; il referral e' medium e non-bloccante", () => {
  const withDetail = alertForGate("low_energy_availability", "Anna", "EA 25 kcal/kg FFM")!;
  assert(withDetail.message.includes("EA 25 kcal/kg FFM"));
  const referral = lifecycleReferralAlert("Anna");
  assertEquals(referral.type, "female_lifecycle_referral");
  assertEquals(referral.severity, "medium");
  assert(referral.message.includes("non sostituisce un parere medico"));
});
