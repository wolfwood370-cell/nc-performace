// =============================================================================
// TIMEZONE boundary test — the fuse is FIXED INSIDE the test.
//
// On 2026-08-22 replacing localIsoDate's local calendar with toISOString()
// left the whole suite green, because container and CI run in UTC — the only
// environment where that defect cannot show. A test that runs only where the
// defect cannot manifest measures itself: here process.env.TZ is set by the
// test, with a guard assertion so an environment that ignores TZ fails loud
// instead of passing silent.
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localIsoDate } from "@/lib/program/releaseView";

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  // Node flushes its date-time cache when process.env.TZ changes (verified
  // on Windows and Linux); the guard test below proves it took effect.
  process.env.TZ = "Europe/Rome";
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("localIsoDate — il fuso lo fissa il test, non l'ambiente", () => {
  it("guardia: l'ambiente onora TZ=Europe/Rome (offset estivo -120)", () => {
    expect(new Date("2026-08-22T00:30:00+02:00").getTimezoneOffset()).toBe(-120);
  });

  it("00:30 del 22/08 a Roma è il 22 — il gemello UTC direbbe ancora il 21", () => {
    const d = new Date("2026-08-22T00:30:00+02:00");
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(localIsoDate(d)).toBe("2026-08-22");
  });

  it("ora solare: 00:30 del 15/01 a Roma (offset -60) è il 15, non il 14", () => {
    const d = new Date("2026-01-15T00:30:00+01:00");
    expect(d.getTimezoneOffset()).toBe(-60);
    expect(d.toISOString().slice(0, 10)).toBe("2026-01-14");
    expect(localIsoDate(d)).toBe("2026-01-15");
  });
});
