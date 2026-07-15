// Parity guard: CANONICAL_ZONES must stay 1:1 with ZONE_MAP (v18, single
// source). ZONE_MAP is not exported, but every canonical key has an identity
// entry in the ALIAS table — so resolveZone(zone) must return exactly [zone].
// If zoneMap.ts adds/renames/removes a zone, this test breaks.

import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import { resolveZone } from "../../_shared/method/zoneMap.ts";
import { CANONICAL_ZONES, INJURY_STATUSES, isCanonicalZone, isInjuryStatus } from "./zones.ts";

Deno.test("le zone canoniche sono 15 (zoneMap v18: split dorsale/toracica)", () => {
  assertEquals(CANONICAL_ZONES.length, 15);
});

Deno.test("ogni zona canonica risolve a se stessa via resolveZone (parita' con ZONE_MAP)", () => {
  for (const zone of CANONICAL_ZONES) {
    assertEquals(resolveZone(zone), [zone], `zona '${zone}' non risolve a se stessa`);
  }
});

Deno.test("i bucket FMS grossolani NON sono zone canoniche del selettore", () => {
  for (const bucket of ["general", "upper_body", "lower_body", "spine"]) {
    assertFalse(isCanonicalZone(bucket), `bucket '${bucket}' non deve essere selezionabile`);
  }
});

Deno.test("status injuries = CHECK del DB (in_rehab | recovered | chronic)", () => {
  assertEquals([...INJURY_STATUSES], ["in_rehab", "recovered", "chronic"]);
  assertFalse(isInjuryStatus("active")); // stato inesistente del vecchio stub
});
