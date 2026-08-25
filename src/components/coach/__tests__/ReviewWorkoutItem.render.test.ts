// The coach's review row reads ONE effort column (B-22): the session
// rating from workout_logs.srpe. Absent → "RPE sessione —", present → that
// value; the old second badge fed by rpe_global (the session value written
// for two years to the wrong column) must not render anymore.
// renderToString under environment node, same harness as the other render
// tests.

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ReviewWorkoutItem } from "@/components/coach/AthleteViewerDialog";

function renderItem(srpe: number | null): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ReviewWorkoutItem, {
        logId: "log-1",
        title: "Seduta Spinta",
        srpe,
        athleteNotes: null,
        existingFeedback: null,
        exercisesData: null,
        onSaved: () => {},
      }),
    ),
  ).replace(/<!-- -->/g, "");
}

describe("la riga di review legge srpe, e l'assenza resta leggibile", () => {
  it("srpe nullo → 'RPE sessione —', mai un numero di ripiego", () => {
    const html = renderItem(null);
    expect(html).toContain("RPE sessione —");
    expect(html).not.toMatch(/RPE sessione \d/);
  });

  it("srpe 8 → 'RPE sessione 8'", () => {
    const html = renderItem(8);
    expect(html).toContain("RPE sessione 8");
    expect(html).not.toContain("RPE sessione —");
  });

  it("il doppio badge da rpe_global non esiste più", () => {
    const html = renderItem(8);
    expect(html).not.toMatch(/sRPE \d/);
  });
});
