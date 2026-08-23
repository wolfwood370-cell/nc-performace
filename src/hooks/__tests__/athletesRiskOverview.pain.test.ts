// =============================================================================
// Fifth risk flag (pain_reported) — mechanism tests, not effect tests.
//
// Three athletes, three DISTINCT outcomes: an always-on flag would pass a
// "the athlete in pain is flagged" test — so false and null MUST stay
// unflagged, and each failure names its athlete. The date tests pin the flag
// to the MOST RECENT daily_readiness row: pain from three weeks ago is
// clinical history (health profile tab), not today's risk.
// =============================================================================
import { describe, expect, it, vi } from "vitest";

// The hook module instantiates the Supabase client at import time; these
// tests only exercise the exported pure helpers, so the client is stubbed.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { assessRisks, latestPainReport } from "@/hooks/useAthletesRiskOverview";

describe("pain_reported — tre atleti, tre esiti", () => {
  const ATHLETES = [
    { name: "Marco", hasPain: true, flagged: true },
    { name: "Luca", hasPain: false, flagged: false },
    { name: "Gaia", hasPain: null, flagged: false },
  ] as const;

  it.each(ATHLETES)(
    "atleta $name — has_pain=$hasPain sull'ultima riga ⇒ bandiera attesa: $flagged",
    ({ name, hasPain, flagged }) => {
      const pain = latestPainReport([{ date: "2026-08-22", has_pain: hasPain }]);
      const { riskFlags, riskLevel } = assessRisks(1.0, 80, pain);
      const painFlags = riskFlags.filter((f) => f.type === "pain_reported");
      expect(painFlags.length, `atleta ${name}: numero bandiere dolore`).toBe(flagged ? 1 : 0);
      expect(riskLevel, `atleta ${name}: riskLevel`).toBe(flagged ? "high" : "optimal");
      if (flagged) {
        expect(painFlags[0].level, `atleta ${name}: livello`).toBe("high");
      }
    },
  );

  it("null non diventa mai false: la riga senza risposta esce dal mapping come null", () => {
    const report = latestPainReport([{ date: "2026-08-22", has_pain: null }]);
    expect(report?.hasPain).toBeNull();
    expect(report?.hasPain).not.toBe(false);
  });
});

describe("la bandiera descrive lo stesso giorno del numero", () => {
  it("dolore su una riga di 20 giorni fa e non sull'ultima ⇒ nessuna bandiera", () => {
    const pain = latestPainReport([
      { date: "2026-08-22", has_pain: false },
      { date: "2026-08-02", has_pain: true },
    ]);
    const { riskFlags } = assessRisks(1.0, 80, pain);
    expect(riskFlags.filter((f) => f.type === "pain_reported")).toHaveLength(0);
  });

  it("vince la data più recente, non la posizione nell'array", () => {
    const pain = latestPainReport([
      { date: "2026-08-02", has_pain: true },
      { date: "2026-08-22", has_pain: null },
    ]);
    expect(pain).toEqual({ hasPain: null, date: "2026-08-22" });
  });

  it("dolore sull'ultima riga ⇒ bandiera con la data di QUELLA riga nell'etichetta", () => {
    const pain = latestPainReport([
      { date: "2026-08-22", has_pain: true },
      { date: "2026-08-02", has_pain: false },
    ]);
    const { riskFlags } = assessRisks(1.0, 80, pain);
    const flag = riskFlags.find((f) => f.type === "pain_reported");
    expect(flag).toBeDefined();
    expect(flag?.label).toContain("22/08");
    expect(flag?.label).not.toContain("02/08");
  });
});

describe("riskLevel cambia davvero e le quattro bandiere restano invariate", () => {
  it("ACWR nella norma + dolore dichiarato ⇒ l'atleta non è più optimal", () => {
    const { riskLevel } = assessRisks(1.0, 80, { hasPain: true, date: "2026-08-22" });
    expect(riskLevel).toBe("high");
  });

  it("controllo: ACWR nella norma senza dolore (false o assente) resta optimal", () => {
    expect(assessRisks(1.0, 80, { hasPain: false, date: "2026-08-22" }).riskLevel).toBe("optimal");
    expect(assessRisks(1.0, 80, null).riskLevel).toBe("optimal");
  });

  it("la quinta si AGGIUNGE: ACWR alto + dolore ⇒ entrambe le bandiere, nell'ordine", () => {
    const { riskFlags } = assessRisks(1.6, 80, { hasPain: true, date: "2026-08-22" });
    expect(riskFlags.map((f) => f.type)).toEqual(["high_injury_risk", "pain_reported"]);
  });

  it("nessuna riga readiness ⇒ nessun report e nessuna bandiera (assenza ≠ risposta)", () => {
    expect(latestPainReport([])).toBeNull();
    const { riskFlags } = assessRisks(1.0, 80, null);
    expect(riskFlags.filter((f) => f.type === "pain_reported")).toHaveLength(0);
  });
});
