// Test falsificabili per rpeTable.ts — spot-check dalla Tabella RPE di Nicolo.
// REGOLA: se un test fallisce contro la tabella, VINCE LA CSV — non toccare i
// numeri di rpeTable.ts, correggere il test (o rigenerare dalla CSV).

import { assertEquals } from "jsr:@std/assert@1";
import { percent1RM, REPS_MAX, RPE_MAX, RPE_MIN, RPE_PERCENT_TABLE, RPE_ROWS } from "./rpeTable.ts";

Deno.test("spot-check esatti dalla Tabella di Nicolo", () => {
  assertEquals(percent1RM(10, 1), 100.0);
  assertEquals(percent1RM(9, 1), 97.6);
  assertEquals(percent1RM(9, 3), 92.8);
  assertEquals(percent1RM(8, 5), 86.2);
  assertEquals(percent1RM(8, 8), 80.0);
  assertEquals(percent1RM(8.5, 8), 81.0);
  assertEquals(percent1RM(7, 10), 74.3);
  assertEquals(percent1RM(6, 12), 69.0);
  assertEquals(percent1RM(10, 5), 90.6);
});

Deno.test("reps oltre 45: valore della colonna 45, nessuna estrapolazione", () => {
  assertEquals(percent1RM(10, 46), RPE_PERCENT_TABLE["10.0"][REPS_MAX - 1]);
  assertEquals(percent1RM(10, 100), percent1RM(10, 45));
  assertEquals(percent1RM(7.5, 46), percent1RM(7.5, 45));
});

Deno.test("RPE agganciato a [1,10] e arrotondato al passo 0.5", () => {
  assertEquals(percent1RM(11, 1), percent1RM(10, 1));
  assertEquals(percent1RM(0, 1), percent1RM(1, 1));
  assertEquals(percent1RM(-3, 5), percent1RM(1, 5));
  assertEquals(percent1RM(8.3, 8), percent1RM(8.5, 8)); // 8.3 -> 8.5
  assertEquals(percent1RM(8.2, 8), percent1RM(8.0, 8)); // 8.2 -> 8.0
  assertEquals(percent1RM(8.25, 8), percent1RM(8.5, 8)); // mezzo passo -> arrotonda su
});

Deno.test("reps arrotondate all'intero e agganciate a [1,45]", () => {
  assertEquals(percent1RM(8, 0), percent1RM(8, 1));
  assertEquals(percent1RM(8, -5), percent1RM(8, 1));
  assertEquals(percent1RM(8, 7.4), percent1RM(8, 7));
  assertEquals(percent1RM(8, 7.5), percent1RM(8, 8));
});

Deno.test("integrità tabella: 19 righe x 45 colonne, chiavi allineate a RPE_ROWS", () => {
  assertEquals(Object.keys(RPE_PERCENT_TABLE).length, 19);
  assertEquals(RPE_ROWS.length, 19);
  for (const r of RPE_ROWS) {
    const row = RPE_PERCENT_TABLE[r.toFixed(1)];
    assertEquals(Array.isArray(row), true, `riga RPE ${r} mancante`);
    assertEquals(row.length, REPS_MAX, `riga RPE ${r}: attese ${REPS_MAX} colonne`);
  }
  assertEquals(RPE_MIN, 1.0);
  assertEquals(RPE_MAX, 10.0);
});

Deno.test("monotonia: %1RM decresce lungo le reps e al calare dell'RPE", () => {
  // Lungo la riga: più ripetizioni allo stesso RPE = %1RM più basso.
  for (const r of RPE_ROWS) {
    const row = RPE_PERCENT_TABLE[r.toFixed(1)];
    for (let i = 1; i < row.length; i++) {
      if (!(row[i] < row[i - 1])) {
        throw new Error(
          `riga RPE ${r}: colonna ${i + 1} non decresce (${row[i - 1]} -> ${row[i]})`,
        );
      }
    }
  }
  // A parità di reps: RPE più basso = %1RM più basso (RPE_ROWS va da 10.0 a 1.0).
  for (let i = 1; i < RPE_ROWS.length; i++) {
    const hi = RPE_PERCENT_TABLE[RPE_ROWS[i - 1].toFixed(1)];
    const lo = RPE_PERCENT_TABLE[RPE_ROWS[i].toFixed(1)];
    for (let c = 0; c < REPS_MAX; c++) {
      if (!(lo[c] < hi[c])) {
        throw new Error(
          `reps ${c + 1}: RPE ${RPE_ROWS[i]} (${lo[c]}) non è sotto RPE ${RPE_ROWS[i - 1]} (${hi[c]})`,
        );
      }
    }
  }
});
