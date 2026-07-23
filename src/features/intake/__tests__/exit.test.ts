// =============================================================================
// Exit-from-wizard invariants: an athlete must be able to sign out from ANY
// step of /onboarding, and that exit must go through useAuth().signOut.
//
// These are assertions on the SOURCE TEXT of IntakeForm.tsx, not a render
// test, on purpose. The suite runs with environment "node" and no jsdom — a
// deliberate decision (2026-07-14, pinned in the header of vitest.config.ts)
// — and there is no @testing-library either. On top of that the component is
// not even importable here: IntakeForm -> useAuth -> integrations/supabase/
// client.ts touches `localStorage` at module scope, so the import would throw
// before any assertion could run. Adding jsdom + RTL just for this control
// would reverse an explicit project decision, so we pin the three things that
// actually matter instead: the control exists in the wizard branch (and only
// there), it calls signOut(), and it never redirects by hand — a manual
// redirect would strand intake_draft_v1 (health answers, art. 9) on the
// device, which is exactly what signOut is there to prevent.
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(fileURLToPath(new URL("../IntakeForm.tsx", import.meta.url)), "utf8");

// The wizard JSX is the component's LAST top-level `return (`; every early
// return (loading / no user / coach / outcome screen / already onboarded)
// sits above it.
const WIZARD_RETURN = SOURCE.lastIndexOf("\n  return (");
const wizardBranch = WIZARD_RETURN < 0 ? "" : SOURCE.slice(WIZARD_RETURN);
const earlyReturns = WIZARD_RETURN < 0 ? "" : SOURCE.slice(0, WIZARD_RETURN);

// Body of the exit handler, from its declaration to the closing `};`.
const confirmExitBody = (() => {
  const start = SOURCE.indexOf("const confirmExit = async () => {");
  if (start < 0) return "";
  const end = SOURCE.indexOf("\n  };", start);
  return end < 0 ? "" : SOURCE.slice(start, end);
})();

describe("IntakeForm — exit control", () => {
  it("the source split markers still hold (guards every other assertion here)", () => {
    expect(WIZARD_RETURN).toBeGreaterThan(0);
    expect(confirmExitBody).not.toBe("");
  });

  it("the wizard branch exposes an exit control and its confirmation dialog", () => {
    expect(wizardBranch).toContain('aria-label="Esci"');
    expect(wizardBranch).toContain("setShowExit(true)");
    expect(wizardBranch).toContain("open={showExit}");
    expect(wizardBranch).toContain("confirmExit()");
  });

  it("no exit markup above the wizard return — the outcome screen has its own", () => {
    // The outcome screen is rendered by an early return, so the exit button
    // and its dialog (both below the wizard `return (`) can never reach it.
    // Only the MARKUP is checked here: `setShowExit` legitimately appears in
    // the handler section, which also sits above the wizard return.
    expect(earlyReturns).toContain("<IntakeOutcome");
    expect(wizardBranch).not.toContain("<IntakeOutcome");
    expect(earlyReturns).not.toContain('aria-label="Esci"');
    expect(earlyReturns).not.toContain("open={showExit}");
  });

  it("confirming goes through useAuth().signOut and nothing else", () => {
    expect(SOURCE).toMatch(/const \{[^}]*\bsignOut\b[^}]*\} = useAuth\(\)/);
    expect(confirmExitBody).toMatch(/await signOut\(\)/);
  });

  it("the exit path never redirects by hand nor logs out partially (art. 9)", () => {
    // signOut() owns both the draft wipe and the redirect. A fallback
    // `window.location` here would leave intake_draft_v1 on the device.
    expect(confirmExitBody).not.toMatch(/window\.location/);
    expect(confirmExitBody).not.toMatch(/<Navigate|navigate\(/);
    expect(confirmExitBody).not.toMatch(/localStorage|removeItem|clearIntakeDraft/);
  });
});
