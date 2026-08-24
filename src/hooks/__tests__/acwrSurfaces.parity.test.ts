// =============================================================================
// Parità cross-superficie (C-09) — la prova rossa sul meccanismo.
//
// Le tre superfici del carico (roster, dettaglio atleta, dashboard) entrano
// nel modulo unico SOLO attraverso i loro adapter puri. Questo test dà agli
// adapter lo STESSO insieme di log e lo stesso «oggi» e pretende lo stesso
// esito: se una superficie reintroduce una fusione propria (srpe??rpe_global,
// default inventati, soglie locali), il test fallisce NOMINANDO le due
// superfici e i due valori. Poi: la finestra minima uccide il numero su
// tutte le superfici insieme, e la scala per-serie (rpe_global) non può
// sostituire quella di sessione su nessuna.
// =============================================================================
import { describe, expect, it, vi } from "vitest";

// Every hook module instantiates the Supabase client at import time; only
// the exported pure adapters are exercised here, so the client is stubbed.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { riskOverviewAcwr } from "@/hooks/useAthletesRiskOverview";
import { athleteAcwrFromLogs } from "@/hooks/useAthleteAcwrData";
import { dashboardAcwr } from "@/hooks/useCoachDashboardMetrics";
import type { AcwrComputation } from "@/lib/math/acwr";

const TODAY = "2026-08-24";

/** Raw row superset: every adapter picks the fields it declares. The
 *  rpe_global field is DELIBERATELY present and different from srpe — a
 *  surface that reads the wrong scale diverges and gets named. */
interface RigaLog {
  id: string;
  athlete_id: string;
  completed_at: string | null;
  duration_seconds: number | null;
  rpe_global: number | null;
  srpe: number | null;
}

function riga(
  id: string,
  completedAt: string | null,
  srpe: number | null,
  durationSeconds: number | null,
  rpeGlobal: number | null,
): RigaLog {
  return {
    id,
    athlete_id: "a1",
    completed_at: completedAt,
    duration_seconds: durationSeconds,
    rpe_global: rpeGlobal,
    srpe,
  };
}

// Storia a 30 giorni. A mano: cronico = (360+210+360)/28 = 33.21 AU/gg,
// acuto = 360/7 = 51.43 AU/gg → ratio 1.55, fascia "sopra". La riga r5
// (srpe null, rpe_global 8) è di forma-produzione: non entra MAI.
const LOGS_30GG: RigaLog[] = [
  riga("r1", "2026-07-25T10:00:00", 5, 3600, 3), // 30gg fa: apre la finestra
  riga("r2", "2026-08-04T18:30:00", 6, 3600, 4), // 20gg fa: 360 AU
  riga("r3", "2026-08-14T07:15:00", 7, 1800, 9), // 10gg fa: 210 AU
  riga("r4", "2026-08-22T19:00:00", 6, 3600, 2), // 2gg fa: 360 AU (acuta)
  riga("r5", "2026-08-19T12:00:00", null, 2400, 8), // senza sRPE: esclusa
];

type Superficie = [string, (logs: RigaLog[], todayIso: string) => AcwrComputation];
const SUPERFICI: Superficie[] = [
  ["roster (useAthletesRiskOverview.riskOverviewAcwr)", riskOverviewAcwr],
  ["dettaglio (useAthleteAcwrData.athleteAcwrFromLogs)", athleteAcwrFromLogs],
  ["dashboard (useCoachDashboardMetrics.dashboardAcwr)", dashboardAcwr],
];

function esito(c: AcwrComputation): string {
  return c.available === false
    ? `assenza (${c.reason}, ${c.daysCovered}/${c.daysRequired}gg, ${c.excludedCount} escluse)`
    : `ratio ${c.ratio} (${c.band})`;
}

function pretendiParita(logs: RigaLog[], oggi: string): AcwrComputation[] {
  const risultati = SUPERFICI.map(([nome, adapter]) => ({ nome, r: adapter(logs, oggi) }));
  for (let i = 0; i < risultati.length; i++) {
    for (let j = i + 1; j < risultati.length; j++) {
      const a = risultati[i];
      const b = risultati[j];
      expect(b.r, `parità violata: ${a.nome} → ${esito(a.r)} · ${b.nome} → ${esito(b.r)}`).toEqual(
        a.r,
      );
    }
  }
  return risultati.map(({ r }) => r);
}

describe("stesso insieme di log, stesso «oggi» → stesso esito su ogni superficie", () => {
  it("storia a 30 giorni: tutte le superfici danno ratio 1.55, fascia 'sopra'", () => {
    const [r] = pretendiParita(LOGS_30GG, TODAY);
    expect(r.available).toBe(true);
    if (r.available === true) {
      expect(r.ratio).toBe(1.55);
      expect(r.band).toBe("sopra");
      expect(r.excluded.senzaSrpe).toBe(1);
    }
  });

  it("nessuna seduta con sRPE (lo stato della produzione): stessa assenza, stesso motivo", () => {
    const soloRpeGlobal = [
      riga("p1", "2026-08-09T08:00:00", null, 34, 7),
      riga("p2", "2026-08-11T08:00:00", null, 7, 9),
    ];
    const [r] = pretendiParita(soloRpeGlobal, TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("nessuna_seduta_utilizzabile");
      expect(r.excluded.senzaSrpe).toBe(2);
    }
  });
});

describe("la finestra minima uccide il numero — su tutte le superfici insieme", () => {
  const STORIA_CORTA = [
    riga("c1", "2026-08-09T10:00:00", 6, 3600, 5), // 15gg fa
    riga("c2", "2026-08-21T10:00:00", 7, 3600, 8), // 3gg fa
  ];

  it("prima seduta utilizzabile a 15 giorni → nessuna superficie mostra un rapporto", () => {
    const [r] = pretendiParita(STORIA_CORTA, TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("storia_troppo_corta");
      expect(r.daysCovered).toBe(15);
      expect(r.daysRequired).toBe(28);
    }
  });

  it("controllo positivo: la stessa storia con una seduta a 30 giorni → tutte lo mostrano, uguale", () => {
    const conStoria = [riga("c0", "2026-07-25T10:00:00", 5, 60, 2), ...STORIA_CORTA];
    const [r] = pretendiParita(conStoria, TODAY);
    expect(r.available).toBe(true);
  });
});

describe("la scala non si sostituisce: rpe_global non tocca il rapporto, su nessuna superficie", () => {
  it("aggiungere una seduta con solo rpe_global non cambia l'esito (prima cambiava in tre modi diversi)", () => {
    const conRigaSoloGlobal = [...LOGS_30GG, riga("x1", "2026-08-21T09:00:00", null, 3600, 9)];
    for (const [nome, adapter] of SUPERFICI) {
      const prima = adapter(LOGS_30GG, TODAY);
      const dopo = adapter(conRigaSoloGlobal, TODAY);
      // Everything identical except the exclusion COUNT, which must name it.
      expect(dopo.available, `${nome}: la disponibilità è cambiata`).toBe(prima.available);
      if (prima.available === true && dopo.available === true) {
        expect(dopo.ratio, `${nome}: il ratio è cambiato (${prima.ratio} → ${dopo.ratio})`).toBe(
          prima.ratio,
        );
        expect(dopo.band, `${nome}: la fascia è cambiata`).toBe(prima.band);
      }
      expect(dopo.excluded.senzaSrpe, `${nome}: l'esclusione non è stata contata`).toBe(
        prima.excluded.senzaSrpe + 1,
      );
    }
  });

  it("cambiare il rpe_global di una seduta già utilizzabile non muove il numero", () => {
    const conGlobalDiverso = LOGS_30GG.map((l) => (l.id === "r3" ? { ...l, rpe_global: 1 } : l));
    for (const [nome, adapter] of SUPERFICI) {
      expect(
        adapter(conGlobalDiverso, TODAY),
        `${nome}: il rapporto legge la scala sbagliata`,
      ).toEqual(adapter(LOGS_30GG, TODAY));
    }
  });
});
