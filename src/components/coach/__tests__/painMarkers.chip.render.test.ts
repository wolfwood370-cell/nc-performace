// The "Fastidi segnalati" chip must be selected by flag TYPE (stable
// identifier), never by the displayed label: translating a label must not
// change which flags surface. Proved end-to-end: selection
// (selectPainMarkers) + the AthleteCard render that shows the chip.

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { selectPainMarkers } from "@/lib/painMarkers";
import { AthleteCard } from "@/components/coach/AthleteCard";

function renderCardWithMarkers(markers: string[]): string {
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(AthleteCard, {
        athleteId: "a1",
        athleteName: "Mario Rossi",
        avatarUrl: null,
        avatarInitials: "MR",
        lastCheckinDate: null,
        programName: null,
        isActive: false,
        painMarkers: markers.length > 0 ? markers : undefined,
      }),
    ),
  ).replace(/<!-- -->/g, "");
}

describe("il chip si seleziona sul type, mai sulla label", () => {
  it("cambiare la LABEL non cambia il chip; cambiare il TYPE sì", () => {
    const base = [
      { type: "overload_warning" as const, label: "Carico recente sopra l'abituale" },
      { type: "pain_reported" as const, label: "Dolore dichiarato (22/08)" },
    ];
    const selected = selectPainMarkers(base);
    expect(selected).toEqual(["Dolore dichiarato (22/08)"]);
    let html = renderCardWithMarkers(selected);
    expect(html).toContain("Fastidi segnalati");
    expect(html).toContain("Dolore dichiarato (22/08)");

    // Same flag, label translated to English: the old Italian-regex-on-label
    // selection would have dropped it — by type the chip must NOT change
    // behaviour (still selected, still rendered).
    const translated = [
      base[0],
      { type: "pain_reported" as const, label: "Pain reported (22/08)" },
    ];
    const selectedTranslated = selectPainMarkers(translated);
    expect(selectedTranslated).toEqual(["Pain reported (22/08)"]);
    html = renderCardWithMarkers(selectedTranslated);
    expect(html).toContain("Fastidi segnalati");
    expect(html).toContain("Pain reported (22/08)");

    // Positive control in the SAME test: keep the Italian label but change
    // the TYPE — now the selection MUST change, and the chip disappears.
    const retyped = [
      base[0],
      { type: "low_recovery" as const, label: "Dolore dichiarato (22/08)" },
    ];
    const selectedRetyped = selectPainMarkers(retyped);
    expect(selectedRetyped).toEqual([]);
    html = renderCardWithMarkers(selectedRetyped);
    expect(html).not.toContain("Fastidi segnalati");
  });
});
