// Selectors shared by home / Training Hub / debrief (ONE door — defect D6):
// day-for-date across both document versions, prescribed RPE range (a
// quotation of the sets, never a mean), session title with the day-name
// fallback (empty focus is the NORMAL case on real releases). Fixtures
// round-trip through the REAL parser, house pattern of releaseView tests.

import { describe, expect, it } from "vitest";
import {
  formatSessionRpeRange,
  localIsoDate,
  parseReleaseDocument,
  sessionForDate,
  sessionRpeRange,
  sessionTitle,
} from "../releaseView";

// ---------------------------------------------------------------------------
// Fixture builders — raw jsonb-shaped documents, parsed by the real parser.
// ---------------------------------------------------------------------------

interface RawSetV2 {
  set_number: number;
  reps: string;
  rpe: number | null;
  rir: number | null;
  percent_1rm: number | null;
  rest_seconds: number;
  tempo: string | null;
  is_warmup: boolean;
}

const rawSet = (
  setNumber: number,
  rpe: number | null,
  percent1rm: number | null = null,
): RawSetV2 => ({
  set_number: setNumber,
  reps: "5",
  rpe,
  rir: null,
  percent_1rm: percent1rm,
  rest_seconds: 90,
  tempo: null,
  is_warmup: false,
});

const v2Day = (dayIndex: number, dayName: string, date: string, sets: RawSetV2[], focus = "") => ({
  session_id: `s${dayIndex + 1}`,
  day_index: dayIndex,
  day_name: dayName,
  focus,
  date,
  week_order: 1,
  exercises: [{ item_id: `s${dayIndex + 1}-e1`, name: "Back Squat", sets }],
});

const v2Doc = (days: ReturnType<typeof v2Day>[]) => ({
  version: 2,
  goal: "forza",
  rationale: "",
  name: "Blocco 1",
  days,
});

const v1Doc = (rpes: number[]) => ({
  version: 1,
  goal: "forza",
  rationale: "",
  days: rpes.map((rpe, i) => ({
    session_id: `s${i + 1}`,
    day_index: i,
    day_name: `Giorno ${i + 1}`,
    focus: `Focus ${i + 1}`,
    exercises: [{ item_id: `s${i + 1}-e1`, name: "Back Squat", sets: 4, reps: "6", load: "", rpe }],
  })),
});

// Mirrors the real release read on the DB (2026-08-22, rilascio a8d5fea4):
// 4 days, focus EMPTY on every one, 1 exercise per day, day 1 at RPE 7.5/8/9.
const realisticDoc = v2Doc([
  v2Day(0, "Giorno 1", "2026-08-24", [rawSet(1, 7.5), rawSet(2, 8), rawSet(3, 9)]),
  v2Day(1, "Giorno 2", "2026-08-26", [rawSet(1, 8), rawSet(2, 8)]),
  v2Day(2, "Giorno 3", "2026-08-28", [rawSet(1, null, 80), rawSet(2, null, 85)]),
  v2Day(3, "Giorno 4", "2026-08-30", [rawSet(1, 7)]),
]);

const realisticView = parseReleaseDocument(realisticDoc)!;

describe("sessionForDate — una porta per tutte le schermate", () => {
  it("v2: corrispondenza ESATTA sulla data confermata dal coach, altrimenti riposo", () => {
    expect(sessionForDate(realisticView, "2026-08-24")?.dayName).toBe("Giorno 1");
    expect(sessionForDate(realisticView, "2026-08-26")?.dayName).toBe("Giorno 2");
    // The day between two sessions is a rest day, not a fallback session.
    expect(sessionForDate(realisticView, "2026-08-25")).toBeNull();
    expect(sessionForDate(realisticView, "2026-09-01")).toBeNull();
  });

  it("v2: data malformata → null, mai un giorno inventato", () => {
    expect(sessionForDate(realisticView, "24/08/2026")).toBeNull();
    expect(sessionForDate(realisticView, "")).toBeNull();
  });

  it("v1: lunedì → Giorno 1, oltre la lunghezza del programma → riposo", () => {
    const v1View = parseReleaseDocument(v1Doc([7, 8, 9]))!;
    // 2026-08-17 is a Monday, 2026-08-19 a Wednesday, 2026-08-20 a Thursday.
    expect(sessionForDate(v1View, "2026-08-17")?.dayName).toBe("Giorno 1");
    expect(sessionForDate(v1View, "2026-08-19")?.dayName).toBe("Giorno 3");
    expect(sessionForDate(v1View, "2026-08-20")).toBeNull();
    expect(sessionForDate(v1View, "2026-08-23")).toBeNull();
  });

  it("v1: data malformata → null anche sul percorso weekday", () => {
    const v1View = parseReleaseDocument(v1Doc([7]))!;
    expect(sessionForDate(v1View, "not-a-date")).toBeNull();
  });
});

describe("sessionRpeRange — l'intervallo prescritto, mai la media", () => {
  it("v2: serie a 7.5/8/9 → intervallo 7.5–9 (non una media arrotondata)", () => {
    const day = sessionForDate(realisticView, "2026-08-24")!;
    expect(sessionRpeRange(day)).toEqual({ min: 7.5, max: 9 });
  });

  it("v2: serie tutte allo stesso RPE → min === max", () => {
    const day = sessionForDate(realisticView, "2026-08-26")!;
    expect(sessionRpeRange(day)).toEqual({ min: 8, max: 8 });
  });

  it("v2: nessun RPE scritto (solo %1RM) → null, mai un intervallo a 0", () => {
    const day = sessionForDate(realisticView, "2026-08-28")!;
    expect(sessionRpeRange(day)).toBeNull();
  });

  it("v2: un RPE 0 difensivo conta come non-prescritto, non come minimo", () => {
    const view = parseReleaseDocument(
      v2Doc([v2Day(0, "Giorno 1", "2026-08-24", [rawSet(1, 0), rawSet(2, 8)])]),
    )!;
    expect(sessionRpeRange(view.days[0])).toEqual({ min: 8, max: 8 });
  });

  it("v1: RPE per esercizio → intervallo; lo 0 legacy è assenza", () => {
    const spread = parseReleaseDocument(v1Doc([7, 9]))!;
    // v1 has one exercise per fixture day: range across the day's exercises.
    const twoExercises = {
      ...spread.days[0],
      exercises: [...spread.days[0].exercises, ...spread.days[1].exercises],
    };
    expect(sessionRpeRange(twoExercises)).toEqual({ min: 7, max: 9 });

    const zeroed = parseReleaseDocument(v1Doc([0]))!;
    expect(sessionRpeRange(zeroed.days[0])).toBeNull();
  });
});

describe("formatSessionRpeRange — etichetta della prescrizione", () => {
  it("intervallo aperto → 'RPE serie 7.5–9'; collassato → 'RPE serie 8'", () => {
    expect(formatSessionRpeRange({ min: 7.5, max: 9 })).toBe("RPE serie 7.5–9");
    expect(formatSessionRpeRange({ min: 8, max: 8 })).toBe("RPE serie 8");
  });
});

describe("sessionTitle — focus vuoto è il caso normale", () => {
  it("focus vuoto o solo spazi → nome del giorno; focus scritto → focus", () => {
    const day = sessionForDate(realisticView, "2026-08-24")!;
    expect(sessionTitle(day)).toBe("Giorno 1");
    expect(sessionTitle({ ...day, focus: "   " })).toBe("Giorno 1");
    expect(sessionTitle({ ...day, focus: "Upper Push" })).toBe("Upper Push");
  });
});

describe("localIsoDate — il calendario LOCALE del chiamante", () => {
  it("formatta i componenti locali della Date, con lo zero-padding", () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
