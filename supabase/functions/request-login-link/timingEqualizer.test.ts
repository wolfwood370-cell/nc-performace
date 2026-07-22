// supabase/functions/request-login-link/timingEqualizer.test.ts
// Pins for the anti-enumeration timing pad. Every expected number is computed
// by hand from the constants, so a change to EWMA_ALPHA / JITTER_RATIO /
// MAX_PAD_MS fails here instead of silently changing the padding.
// Clock and randomness are injected — no Deno API, no flakiness.

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  createTimingEqualizer,
  EWMA_ALPHA,
  JITTER_RATIO,
  MAX_PAD_MS,
  SEED_TARGET_MS,
} from "./timingEqualizer.ts";

/** No jitter: 2 * 0.5 - 1 === 0. */
const noJitter = () => 0.5;

Deno.test("costanti: seed 900ms, alpha 0.2, cap 3s, jitter ±15%", () => {
  assertEquals(SEED_TARGET_MS, 900);
  assertEquals(EWMA_ALPHA, 0.2);
  assertEquals(MAX_PAD_MS, 3000);
  assertEquals(JITTER_RATIO, 0.15);
});

Deno.test("isolate freddo: il target parte dal seed", () => {
  assertEquals(createTimingEqualizer().target(), SEED_TARGET_MS);
});

Deno.test("EWMA: due campioni, valori calcolati a mano", () => {
  const eq = createTimingEqualizer();

  // 0.2 * 1400 + 0.8 * 900 = 280 + 720
  eq.observe(1400);
  assertAlmostEquals(eq.target(), 1000, 1e-9);

  // 0.2 * 1400 + 0.8 * 1000 = 280 + 800
  eq.observe(1400);
  assertAlmostEquals(eq.target(), 1080, 1e-9);
});

Deno.test("EWMA: converge sul ramo noto ripetuto", () => {
  const eq = createTimingEqualizer();
  for (let i = 0; i < 20; i++) eq.observe(1400);

  // 1400 + (900 - 1400) * 0.8^20 ≈ 1394.2
  assert(eq.target() > 1390, `target troppo basso: ${eq.target()}`);
  assert(eq.target() < 1400, `target oltre il campione: ${eq.target()}`);
});

// Un campione negativo o NaN avvelenerebbe la media per ogni richiesta
// successiva: il pad diventerebbe 0 e il canale timing si riaprirebbe.
Deno.test("campioni non validi scartati: il target non viene avvelenato", () => {
  const eq = createTimingEqualizer();
  eq.observe(-500);
  eq.observe(Number.NaN);
  eq.observe(Number.POSITIVE_INFINITY);
  assertEquals(eq.target(), SEED_TARGET_MS);
});

Deno.test("pad senza jitter = target meno il tempo gia' trascorso", () => {
  const eq = createTimingEqualizer();
  assertAlmostEquals(eq.padMs(0, noJitter), 900, 1e-9);
  assertAlmostEquals(eq.padMs(300, noJitter), 600, 1e-9);
});

Deno.test("jitter agli estremi: ±15% del target", () => {
  const eq = createTimingEqualizer();
  // random 0 → fattore 0.85 → 765 ; random 1 → fattore 1.15 → 1035
  assertAlmostEquals(
    eq.padMs(0, () => 0),
    765,
    1e-9,
  );
  assertAlmostEquals(
    eq.padMs(0, () => 1),
    1035,
    1e-9,
  );
});

// Il ramo lento non deve MAI essere rallentato ancora: se il tempo trascorso
// ha gia' raggiunto il target, il pad e' zero.
Deno.test("nessun pad quando il tempo trascorso ha gia' superato il target", () => {
  const eq = createTimingEqualizer();
  assertEquals(eq.padMs(900, noJitter), 0);
  assertEquals(eq.padMs(5_000, noJitter), 0);
});

Deno.test("pad limitato dal cap anche con un target degenerato", () => {
  const eq = createTimingEqualizer();
  // 0.2 * 50000 + 0.8 * 900 = 10000 + 720 = 10720, ben oltre il cap.
  eq.observe(50_000);
  assertAlmostEquals(eq.target(), 10_720, 1e-9);
  assertEquals(eq.padMs(0, noJitter), MAX_PAD_MS);
});

Deno.test("elapsed non valido trattato come zero, mai come pad negativo", () => {
  const eq = createTimingEqualizer();
  assertAlmostEquals(eq.padMs(Number.NaN, noJitter), 900, 1e-9);
  assertAlmostEquals(eq.padMs(-1_000, noJitter), 900, 1e-9);
});

// Il ramo sconosciuto insegue il ramo noto: se il noto rallenta, il pad
// cresce di conseguenza senza toccare alcuna costante.
Deno.test("il pad segue il target imparato dal ramo noto", () => {
  const eq = createTimingEqualizer();
  const before = eq.padMs(0, noJitter);
  for (let i = 0; i < 20; i++) eq.observe(2_500);
  const after = eq.padMs(0, noJitter);

  assert(after > before + 1_000, `il pad non ha seguito il target: ${before} → ${after}`);
});
