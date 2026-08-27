// The context pane must never show the Stitch mock values as measures:
// no "78% · Buona" readiness, no ACWR 1.24 with a "Zona Ottimale" verdict,
// no "Blocco 1 · Settimana 3/4" periodization, no "Oura" source. Two
// states → two screens: with a real check-in the number appears, without
// it the absence does. Rendered for real via renderToString with the
// TanStack cache seeded (queries read the cache, no fetch during SSR).

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "coach-1" } }),
}));

import { AthleteContextPane } from "@/components/coach/messages/AthleteContextPane";
import type { ChatRoom } from "@/hooks/useChatRooms";

const room = {
  id: "r1",
  type: "direct",
  participants: [
    { user_id: "coach-1", profile: { full_name: "Coach", avatar_url: null } },
    { user_id: "ath-1", profile: { full_name: "Mario Rossi", avatar_url: null } },
  ],
} as unknown as ChatRoom;

type LastCompleted = {
  id: string;
  workoutTitle: string;
  scheduled_date: string;
  completed_at: string | null;
  /** Session rating from workout_logs.srpe — B-22: the pane reads THIS
   *  column, and a missing value reads "—". */
  srpe: number | null;
  duration_seconds: number | null;
} | null;

type WorkoutData = {
  lastCompleted: LastCompleted;
  upcoming: never[];
  compliance: { total: number; completed: number; missed: number; percentage: number };
} | null;

function renderPane(
  readinessRows: Array<{ date: string; score: number | null }>,
  workoutData: WorkoutData,
): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["athlete-context-workouts", "ath-1"], workoutData);
  client.setQueryData(["athlete-context-readiness", "ath-1"], readinessRows);
  return renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        null,
        createElement(AthleteContextPane, { room, isOpen: true, onClose: () => {} }),
      ),
    ),
  ).replace(/<!-- -->/g, "");
}

const emptyWorkouts: WorkoutData = {
  lastCompleted: null,
  upcoming: [],
  compliance: { total: 0, completed: 0, missed: 0, percentage: 0 },
};

describe("senza dato: assenza, mai il mock", () => {
  it("nessun check-in → nessun 78/Buona/1.24/Blocco, e l'assenza è resa", () => {
    const html = renderPane([], emptyWorkouts);
    // The old mock constants must be gone…
    expect(html).not.toContain("78%");
    expect(html).not.toContain("Buona");
    expect(html).not.toContain("1.24");
    expect(html).not.toContain("Zona Ottimale");
    expect(html).not.toContain("Blocco 1");
    expect(html).not.toContain("Settimana 3/4");
    expect(html).not.toContain("Mesociclo Ipertrofia");
    expect(html).not.toContain("Oura");
    // …and the honest labels/absences are rendered in their place.
    expect(html).toContain("Prontezza · Check-in");
    expect(html).toContain("Nessun check-in registrato");
    expect(html).toContain("ACWR (acuto:cronico)");
    expect(html).toContain("—");
  });

  it("query workout senza dato → 'Completati —', mai uno 0/0 misurato", () => {
    const html = renderPane([], null);
    expect(html).toContain("Completati");
    expect(html).not.toContain("0/0");
    expect(html).not.toContain("0 fatti");
  });
});

describe("col dato: il numero c'è ed è quello della riga", () => {
  it("check-in 62 → '62%' e la data; un'altra riga (41) → '41%'", () => {
    const htmlA = renderPane([{ date: "2026-08-21", score: 62 }], emptyWorkouts);
    expect(htmlA).toContain("62%");
    expect(htmlA).toContain("Ultimo check-in");
    expect(htmlA).not.toContain("Nessun check-in registrato");

    const htmlB = renderPane([{ date: "2026-08-22", score: 41 }], emptyWorkouts);
    expect(htmlB).toContain("41%");
    expect(htmlB).not.toContain("62%");
  });

  it("l'ultimo allenamento legge srpe: nullo → 'RPE —', col valore → quel valore", () => {
    const conSeduta = (srpe: number | null): WorkoutData => ({
      lastCompleted: {
        id: "w1",
        workoutTitle: "Panca Piana",
        scheduled_date: "2026-08-20",
        completed_at: "2026-08-20T18:00:00",
        srpe,
        duration_seconds: null,
      },
      upcoming: [],
      compliance: { total: 1, completed: 1, missed: 0, percentage: 100 },
    });

    const senzaRating = renderPane([], conSeduta(null));
    expect(senzaRating, "assenza leggibile, mai un ripiego").toContain("RPE —");

    const conRating = renderPane([], conSeduta(9));
    expect(conRating).toContain("RPE 9");
    expect(conRating).not.toContain("RPE —");
  });

  it("compliance reale → '2/3' e '2 fatti', '1 saltati'", () => {
    const html = renderPane([], {
      lastCompleted: null,
      upcoming: [],
      compliance: { total: 3, completed: 2, missed: 1, percentage: 67 },
    });
    expect(html).toContain("2/3");
    expect(html).toContain("2 fatti");
    expect(html).toContain("1 saltati");
  });
});
