// Decision table for the already-exists branch of invite-athlete: 6 outcomes,
// active-account guard on every path (only onboarding_completed === true
// blocks the re-send — the stale branch only guarded the alreadyLinked path).

import { assertEquals } from "jsr:@std/assert@1";
import { decideAlreadyExists } from "./decision.ts";
import type { ExistingProfileFacts } from "./decision.ts";

const COACH = "coach-1";
const OTHER = "coach-2";

const athlete = (overrides: Partial<ExistingProfileFacts> = {}): ExistingProfileFacts => ({
  role: "athlete",
  coach_id: null,
  onboarding_completed: false,
  ...overrides,
});

Deno.test("profilo assente -> create-and-resend", () => {
  assertEquals(decideAlreadyExists({ profile: null, coachId: COACH }), "create-and-resend");
});

Deno.test("atleta orfano non onboardato -> attach-and-resend (false e null)", () => {
  assertEquals(
    decideAlreadyExists({ profile: athlete({ onboarding_completed: false }), coachId: COACH }),
    "attach-and-resend",
  );
  assertEquals(
    decideAlreadyExists({ profile: athlete({ onboarding_completed: null }), coachId: COACH }),
    "attach-and-resend",
  );
});

Deno.test("atleta orfano gia' onboardato -> attach-no-resend (guardia sul ramo attach)", () => {
  assertEquals(
    decideAlreadyExists({ profile: athlete({ onboarding_completed: true }), coachId: COACH }),
    "attach-no-resend",
  );
});

Deno.test("gia' collegato a questo coach, non onboardato -> resend-pending (false e null)", () => {
  assertEquals(
    decideAlreadyExists({ profile: athlete({ coach_id: COACH }), coachId: COACH }),
    "resend-pending",
  );
  assertEquals(
    decideAlreadyExists({
      profile: athlete({ coach_id: COACH, onboarding_completed: null }),
      coachId: COACH,
    }),
    "resend-pending",
  );
});

Deno.test("gia' collegato e onboardato -> no-resend-active", () => {
  assertEquals(
    decideAlreadyExists({
      profile: athlete({ coach_id: COACH, onboarding_completed: true }),
      coachId: COACH,
    }),
    "no-resend-active",
  );
});

Deno.test("atleta di un altro coach -> conflict, con o senza onboarding", () => {
  assertEquals(
    decideAlreadyExists({ profile: athlete({ coach_id: OTHER }), coachId: COACH }),
    "conflict",
  );
  assertEquals(
    decideAlreadyExists({
      profile: athlete({ coach_id: OTHER, onboarding_completed: true }),
      coachId: COACH,
    }),
    "conflict",
  );
});

Deno.test("ruolo non-athlete -> conflict (coach, null, coach con lo stesso id)", () => {
  assertEquals(
    decideAlreadyExists({ profile: athlete({ role: "coach" }), coachId: COACH }),
    "conflict",
  );
  assertEquals(
    decideAlreadyExists({ profile: athlete({ role: null }), coachId: COACH }),
    "conflict",
  );
  assertEquals(
    decideAlreadyExists({ profile: athlete({ role: "coach", coach_id: COACH }), coachId: COACH }),
    "conflict",
  );
});

Deno.test("guardia account-attivi su tutti i rami: solo true blocca il reinvio", () => {
  // Attach branch and pending branch: true -> no-resend outcome, false/null -> resend.
  for (const coach_id of [null, COACH]) {
    const resendAction = coach_id ? "resend-pending" : "attach-and-resend";
    const noResendAction = coach_id ? "no-resend-active" : "attach-no-resend";
    for (const onboarding_completed of [false, null]) {
      assertEquals(
        decideAlreadyExists({
          profile: athlete({ coach_id, onboarding_completed }),
          coachId: COACH,
        }),
        resendAction,
      );
    }
    assertEquals(
      decideAlreadyExists({
        profile: athlete({ coach_id, onboarding_completed: true }),
        coachId: COACH,
      }),
      noResendAction,
    );
  }
});

Deno.test("stesso input -> stessa decisione (determinismo)", () => {
  const input = { profile: athlete({ coach_id: COACH }), coachId: COACH };
  assertEquals(decideAlreadyExists(input), decideAlreadyExists(input));
  assertEquals(
    decideAlreadyExists({ profile: athlete({ coach_id: COACH }), coachId: COACH }),
    decideAlreadyExists({ profile: athlete({ coach_id: COACH }), coachId: COACH }),
  );
});
