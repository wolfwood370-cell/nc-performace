/**
 * La durata a schermo è una VISTA di workout_logs.duration_seconds:
 * arrotonda qui, mai nel dato. Un'assenza resta un'assenza (null → il
 * chiamante non rende nulla) e «0 min» non esiste: sarebbe un'assenza
 * travestita da misura.
 */
import { describe, expect, it } from "vitest";
import { formatDurataSeduta } from "../durataSeduta";

describe("formatDurataSeduta", () => {
  it("assenza → null: il chiamante non mostra nulla", () => {
    expect(formatDurataSeduta(null)).toBeNull();
    expect(formatDurataSeduta(undefined)).toBeNull();
    expect(formatDurataSeduta(Number.NaN)).toBeNull();
  });

  it("deriva i minuti arrotondati dai secondi", () => {
    expect(formatDurataSeduta(3120)).toBe("52 min"); // 52′ esatti
    expect(formatDurataSeduta(3600)).toBe("60 min");
    expect(formatDurataSeduta(52)).toBe("1 min"); // 0,87′ → 1
    expect(formatDurataSeduta(89)).toBe("1 min"); // 1,48′ → 1
    expect(formatDurataSeduta(91)).toBe("2 min"); // 1,52′ → 2
  });

  it("una seduta sotto il mezzo minuto dice «<1 min», mai «0 min»", () => {
    expect(formatDurataSeduta(20)).toBe("<1 min");
    expect(formatDurataSeduta(0)).toBe("<1 min");
  });

  it("«0 min» non esce per NESSUN input", () => {
    for (let s = 0; s <= 7200; s += 7) {
      expect(formatDurataSeduta(s)).not.toBe("0 min");
    }
  });
});
