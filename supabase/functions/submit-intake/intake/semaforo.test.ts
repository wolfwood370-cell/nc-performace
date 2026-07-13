// Semaforo idoneita': table-driven sui segnali strutturati, con forme REALI
// dei dati (lezione M2) e, per ogni regola, almeno un assert che fallisce sul
// revert (mutation-check, lezione zoneMap v18). Mapping deciso con Nicolo
// 2026-07-13 (prompt intake-redesign §E + correzioni all'OK).

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { evaluateSafety, PARQ_KEYS } from "./semaforo.ts";
import type { SafetyInput } from "./semaforo.ts";

function base(partial: Partial<SafetyInput> = {}): SafetyInput {
  return {
    mode: "coached",
    athleteName: "Atleta Test",
    age: 30,
    parq: {
      heart: false,
      chest_pain: false,
      balance: false,
      other_chronic: false,
      meds: false,
      msk: false,
      supervised: false,
    },
    painNow: false,
    painGesture: { present: false, zone: null },
    weightLossUnintentional: false,
    conditionDiagnosed: false,
    medicationsReported: false,
    dcaFlag: false,
    pregnancy: "no",
    cycleStatus: null,
    stressLevel: "medio",
    sleepQuality: "buona",
    ...partial,
  };
}

Deno.test("atleta sano -> verde, red_flags canonico a 4 chiavi (forma REALE per il gate)", () => {
  const r = evaluateSafety(base());
  assertEquals(r.level, "green");
  assertFalse(r.medicalClearanceRequired);
  assertFalse(r.routedOut);
  assertFalse(r.minor);
  assertEquals(r.alerts, []);
  // shape esatta consumata da assembleWeek.ts safetyGate — anche da sani
  assertEquals(r.redFlags, {
    medical_clearance_required: false,
    medical_yes_questions: [],
    fms_exclusion_zones: [],
    reduced_systemic_volume: false,
  });
});

Deno.test("ogni PAR-Q+ positivo -> rosso + clearance + codice dedicato", () => {
  for (const key of PARQ_KEYS) {
    const r = evaluateSafety(base({ parq: { ...base().parq, [key]: true } }));
    assertEquals(r.level, "red", `parq_${key}`);
    assert(r.medicalClearanceRequired, `clearance per parq_${key}`);
    assert(r.reasons.includes(`parq_${key}`), `codice parq_${key}`);
    assert(r.redFlags.medical_yes_questions.includes(`parq_${key}`));
    assert(r.alerts.some((a) => a.type === "medical_clearance" && a.severity === "high"));
    assertFalse(r.routedOut, `parq_${key} non instrada fuori`);
  }
});

Deno.test("dolore ATTUALE -> rosso (STOP/rinvio), mai auto-injury", () => {
  const r = evaluateSafety(base({ painNow: true }));
  assertEquals(r.level, "red");
  assert(r.reasons.includes("pain_now"));
  assertFalse(r.routedOut);
});

Deno.test("calo-peso involontario -> rosso (campanello, rinvio prima del carico)", () => {
  const r = evaluateSafety(base({ weightLossUnintentional: true }));
  assertEquals(r.level, "red");
  assert(r.reasons.includes("weight_loss_unintentional"));
});

Deno.test(
  "patologia diagnosticata -> rosso + escalation a Nick (NO referral automatico, NO routed-out)",
  () => {
    const r = evaluateSafety(base({ conditionDiagnosed: true }));
    assertEquals(r.level, "red");
    assert(r.medicalClearanceRequired);
    assert(r.reasons.includes("condition_diagnosed"));
    assertFalse(r.routedOut);
    assert(r.alerts.some((a) => a.type === "condition_review" && a.severity === "high"));
  },
);

Deno.test("farmaci/integratori da soli -> nota, NON un gate (correzione Nick)", () => {
  const r = evaluateSafety(base({ medicationsReported: true }));
  assertEquals(r.level, "green");
  assertFalse(r.medicalClearanceRequired);
  assertEquals(r.alerts, []);
});

Deno.test("flag DCA -> rosso + instrada FUORI + alert senza punteggio", () => {
  const r = evaluateSafety(base({ dcaFlag: true }));
  assertEquals(r.level, "red");
  assert(r.routedOut);
  assert(r.reasons.includes("dca_flag"));
  const alert = r.alerts.find((a) => a.type === "dca_screening");
  assert(alert !== undefined);
  assertFalse(/\d/.test(alert.message), "mai un punteggio clinico nel messaggio");
});

Deno.test("gravidanza -> rosso + instrada FUORI; 'na' non scatta", () => {
  const r = evaluateSafety(base({ pregnancy: "si" }));
  assertEquals(r.level, "red");
  assert(r.routedOut);
  assert(r.reasons.includes("pregnancy"));
  assertEquals(evaluateSafety(base({ pregnancy: "na" })).level, "green");
});

Deno.test("minore (<18) -> rosso + routed-out + flag minor per il reject upstream", () => {
  const r = evaluateSafety(base({ age: 17 }));
  assert(r.minor);
  assert(r.routedOut);
  assert(r.reasons.includes("minor"));
  const adult = evaluateSafety(base({ age: 18 }));
  assertFalse(adult.minor);
  assertEquals(adult.level, "green");
});

Deno.test("dolore-gesto CON zona canonica -> giallo, procede, alert-high con la zona", () => {
  for (const mode of ["coached", "autonomous"] as const) {
    const r = evaluateSafety(base({ mode, painGesture: { present: true, zone: "spalla" } }));
    assertEquals(r.level, "yellow", mode);
    assertFalse(r.medicalClearanceRequired, `${mode}: giallo mappato non blocca`);
    assert(r.yellowSignals.includes("pain_gesture"));
    const alert = r.alerts.find((a) => a.type === "pain_gesture");
    assert(alert !== undefined && alert.severity === "high");
    assert(alert.message.includes("spalla"), "la zona catturata arriva al coach");
  }
});

Deno.test(
  "dolore-gesto SENZA zona: coached -> giallo; autonomous -> HOLD per Nick (rosso+clearance)",
  () => {
    const coached = evaluateSafety(base({ painGesture: { present: true, zone: null } }));
    assertEquals(coached.level, "yellow");
    assertFalse(coached.medicalClearanceRequired);
    assert(coached.yellowSignals.includes("pain_gesture_unmapped"));

    const auto = evaluateSafety(
      base({ mode: "autonomous", painGesture: { present: true, zone: null } }),
    );
    assertEquals(auto.level, "red");
    assert(auto.medicalClearanceRequired, "hold = clearance finche' Nick non sblocca");
    assert(auto.reasons.includes("pain_gesture_unmapped"));
    assert(auto.redFlags.medical_yes_questions.includes("pain_gesture_unmapped"));
    assertFalse(auto.routedOut, "hold non e' un routed-out");
  },
);

Deno.test("cycle_status assente_3m/menopausa -> giallo alert-only (decisione B: procede)", () => {
  for (const status of ["assente_3m", "menopausa"]) {
    const r = evaluateSafety(base({ cycleStatus: status }));
    assertEquals(r.level, "yellow", status);
    assertFalse(r.medicalClearanceRequired, `${status} non blocca`);
    assert(r.yellowSignals.includes("cycle_flag"));
    assert(r.alerts.some((a) => a.type === "cycle_flag" && a.severity === "high"));
  }
  assertEquals(evaluateSafety(base({ cycleStatus: "regolare" })).level, "green");
});

Deno.test(
  "stress alto o sonno scarso -> reduced_systemic_volume senza bloccare (parita' wizard)",
  () => {
    const stress = evaluateSafety(base({ stressLevel: "molto_alto" }));
    assertEquals(stress.level, "green", "modula il volume, non blocca");
    assert(stress.redFlags.reduced_systemic_volume);
    assert(stress.alerts.some((a) => a.type === "reduced_volume" && a.severity === "medium"));

    const sleep = evaluateSafety(base({ sleepQuality: "pessima" }));
    assert(sleep.redFlags.reduced_systemic_volume);

    assertFalse(evaluateSafety(base()).redFlags.reduced_systemic_volume);
  },
);

Deno.test("segnali combinati: tutti i codici presenti, rosso + routed-out", () => {
  const r = evaluateSafety(
    base({ parq: { ...base().parq, heart: true }, dcaFlag: true, painNow: true }),
  );
  assertEquals(r.level, "red");
  assert(r.routedOut);
  for (const code of ["parq_heart", "pain_now", "dca_flag"]) {
    assert(r.reasons.includes(code), code);
  }
  // reasons e medical_yes_questions restano specchi
  assertEquals(r.reasons, r.redFlags.medical_yes_questions);
});

Deno.test("determinismo: due run stesso input -> output identico (invariante 8)", () => {
  const input = base({ dcaFlag: true, painGesture: { present: true, zone: "lombare" } });
  assertEquals(JSON.stringify(evaluateSafety(input)), JSON.stringify(evaluateSafety(input)));
});
