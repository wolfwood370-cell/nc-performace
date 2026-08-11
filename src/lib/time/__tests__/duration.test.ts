// =============================================================================
// src/lib/time/__tests__/duration.test.ts
// =============================================================================
// Pins the duration formatters introduced by the rpe-non-preselezionato
// slice:
//   - formatDurationHuman renders the REAL elapsed time in the debrief hero:
//     the 34-second session of 2026-08-09 must read "34s", never the old
//     static "1h 15m".
//   - formatMMSS is the single shared chronometer formatter (previously
//     duplicated byte-identical in ActiveWorkout and ExitWorkoutDialog);
//     its behavior — zero-padding, clamp at 0, floor of fractional
//     seconds — is pinned so the extraction cannot drift.
// =============================================================================

import { describe, expect, it } from "vitest";
import { formatDurationHuman, formatMMSS } from "../duration";

describe("formatMMSS", () => {
  it("zero → 00:00", () => {
    expect(formatMMSS(0)).toBe("00:00");
  });

  it("sotto il minuto → secondi con padding", () => {
    expect(formatMMSS(34)).toBe("00:34");
    expect(formatMMSS(59)).toBe("00:59");
  });

  it("confine del minuto: 59→00:59, 60→01:00, 61→01:01", () => {
    expect(formatMMSS(60)).toBe("01:00");
    expect(formatMMSS(61)).toBe("01:01");
  });

  it("oltre l'ora i minuti NON si azzerano (formato cronometro)", () => {
    expect(formatMMSS(3599)).toBe("59:59");
    expect(formatMMSS(3600)).toBe("60:00");
    expect(formatMMSS(4500)).toBe("75:00");
  });

  it("i negativi sono clampati a zero", () => {
    expect(formatMMSS(-5)).toBe("00:00");
  });

  it("i secondi frazionari sono troncati, mai arrotondati in su", () => {
    expect(formatMMSS(61.9)).toBe("01:01");
  });
});

describe("formatDurationHuman", () => {
  it("zero → 0s", () => {
    expect(formatDurationHuman(0)).toBe("0s");
  });

  it("la sessione di 34 secondi del 2026-08-09 legge 34s", () => {
    expect(formatDurationHuman(34)).toBe("34s");
  });

  it("confine del minuto: 59→59s, 60→1m, 61→1m (sotto l'ora niente secondi)", () => {
    expect(formatDurationHuman(59)).toBe("59s");
    expect(formatDurationHuman(60)).toBe("1m");
    expect(formatDurationHuman(61)).toBe("1m");
    expect(formatDurationHuman(119)).toBe("1m");
    expect(formatDurationHuman(120)).toBe("2m");
  });

  it("confine dell'ora: 3599→59m, 3600→1h, 3660→1h 1m", () => {
    expect(formatDurationHuman(3599)).toBe("59m");
    expect(formatDurationHuman(3600)).toBe("1h");
    expect(formatDurationHuman(3660)).toBe("1h 1m");
  });

  it("il vecchio mock 1h 15m corrisponde a 4500 secondi reali", () => {
    expect(formatDurationHuman(4500)).toBe("1h 15m");
  });

  it("le ore piene omettono i minuti a zero", () => {
    expect(formatDurationHuman(7200)).toBe("2h");
  });

  it("i negativi sono clampati a zero", () => {
    expect(formatDurationHuman(-5)).toBe("0s");
  });

  it("i secondi frazionari sono troncati", () => {
    expect(formatDurationHuman(34.9)).toBe("34s");
  });
});
