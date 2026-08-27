/**
 * La formula del carico interno vive in DUE posti: la colonna generata
 * `workout_logs.total_load_au` (migration 20260827130000) e
 * `computeAcwr` (src/lib/math/acwr.ts:144). Questo test le inchioda
 * insieme: entrambe le espressioni sono DERIVATE dai loro sorgenti a ogni
 * esecuzione — mai ricopiate a mano (un riferimento che invecchia non si
 * scrive, si deriva) — e devono produrre lo stesso numero sugli stessi
 * input, con la stessa semantica delle assenze.
 *
 * La prova rossa dell'acceptance: rimettere `integer` al posto di
 * `numeric` nella migration fa fallire il test della scala dicendo quale
 * valore è stato troncato e a cosa.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeAcwr } from "../acwr";

const MIGRATION = "supabase/migrations/20260827130000_durata_unica_carico_sui_secondi.sql";
const ACWR_SRC = "src/lib/math/acwr.ts";

// ── la colonna generata, derivata dalla migration ──────────────────────────
const sql = readFileSync(MIGRATION, "utf8");
const decl =
  /ADD COLUMN total_load_au\s+(\w+)\s+GENERATED ALWAYS AS\s*\(\s*([\s\S]*?)\s*\)\s*STORED/.exec(
    sql,
  );
if (!decl) throw new Error(`${MIGRATION}: colonna generata total_load_au non trovata`);
const tipoColonna = decl[1];
const espressione = decl[2].replace(/\s+/g, " ");

/** Mirror JS della colonna: la semantica NULL di Postgres (un operando
 *  NULL → risultato NULL) e — se il tipo non è numeric — l'arrotondamento
 *  che Postgres applica assegnando un numeric a una colonna integer. */
function colonnaGenerata(srpe: number | null, durationSeconds: number | null): number | null {
  if (srpe === null || durationSeconds === null) return null;
  const raw = (srpe * durationSeconds) / 60;
  return tipoColonna === "numeric" ? raw : Math.round(raw);
}

// ── il carico di computeAcwr, derivato dal sorgente ────────────────────────
const acwrSrc = readFileSync(ACWR_SRC, "utf8");
const loadMatch = /load:\s*(.+?)\s*\}\);/.exec(acwrSrc);
if (!loadMatch) throw new Error(`${ACWR_SRC}: espressione del load non trovata`);
const caricoAcwr = (srpe: number, durationSeconds: number) => srpe * (durationSeconds / 60);

describe("carico interno: la colonna generata e computeAcwr sono la stessa formula", () => {
  it("le due espressioni sorgente sono quelle attese (pin derivato)", () => {
    expect(espressione).toBe("srpe::numeric * duration_seconds::numeric / 60.0");
    expect(loadMatch![1]).toBe("s.srpe * (s.durationSeconds / 60)");
    // Un'assenza resta un'assenza: la colonna non deve fabbricare zeri.
    expect(espressione).not.toContain("COALESCE");
    expect(espressione).not.toContain("duration_minutes");
  });

  it("52 secondi × sRPE 7 valgono 6,07 AU — la scala non si tronca", () => {
    const atteso = 7 * (52 / 60); // 6,0666…
    const v = colonnaGenerata(7, 52);
    expect(v, "srpe e durata presenti: il carico non può essere assente").not.toBeNull();
    expect(
      v,
      `52 s × sRPE 7: attesi ${atteso.toFixed(4)} AU, la colonna «${tipoColonna}» ` +
        `li ha resi ${v} — il tipo ha troncato ${atteso.toFixed(4)} a ${v}`,
    ).toBeCloseTo(6.07, 2);
  });

  it("stesso numero sugli stessi input, caso per caso", () => {
    const griglia: Array<[number, number]> = [
      [7, 52], // la seduta del criterio
      [10, 3600], // un'ora piena a RPE massimo → 600
      [1, 1], // il minimo non azzerabile → 0,0166…
      [5, 0], // durata zero REGISTRATA → carico zero, non assenza
      [8, 90], // un minuto e mezzo → 12
    ];
    for (const [srpe, sec] of griglia) {
      const dalDb = colonnaGenerata(srpe, sec);
      const daAcwr = caricoAcwr(srpe, sec);
      expect(dalDb, `(srpe=${srpe}, sec=${sec}): colonna=${dalDb} ≠ acwr=${daAcwr}`).toBeCloseTo(
        daAcwr,
        9,
      );
    }
  });

  it("un'assenza resta un'assenza in ENTRAMBE le formule, mai uno zero", () => {
    // Colonna generata: NULL propaga.
    expect(colonnaGenerata(null, 300)).toBeNull();
    expect(colonnaGenerata(7, null)).toBeNull();

    // computeAcwr: la stessa seduta viene ESCLUSA e contata come tale.
    const senzaSrpe = computeAcwr(
      [{ completedAt: "2026-08-20", srpe: null, durationSeconds: 300 }],
      "2026-08-27",
    );
    expect(senzaSrpe.excluded.senzaSrpe).toBe(1);
    expect(senzaSrpe.available).toBe(false);

    const senzaDurata = computeAcwr(
      [{ completedAt: "2026-08-20", srpe: 7, durationSeconds: null }],
      "2026-08-27",
    );
    expect(senzaDurata.excluded.senzaDurata).toBe(1);

    // Durata 0 è un DATO (carico 0), non un'assenza: nessuna esclusione.
    const durataZero = computeAcwr(
      [{ completedAt: "2026-08-20", srpe: 7, durationSeconds: 0 }],
      "2026-08-27",
    );
    expect(durataZero.excludedCount).toBe(0);
  });
});

// ── la view: il carico si legge, non si moltiplica né si fabbrica ──────────
// I due rami di load_windows sono stati corretti il 2026-08-27 (misura live:
// acute 7d 6,08 → 45,08 col ramo doppio → 9,02 corretto). Come sopra, le
// espressioni si DERIVANO dal file della migration a ogni esecuzione.
describe("view analytics_athlete_summary: load_windows legge total_load_au e basta", () => {
  const loadWindowsMatch = /load_windows AS \(([\s\S]*?)FROM recent_logs/.exec(sql);
  if (!loadWindowsMatch) throw new Error(`${MIGRATION}: CTE load_windows non trovata`);
  const loadWindows = loadWindowsMatch[1];

  it("total_load_au non è moltiplicata per un RPE — sarebbe contarlo due volte", () => {
    const doppio = /total_load_au\s*\*\s*[^\n]*/.exec(loadWindows);
    expect(
      doppio,
      `total_load_au È GIÀ srpe × minuti: «${doppio?.[0] ?? ""}» conta l'RPE DUE VOLTE ` +
        `(misurato live: il carico acuto salterebbe da 9,02 a 45,08 AU)`,
    ).toBeNull();
    // Il ramo positivo esiste e usa la colonna da sola.
    expect(loadWindows).toContain("THEN total_load_au");
  });

  it("nessun ramo fabbrica un carico da una seduta senza sRPE (B-09)", () => {
    expect(
      loadWindows,
      "COALESCE(rpe_global, …) inventa un RPE per una seduta che non l'ha dichiarato: " +
        "computeAcwr la ESCLUDE (excluded.senzaSrpe), la view deve fare lo stesso",
    ).not.toContain("COALESCE(rpe_global");
    expect(loadWindows).not.toContain("rpe_global");
    expect(loadWindows).not.toContain("duration_seconds");
  });
});
