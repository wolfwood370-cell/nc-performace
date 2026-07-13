// Validazione al confine: whitelist enum, required per modalita', cancello
// consensi, regole ciclo/nutrizione/injuries. Fixture con la forma REALE del
// payload (lezione M2) + un assert-di-revert per ogni regola.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { experienceForColumn, validateIntakePayload } from "./validate.ts";

type Body = Record<string, unknown>;

function coachedBody(): Body {
  return {
    schema_version: 1,
    intake: {
      anagrafica: {
        full_name: "Mario Rossi",
        sex: "maschio",
        birth_date: "1990-05-10",
        phone: "+39 333 1234567",
        height_cm: 180,
        weight_kg: 82.5,
      },
      parq: {
        heart: false,
        chest_pain: false,
        balance: false,
        other_chronic: false,
        meds: false,
        msk: false,
        supervised: false,
      },
      pain: { pain_now: false, pain_gesture: false },
      weight_loss_unintentional: false,
      condition: { has: false },
      medications: { has: false },
      safety_allergy: { has: false },
      dca: { q1: false, q2: false, q3: false },
      lifestyle: { stress_level: "medio", sleep_quality: "buona" },
      training: { experience_level: "intermedio", barbell_experience: "3 anni di palestra" },
      goals: { main_goal: "Rimettermi in forma e migliorare la panca" },
      equipment: { text: "bilanciere, rack, manubri" },
    },
    consents: [
      { type: "health_required", granted: true },
      { type: "non_medical_disclaimer", granted: true },
      { type: "nutrition_advice", granted: false },
      { type: "photos_measurements", granted: false },
      { type: "medical_sharing", granted: false },
      { type: "marketing", granted: false },
    ],
    consent_version: "hub-v1",
    injuries: [],
  };
}

function autonomousBody(): Body {
  const body = coachedBody();
  const intake = body.intake as Record<string, unknown>;
  intake.objective = "forza";
  intake.equipment = { items: ["bilanciere", "rack"] };
  intake.readiness = { importance: 8, confidence: 7 };
  const answers: Record<string, string> = {};
  for (let n = 1; n <= 30; n++) answers[`q${String(n).padStart(2, "0")}`] = "C";
  intake.neurotype_answers = answers;
  return body;
}

const asIntake = (body: Body) => body.intake as Record<string, unknown>;

Deno.test("coached minimo valido -> ok; chiavi sconosciute droppate dal record", () => {
  const body = coachedBody();
  asIntake(body).malicious_blob = "x";
  (asIntake(body).anagrafica as Record<string, unknown>).admin = true;
  const res = validateIntakePayload(body, "coached");
  assert(res.ok);
  assertFalse("malicious_blob" in res.data.intakeRecord);
  assertFalse("admin" in (res.data.intakeRecord.anagrafica as Record<string, unknown>));
  assertEquals(res.data.extract.sex, "maschio");
  assertEquals(res.data.extract.stressLevel, "medio");
  assertEquals(res.data.consentVersion, "hub-v1");
});

Deno.test("schema_version diversa da 1 -> invalid_payload", () => {
  const body = coachedBody();
  body.schema_version = 2;
  const res = validateIntakePayload(body, "coached");
  assertFalse(res.ok);
  assert(!res.ok && res.field === "schema_version");
});

Deno.test("cancello consensi: senza health_required+disclaimer NON si prosegue", () => {
  const body = coachedBody();
  (body.consents as { type: string; granted: boolean }[])[0].granted = false;
  const res = validateIntakePayload(body, "coached");
  assert(!res.ok && res.error === "missing_required_consents");
});

Deno.test("consensi: servono esattamente 6 righe, una per tipo", () => {
  const body = coachedBody();
  (body.consents as unknown[]).pop();
  assertFalse(validateIntakePayload(body, "coached").ok);
});

Deno.test("enum fuori whitelist -> invalid_payload col field", () => {
  const body = coachedBody();
  (asIntake(body).lifestyle as Record<string, unknown>).stress_level = "estremo";
  const res = validateIntakePayload(body, "coached");
  assert(!res.ok && res.field === "intake.lifestyle.stress_level");
});

Deno.test("nutrizione senza consenso -> invalid; con consenso -> nel record", () => {
  const body = coachedBody();
  asIntake(body).nutrition = { diet_assessment: "iso" };
  assertFalse(validateIntakePayload(body, "coached").ok);

  (body.consents as { type: string; granted: boolean }[])[2].granted = true;
  const res = validateIntakePayload(body, "coached");
  assert(res.ok);
  assertEquals((res.data.intakeRecord.nutrition as Record<string, unknown>).diet_assessment, "iso");
});

Deno.test("injuries: solo zone canoniche e status del CHECK", () => {
  const body = coachedBody();
  body.injuries = [{ zone: "spalle", status: "in_rehab" }]; // alias, non canonica
  assertFalse(validateIntakePayload(body, "coached").ok);

  body.injuries = [{ zone: "spalla", status: "active" }]; // status inesistente
  assertFalse(validateIntakePayload(body, "coached").ok);

  body.injuries = [{ zone: "spalla", status: "recovered", note: " vecchia lussazione " }];
  const res = validateIntakePayload(body, "coached");
  assert(res.ok);
  assertEquals(res.data.injuries, [
    { zone: "spalla", status: "recovered", note: "vecchia lussazione" },
  ]);
});

Deno.test("autonomous: objective/equipment.items/readiness/neurotipo sono obbligatori", () => {
  for (const strip of ["objective", "readiness", "neurotype_answers"]) {
    const body = autonomousBody();
    delete asIntake(body)[strip];
    const res = validateIntakePayload(body, "autonomous");
    assert(!res.ok && res.field === `intake.${strip}`, strip);
  }
  const body = autonomousBody();
  asIntake(body).equipment = { text: "solo testo" };
  const res = validateIntakePayload(body, "autonomous");
  assert(!res.ok && res.field === "intake.equipment.items");
});

Deno.test("autonomous completo -> ok con 30 risposte neurotipo normalizzate", () => {
  const res = validateIntakePayload(autonomousBody(), "autonomous");
  assert(res.ok);
  assertEquals(res.data.extract.objective, "forza");
  assertEquals(res.data.extract.neurotypeAnswers?.length, 30);
  assertEquals(res.data.extract.arenaCtx.barbellExperience, "3 anni di palestra");
});

Deno.test("neurotipo incompleto (29/30) -> invalid anche in coached", () => {
  const body = coachedBody();
  const answers: Record<string, string> = {};
  for (let n = 1; n <= 29; n++) answers[`q${String(n).padStart(2, "0")}`] = "A";
  asIntake(body).neurotype_answers = answers;
  const res = validateIntakePayload(body, "coached");
  assert(!res.ok && res.field === "intake.neurotype_answers");
});

Deno.test("donna: blocco cycle obbligatorio (pregnancy + cycle_status)", () => {
  const body = coachedBody();
  (asIntake(body).anagrafica as Record<string, unknown>).sex = "femmina";
  assertFalse(validateIntakePayload(body, "coached").ok);

  body.cycle = { pregnancy: "no", cycle_status: "regolare" };
  const res = validateIntakePayload(body, "coached");
  assert(res.ok);
  assertEquals(res.data.cycle, { pregnancy: "no", cycle_status: "regolare" });
});

Deno.test("uomo: cycle solo come 'na' senza cycle_status", () => {
  const body = coachedBody();
  body.cycle = { pregnancy: "si" };
  assertFalse(validateIntakePayload(body, "coached").ok);
  body.cycle = { pregnancy: "na" };
  assert(validateIntakePayload(body, "coached").ok);
});

Deno.test(
  "condition forzato: has=true senza dettaglio -> invalid (il vuoto non e' un dato)",
  () => {
    const body = coachedBody();
    asIntake(body).condition = { has: true };
    const res = validateIntakePayload(body, "coached");
    assert(!res.ok && res.field === "intake.condition.detail");

    asIntake(body).condition = { has: true, detail: "ipotiroidismo diagnosticato" };
    const ok = validateIntakePayload(body, "coached");
    assert(ok.ok);
    assert(ok.data.extract.conditionDiagnosed);
  },
);

Deno.test("pain_gesture_zone: solo canonica; arriva nell'extract per il semaforo", () => {
  const body = coachedBody();
  asIntake(body).pain = { pain_now: false, pain_gesture: true, pain_gesture_zone: "spalle" };
  assertFalse(validateIntakePayload(body, "coached").ok);

  asIntake(body).pain = { pain_now: false, pain_gesture: true, pain_gesture_zone: "spalla" };
  const res = validateIntakePayload(body, "coached");
  assert(res.ok);
  assertEquals(res.data.extract.painGesture, { present: true, zone: "spalla" });
});

Deno.test("experienceForColumn: novizio/master piegati ai livelli coperti dal motore", () => {
  assertEquals(experienceForColumn("novizio"), "principiante");
  assertEquals(experienceForColumn("master"), "avanzato");
  assertEquals(experienceForColumn("intermedio"), "intermedio");
  assertEquals(experienceForColumn(undefined), undefined);
});
