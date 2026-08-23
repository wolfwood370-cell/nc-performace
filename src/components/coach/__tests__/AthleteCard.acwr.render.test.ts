// The ACWR badge must SAY what the value IS — spike, sovraccarico,
// detraining, nella norma — through the same thresholds assessRisks owns
// (no number duplicated in the card). Mechanism proof: three different
// values must yield three different labels; a fixed "ACWR spike" label
// would pass none of this. renderToString under environment node, same
// harness as the other render tests (decision 2026-07-14 in
// vitest.config.ts).

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

// AthleteCard imports assessRisks from the risk hook module, which pulls
// the supabase client at module level: stub the client, keep the hook
// module REAL so the true thresholds are exercised.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { AthleteCard, type AthleteCardProps } from "@/components/coach/AthleteCard";

const baseProps: AthleteCardProps = {
  athleteId: "a1",
  athleteName: "Mario Rossi",
  avatarUrl: null,
  avatarInitials: "MR",
  lastCheckinDate: null,
  programName: null,
  isActive: false,
};

function renderCard(over: Partial<AthleteCardProps>): string {
  return renderToString(
    createElement(MemoryRouter, null, createElement(AthleteCard, { ...baseProps, ...over })),
  ).replace(/<!-- -->/g, "");
}

/** The one ACWR badge label the card rendered, or null. Extracted so a
 *  failing case names BOTH labels: expected vs received. */
function acwrBadgeLabel(html: string): string | null {
  const m = html.match(/ACWR (spike|sovraccarico|detraining|nella norma)/);
  return m ? m[0] : null;
}

// Pain forces the Critical state, so the badge renders for ANY value —
// exactly the production scenario (23/08: pain + ACWR 0.00 shown as spike).
const pain = ["Dolore dichiarato (22/08)"];

describe("tre ACWR diversi → tre etichette diverse (soglie di assessRisks)", () => {
  it("0.5 con dolore → detraining, non spike", () => {
    const html = renderCard({ acwrValue: 0.5, painMarkers: pain });
    expect(acwrBadgeLabel(html)).toBe("ACWR detraining");
    expect(html).toContain("0.50");
  });

  it("1.0 con dolore → nella norma, non spike", () => {
    const html = renderCard({ acwrValue: 1.0, painMarkers: pain });
    expect(acwrBadgeLabel(html)).toBe("ACWR nella norma");
    expect(html).toContain("1.00");
  });

  it("1.8 → spike, e da solo basta a rendere la card critical", () => {
    const html = renderCard({ acwrValue: 1.8 });
    expect(acwrBadgeLabel(html)).toBe("ACWR spike");
    expect(html).toContain("1.80");
  });

  it("1.4 con dolore → sovraccarico (il gradino intermedio esiste)", () => {
    const html = renderCard({ acwrValue: 1.4, painMarkers: pain });
    expect(acwrBadgeLabel(html)).toBe("ACWR sovraccarico");
  });

  it("senza valore ACWR: nessun badge, anche con card critical per dolore", () => {
    const html = renderCard({ painMarkers: pain });
    expect(acwrBadgeLabel(html)).toBeNull();
  });
});
