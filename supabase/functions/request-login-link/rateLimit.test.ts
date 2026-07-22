// supabase/functions/request-login-link/rateLimit.test.ts
// Pins for the best-effort sliding window: the limit itself, the sliding
// (partial and full), key isolation, the "a rejection must not extend the
// block" property, and the memory sweep. Clock injected — no Deno API.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  createRateLimiter,
  INSTANCE_KEY,
  PER_EMAIL_LIMIT,
  PER_INSTANCE_LIMIT,
} from "./rateLimit.ts";

const WINDOW = 15 * 60_000;

Deno.test("configurazioni di default: 3 per email, 60 per istanza, finestra 15 minuti", () => {
  assertEquals(PER_EMAIL_LIMIT, { maxHits: 3, windowMs: WINDOW });
  assertEquals(PER_INSTANCE_LIMIT, { maxHits: 60, windowMs: WINDOW });
  assertEquals(INSTANCE_KEY, "__instance__");
});

Deno.test("ammette fino a maxHits, poi rifiuta", () => {
  const limiter = createRateLimiter({ maxHits: 3, windowMs: WINDOW });

  assert(limiter.allow("a@test.it", 0));
  assert(limiter.allow("a@test.it", 1_000));
  assert(limiter.allow("a@test.it", 2_000));
  assertFalse(limiter.allow("a@test.it", 3_000));
});

Deno.test("finestra scorrevole parziale: esce il piu' vecchio, si libera UNO slot", () => {
  const limiter = createRateLimiter({ maxHits: 3, windowMs: WINDOW });
  limiter.allow("a@test.it", 0);
  limiter.allow("a@test.it", 1_000);
  limiter.allow("a@test.it", 2_000);

  // Il primo hit (t=0) e' appena uscito dalla finestra: un solo posto libero.
  assert(limiter.allow("a@test.it", WINDOW));
  assertFalse(limiter.allow("a@test.it", WINDOW + 1));
});

Deno.test("finestra piena scaduta: il contatore riparte", () => {
  const limiter = createRateLimiter({ maxHits: 2, windowMs: WINDOW });
  limiter.allow("a@test.it", 0);
  limiter.allow("a@test.it", 100);
  assertFalse(limiter.allow("a@test.it", 200));

  assert(limiter.allow("a@test.it", WINDOW + 100));
  assert(limiter.allow("a@test.it", WINDOW + 150));
});

// Se il rifiuto registrasse l'hit, un attaccante che martella terrebbe la
// vittima bloccata per sempre: il blocco non scadrebbe mai.
Deno.test("il rifiuto NON registra: il martellamento continuo non prolunga il blocco", () => {
  const limiter = createRateLimiter({ maxHits: 2, windowMs: WINDOW });
  limiter.allow("a@test.it", 0);
  limiter.allow("a@test.it", 10);

  for (let t = 20; t < WINDOW; t += 1_000) {
    assertFalse(limiter.allow("a@test.it", t));
  }

  // Finestra scaduta rispetto ai due hit VERI (t=0 e t=10), non ai rifiuti.
  assert(limiter.allow("a@test.it", WINDOW + 11));
});

Deno.test("chiavi indipendenti: il limite di una non tocca l'altra", () => {
  const limiter = createRateLimiter({ maxHits: 1, windowMs: WINDOW });

  assert(limiter.allow("a@test.it", 0));
  assertFalse(limiter.allow("a@test.it", 1));
  assert(limiter.allow("b@test.it", 1));
  assert(limiter.allow(INSTANCE_KEY, 1));
});

Deno.test("sweep: le chiavi scadute vengono liberate oltre maxTrackedKeys", () => {
  const limiter = createRateLimiter({ maxHits: 5, windowMs: WINDOW, maxTrackedKeys: 3 });

  for (let i = 0; i < 4; i++) limiter.allow(`k${i}`, 0);
  assertEquals(limiter.size(), 4);

  // Oltre la soglia E oltre la finestra: lo sweep ripulisce prima di contare.
  assert(limiter.allow("nuova", WINDOW + 1));
  assertEquals(limiter.size(), 1);
});

Deno.test("sweep: le chiavi ancora nella finestra NON vengono perse", () => {
  const limiter = createRateLimiter({ maxHits: 1, windowMs: WINDOW, maxTrackedKeys: 3 });

  for (let i = 0; i < 4; i++) limiter.allow(`k${i}`, 0);
  // Sweep dentro la finestra: nulla scade, il limite di k0 regge ancora e
  // nessuna chiave viene persa (k0 non e' nuova: la size resta 4).
  assertFalse(limiter.allow("k0", 1_000));
  assertEquals(limiter.size(), 4);
  assertFalse(limiter.allow("k3", 2_000));
});
