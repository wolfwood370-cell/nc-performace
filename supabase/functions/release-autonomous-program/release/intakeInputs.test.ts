// Falsifiable tests for the onboarding_data -> engine inputs parser.
// The "real" fixture mirrors what submit-intake actually persists
// (validate.ts record shape), the broken ones exercise the defenses.

import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_DAYS_PER_WEEK, parseIntakeInputs } from "./intakeInputs.ts";

const REAL_ONBOARDING_DATA = {
  intake: {
    schema_version: 1,
    submitted_at: "2026-07-14T10:00:00.000Z",
    mode: "autonomous",
    safety: { level: "green", routed_out: false, reasons: [], yellow: [] },
    readiness: { importance: 8, confidence: 6 },
    equipment: { items: ["bilanciere", "manubri", "panca"] },
    training: { experience_level: "intermedio", max_days_week: "4" },
    goals: { main_goal: "diventare più forte" },
  },
};

Deno.test("parseIntakeInputs: record reale -> input completi", () => {
  const inputs = parseIntakeInputs(REAL_ONBOARDING_DATA);
  assertEquals(inputs, {
    intakePresent: true,
    safety: { level: "green", routed_out: false, reasons: [], yellow: [] },
    readiness: { importance: 8, confidence: 6 },
    equipmentItems: ["bilanciere", "manubri", "panca"],
    equipmentRaw: "bilanciere, manubri, panca",
    daysPerWeek: 4,
    trainingAge: null,
  });
});

Deno.test("parseIntakeInputs: intake assente -> difese attive, default sicuri", () => {
  for (const od of [null, undefined, {}, { intake: null }, { intake: "x" }, []]) {
    const inputs = parseIntakeInputs(od);
    assertEquals(inputs.intakePresent, false, JSON.stringify(od));
    assertEquals(inputs.safety, undefined);
    assertEquals(inputs.readiness, null);
    assertEquals(inputs.equipmentItems, []);
    assertEquals(inputs.equipmentRaw, null);
    assertEquals(inputs.daysPerWeek, DEFAULT_DAYS_PER_WEEK);
  }
});

Deno.test("parseIntakeInputs: readiness valida solo con entrambi gli interi 0-10", () => {
  const base = (readiness: unknown) => ({ intake: { readiness } });
  assertEquals(parseIntakeInputs(base({ importance: 0, confidence: 10 })).readiness, {
    importance: 0,
    confidence: 10,
  });
  for (const bad of [
    { importance: 8 },
    { importance: "8", confidence: 6 },
    { importance: 8, confidence: 11 },
    { importance: 8, confidence: 6.5 },
    { importance: -1, confidence: 6 },
    null,
    "alta",
  ]) {
    assertEquals(parseIntakeInputs(base(bad)).readiness, null, JSON.stringify(bad));
  }
});

Deno.test(
  "parseIntakeInputs: equipment — items sporchi filtrati, fallback su text (coached)",
  () => {
    const items = parseIntakeInputs({
      intake: { equipment: { items: [" bilanciere ", "", 3, null, "cavi"] } },
    });
    assertEquals(items.equipmentItems, ["bilanciere", "cavi"]);
    assertEquals(items.equipmentRaw, "bilanciere, cavi");
    const text = parseIntakeInputs({
      intake: { equipment: { text: "  palestra completa  " } },
    });
    assertEquals(text.equipmentItems, []);
    assertEquals(text.equipmentRaw, "palestra completa");
    assertEquals(parseIntakeInputs({ intake: { equipment: {} } }).equipmentRaw, null);
  },
);

Deno.test("parseIntakeInputs: max_days_week — enum valido passa, il resto -> default 3", () => {
  const days = (v: unknown) =>
    parseIntakeInputs({ intake: { training: { max_days_week: v } } }).daysPerWeek;
  assertEquals(days("2"), 2);
  assertEquals(days("6"), 6);
  assertEquals(days("7"), DEFAULT_DAYS_PER_WEEK);
  assertEquals(days("1"), DEFAULT_DAYS_PER_WEEK);
  assertEquals(days(4), DEFAULT_DAYS_PER_WEEK); // whitelist writes strings only
  assertEquals(days(undefined), DEFAULT_DAYS_PER_WEEK);
  assertEquals(days("boh"), DEFAULT_DAYS_PER_WEEK);
});

Deno.test("parseIntakeInputs: training_age legacy (vecchio wizard) letto dalla radice", () => {
  assertEquals(parseIntakeInputs({ intake: {}, training_age: "5 anni" }).trainingAge, "5 anni");
  assertEquals(parseIntakeInputs({ intake: {}, training_age: 5 }).trainingAge, null);
});

Deno.test("parseIntakeInputs: determinismo", () => {
  assertEquals(parseIntakeInputs(REAL_ONBOARDING_DATA), parseIntakeInputs(REAL_ONBOARDING_DATA));
});
