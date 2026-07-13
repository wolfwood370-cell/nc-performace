// DCA screening: deterministic threshold (>=2 yes su 3), flag-only output.

import { assertEquals } from "jsr:@std/assert@1";
import { DCA_ITEMS, evaluateDca } from "./dca.ts";

Deno.test("0 o 1 si -> nessun flag", () => {
  assertEquals(evaluateDca({ q1: false, q2: false, q3: false }).flag, false);
  assertEquals(evaluateDca({ q1: true, q2: false, q3: false }).flag, false);
  assertEquals(evaluateDca({ q1: false, q2: false, q3: true }).flag, false);
});

Deno.test("2 o 3 si -> flag (soglia deterministica)", () => {
  assertEquals(evaluateDca({ q1: true, q2: true, q3: false }).flag, true);
  assertEquals(evaluateDca({ q1: false, q2: true, q3: true }).flag, true);
  assertEquals(evaluateDca({ q1: true, q2: true, q3: true }).flag, true);
});

Deno.test("output = solo flag: nessun punteggio clinico esposto", () => {
  assertEquals(Object.keys(evaluateDca({ q1: true, q2: true, q3: true })), ["flag"]);
});

Deno.test("3 item SCOFF-style definiti (single source per la UI Fase 2)", () => {
  assertEquals(Object.keys(DCA_ITEMS), ["q1", "q2", "q3"]);
});
