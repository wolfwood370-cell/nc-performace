// =============================================================================
// Health profile — the three-way pain answer must SURVIVE the DB→view
// mapping. Until this slice, `hasPain: r.has_pain || false` collapsed the
// unanswered question (null) into "no pain" — the exact forgery the check-in
// protects against at DailyCheckin.tsx:344 (CORE §0.8).
// =============================================================================
import { describe, expect, it, vi } from "vitest";

// The hook module instantiates the Supabase client at import time; these
// tests only exercise the exported pure helpers, so the client is stubbed.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { painAnswerLabel, toRecentPainReports } from "@/hooks/useAthleteHealthProfile";

describe("toRecentPainReports — null non diventa mai false", () => {
  it("riga senza risposta (has_pain = null) ⇒ hasPain resta null", () => {
    const [report] = toRecentPainReports([
      { date: "2026-08-22", has_pain: null, soreness_map: null },
    ]);
    expect(report.hasPain).toBeNull();
    expect(report.hasPain).not.toBe(false);
  });

  it("controllo positivo: false esplicito resta false, true resta true", () => {
    const reports = toRecentPainReports([
      { date: "2026-08-22", has_pain: false, soreness_map: null },
      { date: "2026-08-21", has_pain: true, soreness_map: { chest: 2 } },
    ]);
    expect(reports[0].hasPain).toBe(false);
    expect(reports[1].hasPain).toBe(true);
  });

  it("solo il true esplicito conta come dolore recente (la derivazione del semaforo)", () => {
    const reports = toRecentPainReports([
      { date: "2026-08-22", has_pain: null, soreness_map: null },
      { date: "2026-08-21", has_pain: null, soreness_map: null },
    ]);
    // Same predicate the hook uses for hasRecentPain: null must not raise it.
    expect(reports.some((r) => r.hasPain === true)).toBe(false);
  });
});

describe("painAnswerLabel — la scheda può dire «non risposto»", () => {
  it("null ⇒ «Non risposto», mai una frase che affermi «nessun dolore»", () => {
    expect(painAnswerLabel(null)).toBe("Non risposto");
    expect(painAnswerLabel(null)).not.toMatch(/nessun dolore/i);
  });

  it("controllo positivo: con false esplicito «nessun dolore» è legittimo", () => {
    expect(painAnswerLabel(false)).toBe("Nessun dolore dichiarato");
  });

  it("true ⇒ «Dolore dichiarato»", () => {
    expect(painAnswerLabel(true)).toBe("Dolore dichiarato");
  });
});
