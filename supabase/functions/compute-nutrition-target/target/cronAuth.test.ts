// supabase/functions/compute-nutrition-target/target/cronAuth.test.ts
// Auth cases required by the migration spec: no-header -> 401, wrong header
// -> 403, missing CRON_SECRET -> 500. Secrets below are FAKE test values.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { CRON_SECRET_HEADER, gateCronRequest } from "./cronAuth.ts";

const SECRET = "segreto-finto-di-test";

Deno.test("gate: CRON_SECRET assente → 500 server_misconfigured", () => {
  assertEquals(gateCronRequest(SECRET, undefined), {
    ok: false,
    status: 500,
    error: "server_misconfigured",
  });
});

Deno.test("gate: CRON_SECRET vuoto → 500 server_misconfigured (fail-closed, mai fail-open)", () => {
  assertEquals(gateCronRequest("", ""), { ok: false, status: 500, error: "server_misconfigured" });
});

Deno.test("gate: header assente → 401 unauthorized", () => {
  assertEquals(gateCronRequest(null, SECRET), { ok: false, status: 401, error: "unauthorized" });
});

Deno.test("gate: header vuoto → 401 unauthorized", () => {
  assertEquals(gateCronRequest("", SECRET), { ok: false, status: 401, error: "unauthorized" });
});

Deno.test("gate: header errato → 403 forbidden", () => {
  assertEquals(gateCronRequest("segreto-sbagliato", SECRET), {
    ok: false,
    status: 403,
    error: "forbidden",
  });
});

Deno.test("gate: header esatto → ok", () => {
  assertEquals(gateCronRequest(SECRET, SECRET), { ok: true });
});

Deno.test("gate: match esatto senza trim — whitespace attorno al segreto → 403", () => {
  assertEquals(gateCronRequest(` ${SECRET}`, SECRET).ok, false);
  assertEquals(gateCronRequest(`${SECRET} `, SECRET).ok, false);
});

Deno.test("contratto: l'header si chiama esattamente x-cron-secret (pin letterale)", () => {
  assertEquals(CRON_SECRET_HEADER, "x-cron-secret");
});

Deno.test("gate: la precedenza è misconfig > header mancante (500 anche senza header)", () => {
  const result = gateCronRequest(null, undefined);
  assert(!result.ok);
  assertEquals(result.ok === false && result.status, 500);
});
