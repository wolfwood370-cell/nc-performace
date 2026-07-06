// Test falsificabili per zoneMap.ts — fixtures in-memory, nessun DB.
// Coprono: tier (aggressivo/moderato), ponte muscolo/pattern/posizione/famiglia,
// alias, bucket grossolani FMS, blocco 'general', fallback per zone non mappate,
// determinismo. Fonte casi: spec §9 (spalla = zona VALIDATA sul DB).

import { assertEquals } from "jsr:@std/assert@1";
import { hasGeneralBlock, resolveZone, zoneExcludes } from "./zoneMap.ts";
import type { ExcludedZone } from "./zoneMap.ts";
import type { ExerciseRow } from "./types.ts";

function row(partial: Partial<ExerciseRow> & { os_id: string; name: string }): ExerciseRow {
  return {
    exercise_family: "forza",
    movement_pattern: null,
    patterns: null,
    equipment: null,
    execution_mode: null,
    suited_rep_range: null,
    fatigue_cost: null,
    technical_complexity: null,
    laterality: "bilaterale",
    stability_demand: null,
    body_position: null,
    lift_phase: null,
    muscles: null,
    secondary_muscles: null,
    attributes: null,
    ...partial,
  };
}

const excluded = (r: ExerciseRow, zones: ExcludedZone[]): boolean =>
  zoneExcludes(r, zones) !== null;

// ---------------------------------------------------------------------------
// 1. spalla in_rehab (tier aggressivo)
// ---------------------------------------------------------------------------

Deno.test("spalla aggressivo: esclude muscolo/pattern-forte/pattern-cautela/posizione", () => {
  const aggr: ExcludedZone[] = [{ zone: "spalla", tier: "aggressivo" }];

  // Esclusi: muscolo (deltoide), pattern forte (push verticale), pattern cautela
  // (push orizzontale, attivo solo aggressivo), posizione forte e posizione cautela.
  assertEquals(
    excluded(
      row({
        os_id: "e1",
        name: "OHP",
        muscles: ["deltoide anteriore"],
        patterns: ["push verticale"],
      }),
      aggr,
    ),
    true,
  );
  assertEquals(
    excluded(row({ os_id: "e2", name: "Panca", patterns: ["push orizzontale"] }), aggr),
    true,
  );
  assertEquals(
    excluded(
      row({
        os_id: "e3",
        name: "MB overhead slam",
        attributes: { position_load: { spalla: "forte" } },
      }),
      aggr,
    ),
    true,
  );
  assertEquals(
    excluded(
      row({ os_id: "e4", name: "Clean", attributes: { position_load: { spalla: "cautela" } } }),
      aggr,
    ),
    true,
  );

  // Tenuti: leg press (squat/quad), snatch-grip deadlift (hip hinge, nessun deltoide),
  // isolamento (mai pattern d'esclusione).
  assertEquals(
    excluded(
      row({ os_id: "k1", name: "Leg press", muscles: ["quadricipiti"], patterns: ["squat"] }),
      aggr,
    ),
    false,
  );
  assertEquals(
    excluded(
      row({
        os_id: "k2",
        name: "Snatch-grip deadlift",
        muscles: ["quadricipiti", "grande gluteo", "ischiocrurali"],
        secondary_muscles: ["erettori spinali", "trapezio"],
        patterns: ["hip hinge"],
      }),
      aggr,
    ),
    false,
  );
  assertEquals(
    excluded(
      row({
        os_id: "k3",
        name: "Leg extension",
        muscles: ["quadricipiti"],
        patterns: ["isolamento"],
      }),
      aggr,
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// 2. spalla chronic (tier moderato)
// ---------------------------------------------------------------------------

Deno.test("spalla moderato: forte/muscolo/posizione-forte escludono; cautela inattiva", () => {
  const mod: ExcludedZone[] = [{ zone: "spalla", tier: "moderato" }];

  assertEquals(
    excluded(row({ os_id: "m1", name: "OHP", patterns: ["push verticale"] }), mod),
    true,
  ); // forte
  assertEquals(
    excluded(row({ os_id: "m2", name: "Alzate", muscles: ["deltoide anteriore"] }), mod),
    true,
  ); // muscolo (entrambi i tier)
  assertEquals(
    excluded(
      row({ os_id: "m3", name: "MB slam", attributes: { position_load: { spalla: "forte" } } }),
      mod,
    ),
    true,
  ); // posizione forte

  assertEquals(
    excluded(row({ os_id: "m4", name: "Panca", patterns: ["push orizzontale"] }), mod),
    false,
  ); // cautela non attiva
  assertEquals(
    excluded(
      row({ os_id: "m5", name: "Clean", attributes: { position_load: { spalla: "cautela" } } }),
      mod,
    ),
    false,
  ); // posizione cautela non attiva
});

// ---------------------------------------------------------------------------
// 3. alias
// ---------------------------------------------------------------------------

Deno.test("alias: EN/sinonimi/trim -> zona canonica", () => {
  assertEquals(resolveZone("shoulder"), ["spalla"]);
  assertEquals(resolveZone("SPALLA "), ["spalla"]);
  assertEquals(resolveZone("hamstring"), ["ischiocrurali"]);
  assertEquals(resolveZone("knee"), ["ginocchio"]);
});

// ---------------------------------------------------------------------------
// 4. bucket grossolano FMS
// ---------------------------------------------------------------------------

Deno.test("bucket upper_body: esclude una riga-deltoide, tiene una riga-quadricipiti", () => {
  const coarse: ExcludedZone[] = [{ zone: "upper_body", tier: "aggressivo" }];
  assertEquals(resolveZone("upper_body"), ["spalla", "gomito", "polso-mano"]);
  assertEquals(
    excluded(row({ os_id: "c1", name: "Alzate", muscles: ["deltoide anteriore"] }), coarse),
    true,
  );
  assertEquals(
    excluded(
      row({ os_id: "c2", name: "Leg press", muscles: ["quadricipiti"], patterns: ["squat"] }),
      coarse,
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// 5. general
// ---------------------------------------------------------------------------

Deno.test("general: hasGeneralBlock true; resolveZone -> __general__", () => {
  assertEquals(hasGeneralBlock([{ zone: "general", tier: "aggressivo" }]), true);
  assertEquals(hasGeneralBlock([{ zone: "spalla", tier: "aggressivo" }]), false);
  assertEquals(resolveZone("general"), ["__general__"]);
});

// ---------------------------------------------------------------------------
// 6. zona non mappata + fallback sottostringa
// ---------------------------------------------------------------------------

Deno.test("zona non mappata: unicorno non lancia/non esclude; fallback sottostringa attivo", () => {
  const quad = row({
    os_id: "q1",
    name: "Leg press",
    muscles: ["quadricipiti"],
    patterns: ["squat"],
  });
  // Non mappata e non presente come sottostringa -> nessuna esclusione, nessun throw.
  assertEquals(zoneExcludes(quad, [{ zone: "unicorno", tier: "aggressivo" }]), null);
  // 'quadricipiti' risolve al canonico 'quadricipite' -> muscolo coinvolto -> escluso.
  assertEquals(excluded(quad, [{ zone: "quadricipiti", tier: "aggressivo" }]), true);
  // Fallback puro: token non mappato ma sottostringa di un muscolo reale.
  const pett = row({
    os_id: "q2",
    name: "Panca",
    muscles: ["pettorali"],
    patterns: ["push orizzontale"],
  });
  const reason = zoneExcludes(pett, [{ zone: "pettorali", tier: "aggressivo" }]);
  assertEquals(reason !== null && reason.includes("fallback"), true);
});

// ---------------------------------------------------------------------------
// 7. determinismo
// ---------------------------------------------------------------------------

Deno.test("determinismo: stesso input -> stesso output", () => {
  const r = row({
    os_id: "d1",
    name: "OHP",
    muscles: ["deltoide anteriore"],
    patterns: ["push verticale"],
  });
  const zones: ExcludedZone[] = [{ zone: "spalla", tier: "aggressivo" }];
  assertEquals(zoneExcludes(r, zones), zoneExcludes(r, zones));
});
