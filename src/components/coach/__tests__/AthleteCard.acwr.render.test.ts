// The card's load row is a LENS, not a judge (C-09): it must render the
// band DESCRIPTION the module computed — three different ratios, three
// different descriptions — or the absence with its reason; and no word of
// risk may survive in the rendered HTML. Mechanism proofs: a fixed label
// would fail the three-bands test, a reintroduced verdict would fail the
// no-risk-words test naming the offending string. renderToString under
// environment node, same harness as the other render tests.

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { computeAcwr, type AcwrComputation } from "@/lib/math/acwr";

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

// Real fixtures through the module (already unit-tested): chronic fixed at
// 2800/28 = 100 AU/day, ratio = acuteAu/7/100; the 33-day session opens the
// minimum window without touching the sums.
const TODAY = "2026-08-22";
function lenteConRatio(acuteAu: number): AcwrComputation {
  return computeAcwr(
    [
      { completedAt: "2026-07-20", srpe: 1, durationSeconds: 60 },
      { completedAt: "2026-08-10", srpe: 1, durationSeconds: (2800 - acuteAu) * 60 },
      { completedAt: "2026-08-20", srpe: 1, durationSeconds: acuteAu * 60 },
    ],
    TODAY,
  );
}

// Production-shaped absence: sessions exist, none carries a session RPE.
const ASSENZA = computeAcwr(
  [
    { completedAt: "2026-08-09", srpe: null, durationSeconds: 34 },
    { completedAt: "2026-08-11", srpe: null, durationSeconds: 7 },
  ],
  TODAY,
);

const PAROLE_DI_RISCHIO =
  /ACWR spike|ACWR sovraccarico|ACWR detraining|Alto Rischio|High Risk|Warning|Zona Attenzione|High Injury/i;

describe("tre fasce diverse → tre descrizioni diverse (parole del modulo)", () => {
  it("0.79 → sotto l'abituale", () => {
    const html = renderCard({ acwr: lenteConRatio(553) });
    expect(html).toContain("Carico recente sotto l&#x27;abituale");
    expect(html).toContain("0.79");
  });

  it("1.00 → in linea con l'abituale", () => {
    const html = renderCard({ acwr: lenteConRatio(700) });
    expect(html).toContain("Carico recente in linea con l&#x27;abituale");
    expect(html).toContain("1.00");
  });

  it("1.60 → sopra l'abituale, col caveat accanto al numero", () => {
    const html = renderCard({ acwr: lenteConRatio(1120) });
    expect(html).toContain("Carico recente sopra l&#x27;abituale");
    expect(html).toContain("1.60");
    expect(html).toContain("Lente di consapevolezza, non una previsione di infortunio.");
  });
});

describe("l'assenza resta assenza, col motivo e i numeri veri", () => {
  it("sedute senza sRPE → il motivo del modulo, nessun numero-rapporto", () => {
    const html = renderCard({ acwr: ASSENZA });
    expect(html).toContain("Nessuna seduta con RPE di sessione registrato");
    expect(html).toContain("2 sedute escluse: 2 senza RPE di sessione");
    // Markup (SVG paths, Tailwind class values) is full of decimals: the
    // claim is about the VISIBLE text, so strip every tag first.
    const testoVisibile = html.replace(/<[^>]+>/g, " ");
    expect(testoVisibile).not.toMatch(/\d\.\d{2}/);
  });

  it("senza prop acwr (consumer legacy): nessuna riga carico", () => {
    const html = renderCard({});
    expect(html).not.toContain("Carico recente vs abituale");
  });
});

describe("la lente non è un giudice", () => {
  it("carico sopra l'abituale DA SOLO non rende la card 'Critico'", () => {
    const html = renderCard({ acwr: lenteConRatio(1120) });
    expect(html).not.toContain("Critico");
  });

  it("il dolore sì: painMarkers → 'Critico' (bandiera intoccata)", () => {
    const html = renderCard({ painMarkers: ["Dolore dichiarato (22/08)"] });
    expect(html).toContain("Critico");
    expect(html).toContain("Fastidi segnalati");
  });

  it("nessuna parola di rischio sopravvive nel render, in nessuno stato", () => {
    const casi = [
      renderCard({ acwr: lenteConRatio(1120) }),
      renderCard({ acwr: lenteConRatio(553), painMarkers: ["Dolore dichiarato (22/08)"] }),
      renderCard({ acwr: ASSENZA }),
    ];
    for (const html of casi) {
      const match = html.match(PAROLE_DI_RISCHIO);
      expect(match?.[0] ?? null, "parola di rischio trovata nel render").toBeNull();
    }
  });
});
