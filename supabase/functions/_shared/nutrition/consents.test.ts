import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isNutritionConsentGranted, resolveConsentState } from "./consents.ts";

// La semantica DEVE restare identica a release-autonomous-program/release/
// consents.ts: ultima riga per tipo vince, tie sul timestamp va alla riga
// successiva (>=), tipo mancante = non concesso.

Deno.test("ledger vuoto o tipo mancante → non concesso", () => {
  assertFalse(isNutritionConsentGranted([]));
  assertFalse(
    isNutritionConsentGranted([
      { consent_type: "ai_processing", granted: true, created_at: "2026-07-01T10:00:00Z" },
    ]),
  );
});

Deno.test("ultima riga per tipo vince: revoca dopo concessione → non concesso", () => {
  const rows = [
    { consent_type: "nutrition_advice", granted: true, created_at: "2026-07-01T10:00:00Z" },
    { consent_type: "nutrition_advice", granted: false, created_at: "2026-07-10T10:00:00Z" },
  ];
  assertFalse(isNutritionConsentGranted(rows));
  // ordine di arrivo irrilevante
  assertFalse(isNutritionConsentGranted([...rows].reverse()));
});

Deno.test("ri-concessione dopo revoca → concesso", () => {
  assert(
    isNutritionConsentGranted([
      { consent_type: "nutrition_advice", granted: false, created_at: "2026-07-01T10:00:00Z" },
      { consent_type: "nutrition_advice", granted: true, created_at: "2026-07-12T10:00:00Z" },
    ]),
  );
});

Deno.test("tie sul timestamp → vince la riga successiva (>= come il gemello)", () => {
  const state = resolveConsentState([
    { consent_type: "nutrition_advice", granted: false, created_at: "2026-07-01T10:00:00Z" },
    { consent_type: "nutrition_advice", granted: true, created_at: "2026-07-01T10:00:00Z" },
  ]);
  assertEquals(state.get("nutrition_advice"), true);
});
