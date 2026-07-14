// =============================================================================
// Pins the response->outcome contract (finding review 2026-07-14): routedOut
// dominance over ok, persisted=!minor, and the full error-code map. A revert
// of any of these rules fails here.
// =============================================================================

import { describe, expect, it } from "vitest";
import { outcomeFromBody } from "../outcome";

describe("outcomeFromBody", () => {
  it("routedOut DOMINATES ok:true (pregnancy/DCA persisted, coach alerted — NOT a success)", () => {
    const outcome = outcomeFromBody({
      ok: true,
      gate: { level: "red", routedOut: true, reasons: ["pregnancy"], yellow: [] },
    });
    expect(outcome).toEqual({ kind: "routedOut", reasons: ["pregnancy"], persisted: true });
  });

  it("minor: ok:false + routedOut, nothing persisted", () => {
    const outcome = outcomeFromBody({
      ok: false,
      gate: { level: "red", routedOut: true, reasons: ["minor"] },
    });
    expect(outcome).toEqual({ kind: "routedOut", reasons: ["minor"], persisted: false });
  });

  it("ok:true without routedOut is a success (red hold included: UI stays neutral)", () => {
    const outcome = outcomeFromBody({
      ok: true,
      gate: { level: "red", routedOut: false, reasons: ["parq_heart"], yellow: [] },
    });
    expect(outcome).toEqual({ kind: "success" });
  });

  it("maps every machine error code to its kind", () => {
    expect(outcomeFromBody({ ok: false, error: "already_submitted" }).kind).toBe(
      "alreadySubmitted",
    );
    expect(outcomeFromBody({ ok: false, error: "invalid_payload", field: "intake.pain" })).toEqual(
      { kind: "invalidPayload", field: "intake.pain" },
    );
    expect(outcomeFromBody({ ok: false, error: "invalid_json" }).kind).toBe("invalidPayload");
    expect(outcomeFromBody({ ok: false, error: "payload_too_large" }).kind).toBe("tooLarge");
    expect(outcomeFromBody({ ok: false, error: "missing_required_consents" }).kind).toBe(
      "missingConsents",
    );
    for (const code of ["unauthorized", "profile_not_found", "athletes_only", "invalid_athlete"]) {
      expect(outcomeFromBody({ ok: false, error: code }).kind).toBe("authError");
    }
    expect(outcomeFromBody({ ok: false, error: "internal" }).kind).toBe("error");
    expect(outcomeFromBody({ ok: false, error: "server_misconfigured" }).kind).toBe("error");
    expect(outcomeFromBody(null).kind).toBe("error");
    expect(outcomeFromBody({}).kind).toBe("error");
  });
});
