// Round-trip test with the REAL coach release builder (same pattern as the v1
// parity test): a typed ProgramBlock — values that do NOT resemble each other
// — goes through buildCoachProgramDocument -> validateCoachProgramDocument ->
// parseReleaseDocument -> dayForDate, and every value the athlete observes
// must be identical to what the coach prescribed, set by set. The typed
// fixture also pins, at compile time, that a ProgramBlock is structurally
// assignable to the builder's input.

import { describe, expect, it } from "vitest";
import {
  buildCoachProgramDocument,
  defaultSessionDates,
  validateCoachProgramDocument,
} from "../../../../supabase/functions/_shared/program/coachRelease.ts";
import type { CoachBlockSource } from "../../../../supabase/functions/_shared/program/coachRelease.ts";
import type { ProgramBlock, ProgrammedSet } from "@/types/training";
import { dayForDate, formatReleaseSetLine, parseReleaseDocument } from "../releaseView";
import type { ReleaseSetView } from "../releaseView";

// --- the coach's block: 3 weeks, uneven sessions, values that differ ----------

const set = (
  n: number,
  reps: string,
  rest: number,
  extra: Partial<ProgrammedSet> = {},
): ProgrammedSet => ({
  id: `set-${n}-${reps}-${rest}`,
  set_number: n,
  reps_target: reps,
  rest_seconds: rest,
  ...extra,
});

const block: ProgramBlock = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Blocco Coach",
  goal: "Strength",
  athlete_id: "33333333-3333-4333-8333-333333333333",
  start_date: "2026-09-07",
  updated_at: "2026-08-20T12:00:00.000Z",
  description: "Blocco di prova del coach",
  weeks: [
    {
      id: "w1",
      order: 1,
      sessions: [
        {
          id: "s1",
          name: "Lower Heavy",
          order: 0,
          focus: "Squat day",
          exercises: [
            {
              id: "e1",
              exercise_id: "ex-squat",
              exercise_name: "Back Squat",
              order: 0,
              coach_notes: "Brace before descent",
              sets: [
                set(1, "8", 90, { rpe_target: 7 }),
                set(2, "6", 150, { rpe_target: 8.5 }),
                set(3, "AMRAP", 180, { rir_target: 1 }),
              ],
            },
            {
              id: "e2",
              exercise_id: "ex-bench",
              exercise_name: "Bench Press",
              order: 1,
              sets: [
                set(1, "5", 120, { percent_1rm_target: 72, tempo: "3-1-1-0" }),
                set(2, "5", 120, { percent_1rm_target: 72, tempo: "3-1-1-0" }),
              ],
            },
          ],
        },
        {
          id: "s2",
          name: "Upper Light",
          order: 1,
          exercises: [
            {
              id: "e3",
              exercise_id: "ex-press",
              exercise_name: "Overhead Press",
              order: 0,
              sets: [set(1, "10", 60, { rpe_target: 6 })],
            },
          ],
        },
      ],
    },
    {
      id: "w2",
      order: 2,
      sessions: [
        {
          id: "s3",
          name: "Superset Day",
          order: 0,
          exercises: [
            {
              id: "e4",
              exercise_id: "ex-row",
              exercise_name: "Barbell Row",
              order: 0,
              superset_id: "ss-1",
              sets: [set(1, "12", 0, { rir_target: 2 }), set(2, "12", 90, { rir_target: 2 })],
            },
            {
              id: "e5",
              exercise_id: "ex-curl",
              exercise_name: "Biceps Curl",
              order: 1,
              superset_id: "ss-1",
              sets: [set(1, "15", 60, { is_warmup: true })],
            },
          ],
        },
      ],
    },
    {
      id: "w3",
      order: 3,
      sessions: [
        {
          id: "s4",
          name: "Test Day",
          order: 0,
          exercises: [
            {
              id: "e6",
              exercise_id: "ex-dl",
              exercise_name: "Deadlift",
              order: 0,
              sets: [set(1, "3", 240, { rpe_target: 9 }), set(2, "3", 240, { rpe_target: 9 })],
            },
          ],
        },
      ],
    },
  ],
};

// ProgramBlock -> builder input: the same mapping the edge function performs
// on the program_blocks row. Assignability of `weeks` is the compile-time pin.
const source: CoachBlockSource = {
  block_id: block.id,
  block_updated_at: block.updated_at!,
  name: block.name,
  goal: block.goal,
  start_date: block.start_date,
  description: block.description,
  weeks: block.weeks,
};

// The coach confirms the pre-filled dates but MOVES the week-3 session:
// what enters the document is what was confirmed, not the convention.
const dates = defaultSessionDates(source.start_date, source.weeks).map((d) =>
  d.session_id === "w3-s1" ? { ...d, date: "2026-09-23" } : d,
);

const document = buildCoachProgramDocument(source, dates);

/** Normalized per-set record carrying its own identity, so a mismatch NAMES
 *  the diverging set (week/session/exercise/set) in the assertion diff. */
type SetRecord = {
  key: string;
  reps: string;
  rpe: number | null;
  rir: number | null;
  percent_1rm: number | null;
  rest_seconds: number;
  tempo: string | null;
  is_warmup: boolean;
};

function prescribedRecords(): SetRecord[] {
  const out: SetRecord[] = [];
  for (const week of block.weeks) {
    week.sessions.forEach((session, sIdx) => {
      session.exercises.forEach((ex, eIdx) => {
        ex.sets.forEach((s) => {
          out.push({
            key: `w${week.order}-s${sIdx + 1}-e${eIdx + 1}#${s.set_number}`,
            reps: s.reps_target,
            rpe: s.rpe_target ?? null,
            rir: s.rir_target ?? null,
            percent_1rm: s.percent_1rm_target ?? null,
            rest_seconds: s.rest_seconds,
            tempo: s.tempo ?? null,
            is_warmup: s.is_warmup === true,
          });
        });
      });
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

function observedRecords(): SetRecord[] {
  const view = parseReleaseDocument(document);
  expect(view).not.toBeNull();
  const out: SetRecord[] = [];
  for (const { session_id, date } of dates) {
    const day = dayForDate(view!, date);
    expect(day, `nessuna seduta osservata il ${date} (${session_id})`).not.toBeNull();
    day!.exercises.forEach((ex) => {
      expect(ex.sets_detail).toBeDefined();
      ex.sets_detail!.forEach((s: ReleaseSetView) => {
        out.push({
          key: `${ex.id}#${s.set_number}`,
          reps: s.reps,
          rpe: s.rpe,
          rir: s.rir,
          percent_1rm: s.percent_1rm,
          rest_seconds: s.rest_seconds,
          tempo: s.tempo,
          is_warmup: s.is_warmup,
        });
      });
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

describe("andata e ritorno coach -> atleta (documento v2)", () => {
  it("il documento costruito passa il validatore", () => {
    expect(validateCoachProgramDocument(document)).toEqual({ ok: true });
  });

  it("ogni valore osservato dall'atleta è identico al prescritto, serie per serie", () => {
    const prescribed = prescribedRecords();
    const observed = observedRecords();
    expect(observed).toHaveLength(prescribed.length);
    expect(observed).toEqual(prescribed);
  });

  it("il giorno è quello CONFERMATO dal coach: confronto esatto sulla data", () => {
    const view = parseReleaseDocument(document)!;
    // Moved session: found on the confirmed date, NOT on the convention date.
    expect(dayForDate(view, "2026-09-23")?.sessionId).toBe("w3-s1");
    expect(dayForDate(view, "2026-09-21")).toBeNull(); // convention date, refused
    // Unassigned day = rest.
    expect(dayForDate(view, "2026-09-10")).toBeNull();
    expect(view.version).toBe(2);
  });

  it("superset, tempo e note del coach sopravvivono al viaggio", () => {
    const view = parseReleaseDocument(document)!;
    const supersetDay = dayForDate(view, "2026-09-14")!;
    expect(supersetDay.exercises[0].superset_id).toBe("ss-1");
    expect(supersetDay.exercises[1].superset_id).toBe("ss-1");
    const lower = dayForDate(view, "2026-09-07")!;
    expect(lower.exercises[0].coach_notes).toBe("Brace before descent");
    expect(lower.exercises[1].sets_detail![0].tempo).toBe("3-1-1-0");
  });
});

describe("l'assenza resta assenza nella vista", () => {
  it("esercizio senza rpe_target: rpe null nel documento, nessuna etichetta RPE", () => {
    const bench = document.days[0].exercises[1];
    expect(bench.sets[0].rpe).toBeNull();
    const view = parseReleaseDocument(document)!;
    const benchView = dayForDate(view, "2026-09-07")!.exercises[1];
    expect(benchView.scheme).not.toContain("RPE");
    for (const s of benchView.sets_detail!) {
      expect(formatReleaseSetLine(s)).not.toContain("RPE");
    }
  });

  it("serie uniformi: riga compatta; serie diverse: «N serie» + elenco, mai la prima per tutte", () => {
    const view = parseReleaseDocument(document)!;
    const lower = dayForDate(view, "2026-09-07")!;
    const squat = lower.exercises[0];
    expect(squat.uniform).toBe(false);
    expect(squat.scheme).toBe("3 serie");
    expect(formatReleaseSetLine(squat.sets_detail![0])).toBe("1 · 8 reps · RPE 7 · rec 90s");
    expect(formatReleaseSetLine(squat.sets_detail![1])).toBe("2 · 6 reps · RPE 8.5 · rec 150s");
    expect(formatReleaseSetLine(squat.sets_detail![2])).toBe("3 · AMRAP reps · RIR 1 · rec 180s");
    const bench = lower.exercises[1];
    expect(bench.uniform).toBe(true);
    expect(bench.scheme).toBe("2 Serie × 5 Reps · 72% 1RM · rec 120s · tempo 3-1-1-0");
  });

  it("un rpe forzato a 0 nel documento viene bocciato dal validatore", () => {
    const poisoned = buildCoachProgramDocument(source, dates);
    poisoned.days[0].exercises[1].sets[0].rpe = 0;
    const res = validateCoachProgramDocument(poisoned);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.errors.join("\n")).toContain("days[0].exercises[1].sets[0].rpe");
    }
  });
});

describe("le forme rotte degradano a null (v2)", () => {
  it("giorno senza data, senza esercizi o con serie malformata -> null, senza lanciare", () => {
    expect(parseReleaseDocument({ version: 2, days: [] })).toBeNull();
    expect(
      parseReleaseDocument({
        version: 2,
        days: [{ session_id: "w1-s1", exercises: [] }],
      }),
    ).toBeNull();
    // A day with zero exercises is malformed, not a rest day: the writer
    // skips empty sessions, so the athlete must never read "0 esercizi".
    expect(
      parseReleaseDocument({
        version: 2,
        days: [{ session_id: "w1-s1", date: "2026-09-07", exercises: [] }],
      }),
    ).toBeNull();
    expect(
      parseReleaseDocument({
        version: 2,
        days: [
          {
            session_id: "w1-s1",
            date: "2026-09-07",
            exercises: [{ name: "X", sets: [{ set_number: 1 }] }],
          },
        ],
      }),
    ).toBeNull();
  });
});
