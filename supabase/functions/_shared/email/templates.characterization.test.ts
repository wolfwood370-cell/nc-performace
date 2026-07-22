// Characterization test (golden master): the email builders must reproduce
// the pinned subject+html byte-for-byte. Expected generated from the module
// at the review of the email-brand slice (2026-07-19), fidelity to the
// Cowork preview verified against app/preview-email-brand-2026-07-19.html.
// If a change is INTENTIONAL, regenerate the expected file and say so in
// the commit. Also pins DOCTYPE/full-document shape (decision D2) and
// determinism (any timestamp or random in the output would break equality).

import { assertEquals } from "jsr:@std/assert@1";
import { inviteEmail, loginLinkEmail, recoveryEmail } from "./templates.ts";
import { CHARACTERIZATION_SCENARIOS } from "./templates.characterization.fixture.ts";
import expected from "./templates.characterization.expected.json" with { type: "json" };

Deno.test("characterization: subject+html pinnati, byte-identici su ogni scenario", () => {
  assertEquals(CHARACTERIZATION_SCENARIOS.length, expected.length);
  for (let i = 0; i < CHARACTERIZATION_SCENARIOS.length; i++) {
    const scenario = CHARACTERIZATION_SCENARIOS[i];
    assertEquals(scenario.name, expected[i].name);
    const actual =
      scenario.kind === "invite"
        ? inviteEmail({
            firstName: scenario.input.firstName,
            actionLink: scenario.input.actionLink,
          })
        : scenario.kind === "login-link"
          ? loginLinkEmail({
              actionLink: scenario.input.actionLink,
              code: scenario.input.code,
            })
          : recoveryEmail({ actionLink: scenario.input.actionLink });
    assertEquals(actual.subject, expected[i].result.subject, `drift subject: ${scenario.name}`);
    assertEquals(actual.html, expected[i].result.html, `drift html: ${scenario.name}`);
  }
});
