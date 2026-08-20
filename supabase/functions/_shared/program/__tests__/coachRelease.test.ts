// Falsifiable tests for the coach release module (schema v2): civil-date
// arithmetic without Date, the pre-fill convention, the builder's
// null-not-zero mapping, and the boundary validator that rejects the
// 0-as-absent ambiguity v1 carries.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  addDaysIso,
  buildCoachProgramDocument,
  COACH_PROGRAM_SCHEMA_VERSION,
  defaultSessionDates,
  isIsoDate,
  sessionIdFor,
  validateCoachProgramDocument,
} from "../coachRelease.ts";
import type { CoachBlockSource, CoachProgramDocumentV2 } from "../coachRelease.ts";

// --- fixture: 2 weeks, uneven sessions, mixed prescriptions -------------------

const source: CoachBlockSource = {
  block_id: "11111111-1111-4111-8111-111111111111",
  block_updated_at: "2026-08-20T10:00:00.000Z",
  name: "Blocco Forza",
  goal: "Strength",
  start_date: "2026-09-07",
  description: undefined,
  weeks: [
    {
      order: 1,
      sessions: [
        {
          name: "Lower Heavy",
          order: 0,
          focus: "Squat",
          exercises: [
            {
              exercise_id: "ex-squat",
              exercise_name: "Back Squat",
              order: 0,
              coach_notes: "Brace hard",
              sets: [
                {
                  set_number: 1,
                  reps_target: "8",
                  rpe_target: 7,
                  rest_seconds: 90,
                },
                {
                  set_number: 2,
                  reps_target: "6",
                  rpe_target: 8.5,
                  rest_seconds: 150,
                },
                {
                  set_number: 3,
                  reps_target: "AMRAP",
                  rir_target: 1,
                  rest_seconds: 180,
                },
              ],
            },
            {
              exercise_id: "ex-bench",
              exercise_name: "Bench Press",
              order: 1,
              sets: [
                {
                  set_number: 1,
                  reps_target: "5",
                  percent_1rm_target: 72,
                  rest_seconds: 120,
                  tempo: "3-1-1-0",
                },
              ],
            },
          ],
        },
        { name: "Upper", order: 1, exercises: [] },
      ],
    },
    {
      order: 2,
      sessions: [
        {
          name: "Full Body",
          order: 0,
          exercises: [
            {
              exercise_id: "ex-row",
              exercise_name: "Barbell Row",
              order: 0,
              superset_id: "ss-1",
              sets: [
                {
                  set_number: 1,
                  reps_target: "10",
                  rir_target: 0,
                  rest_seconds: 60,
                  is_warmup: true,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const dates = defaultSessionDates(source.start_date, source.weeks);

// --- civil-date arithmetic ----------------------------------------------------

Deno.test("addDaysIso: confini di mese, anno e bisestile senza Date", () => {
  assertEquals(addDaysIso("2026-09-07", 0), "2026-09-07");
  assertEquals(addDaysIso("2026-09-30", 1), "2026-10-01");
  assertEquals(addDaysIso("2026-12-31", 1), "2027-01-01");
  assertEquals(addDaysIso("2028-02-28", 1), "2028-02-29"); // leap year
  assertEquals(addDaysIso("2026-02-28", 1), "2026-03-01"); // non-leap
  assertEquals(addDaysIso("2026-09-07", 7), "2026-09-14");
});

Deno.test("isIsoDate: accetta solo date di calendario reali", () => {
  assert(isIsoDate("2026-09-07"));
  assert(!isIsoDate("2026-02-31"));
  assert(!isIsoDate("2026-9-7"));
  assert(!isIsoDate("07/09/2026"));
  assert(!isIsoDate(20260907));
  assert(!isIsoDate(null));
});

// --- pre-fill convention ------------------------------------------------------

Deno.test("defaultSessionDates: start + 7*(settimana-1) + indice, id stabili", () => {
  // "Upper" (w1-s2) has no exercises: nothing prescribed, no date row —
  // review 2026-08-20. Ids stay positional over the FULL session list.
  assertEquals(dates, [
    { session_id: "w1-s1", date: "2026-09-07" },
    { session_id: "w2-s1", date: "2026-09-14" },
  ]);
  // Deterministic: same input, same output.
  assertEquals(defaultSessionDates(source.start_date, source.weeks), dates);
  assertEquals(sessionIdFor(3, 2), "w3-s2");
});

// --- builder ------------------------------------------------------------------

function build(): CoachProgramDocumentV2 {
  return buildCoachProgramDocument(source, dates);
}

Deno.test("builder: una voce per serie, valori identici alla prescrizione", () => {
  const doc = build();
  assertEquals(doc.version, COACH_PROGRAM_SCHEMA_VERSION);
  assertEquals(doc.source.block_id, source.block_id);
  assertEquals(doc.days.length, 2); // the empty "Upper" session is NOT delivered
  const squat = doc.days[0].exercises[0];
  assertEquals(squat.item_id, "w1-s1-e1");
  assertEquals(squat.sets.length, 3);
  assertEquals(squat.sets[0], {
    set_number: 1,
    reps: "8",
    rpe: 7,
    rir: null,
    percent_1rm: null,
    rest_seconds: 90,
    tempo: null,
    is_warmup: false,
  });
  assertEquals(squat.sets[1].rpe, 8.5);
  assertEquals(squat.sets[1].rest_seconds, 150);
  assertEquals(squat.sets[2], {
    set_number: 3,
    reps: "AMRAP",
    rpe: null,
    rir: 1,
    percent_1rm: null,
    rest_seconds: 180,
    tempo: null,
    is_warmup: false,
  });
});

Deno.test("builder: assente resta null — mai 0, mai default (B-09)", () => {
  const doc = build();
  const bench = doc.days[0].exercises[1];
  assertEquals(bench.sets[0].rpe, null); // no RPE prescribed: null, not 0
  assertEquals(bench.sets[0].rir, null);
  assertEquals(bench.sets[0].percent_1rm, 72);
  assertEquals(bench.sets[0].tempo, "3-1-1-0");
  const row = doc.days[1].exercises[0];
  assertEquals(row.sets[0].rir, 0); // RIR 0 is a REAL prescription, preserved
  assertEquals(row.sets[0].is_warmup, true);
  assertEquals(row.superset_id, "ss-1");
  assertEquals(doc.rationale, ""); // no description: empty, never invented
});

Deno.test("builder: il sentinel 0 dei produttori legacy diventa null (RIR 0 resta)", () => {
  // v1 and aiProgramMapper write 0 for "absent" on RPE/%1RM — scales where 0
  // is not a value. The build boundary refuses to inherit the ambiguity.
  const sentinel: CoachBlockSource = {
    ...source,
    weeks: [
      {
        order: 1,
        sessions: [
          {
            name: "S",
            order: 0,
            exercises: [
              {
                exercise_id: "ex-x",
                exercise_name: "X",
                order: 0,
                sets: [
                  {
                    set_number: 1,
                    reps_target: "8",
                    rpe_target: 0,
                    percent_1rm_target: 0,
                    rir_target: 0,
                    rest_seconds: 90,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const doc = buildCoachProgramDocument(sentinel, [{ session_id: "w1-s1", date: "2026-09-07" }]);
  assertEquals(doc.days[0].exercises[0].sets[0].rpe, null);
  assertEquals(doc.days[0].exercises[0].sets[0].percent_1rm, null);
  assertEquals(doc.days[0].exercises[0].sets[0].rir, 0);
  assertEquals(validateCoachProgramDocument(doc), { ok: true });
});

Deno.test("builder: giorni ordinati per data, metadati di seduta fedeli", () => {
  const doc = build();
  assertEquals(
    doc.days.map((d) => d.date),
    ["2026-09-07", "2026-09-14"],
  );
  assertEquals(doc.days[0].week_order, 1);
  assertEquals(doc.days[0].day_index, 0);
  assertEquals(doc.days[1].session_id, "w2-s1");
  assertEquals(doc.days[1].day_name, "Full Body");
});

Deno.test("builder: data mancante o duplicata = throw, non un documento storto", () => {
  assertThrows(() => buildCoachProgramDocument(source, dates.slice(0, 1)));
  const clash = [
    { session_id: "w1-s1", date: "2026-09-07" },
    { session_id: "w2-s1", date: "2026-09-07" },
  ];
  assertThrows(() => buildCoachProgramDocument(source, clash));
});

// --- validator ----------------------------------------------------------------

Deno.test("validatore: il documento del builder passa", () => {
  assertEquals(validateCoachProgramDocument(build()), { ok: true });
});

Deno.test("validatore: rpe 0 bocciato — lo 0-come-assente non entra nella v2", () => {
  const doc = build();
  doc.days[0].exercises[0].sets[0].rpe = 0;
  const res = validateCoachProgramDocument(doc);
  assert(!res.ok);
  if (!res.ok) {
    assert(res.errors.some((e) => e.includes("days[0].exercises[0].sets[0].rpe")));
  }
});

Deno.test("validatore: percent_1rm 0 bocciato, rir 0 accettato", () => {
  const zeroPercent = build();
  zeroPercent.days[0].exercises[1].sets[0].percent_1rm = 0;
  assert(!validateCoachProgramDocument(zeroPercent).ok);
  const negativeRir = build();
  negativeRir.days[1].exercises[0].sets[0].rir = -1;
  assert(!validateCoachProgramDocument(negativeRir).ok);
  assertEquals(validateCoachProgramDocument(build()), { ok: true }); // rir 0 in fixture
});

Deno.test("validatore: version, giorni fuori ordine e forme rotte", () => {
  assert(!validateCoachProgramDocument(null).ok);
  assert(!validateCoachProgramDocument({}).ok);
  const v1 = { ...build(), version: 1 };
  assert(!validateCoachProgramDocument(v1).ok);
  const outOfOrder = build();
  outOfOrder.days.reverse();
  assert(!validateCoachProgramDocument(outOfOrder).ok);
  const badDate = build();
  badDate.days[0].date = "2026-02-31";
  assert(!validateCoachProgramDocument(badDate).ok);
});

Deno.test("validatore: un giorno senza esercizi non è una consegna", () => {
  // Symmetric with the non-empty sets rule: "0 esercizi" must never reach
  // the athlete as a training day (review 2026-08-20).
  const empty = build();
  empty.days[0].exercises = [];
  const res = validateCoachProgramDocument(empty);
  assert(!res.ok);
  if (res.ok === false) {
    assert(res.errors.some((e) => e.includes("days[0].exercises")));
  }
});
