// @vitest-environment jsdom
// =============================================================================
// WIRING boundary test — from the answers as the form collects them to the
// value that reaches the mutation. NOT another computeCheckinScore test (the
// pure function is already covered): on 2026-08-22 a stress/mood swap AT THE
// CALL SITE (DailyCheckin.tsx:337) left all pure-function tests green while
// the real 11/08 check-in score would have moved from 68 to 53. This test
// taps the real buttons, presses the real "Salva", and asserts the payload
// handed to the mutation — so that swap (and any sibling wiring swap) dies.
//
// jsdom is per-file (this pragma): the suite default stays environment
// "node" (vitest.config.ts). createElement, no JSX, so the `*.test.ts`
// include pattern is untouched.
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
}));

// The ONLY seam: the readiness hooks module. Everything between the tap and
// the mutate() call — state, scale(), energy inversion, painAnswer, payload
// literal, computeCheckinScore at :337 — runs for real.
vi.mock("@/hooks/athlete/useAthleteReadinessHooks", () => ({
  useDailyReadinessQuery: () => ({
    data: null,
    isFetchedAfterMount: true,
    isFetching: false,
    isError: false,
  }),
  useSubmitReadinessMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import DailyCheckin from "@/pages/athlete/DailyCheckin";

// createRoot + act need this flag outside a React test framework.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  mocks.mutate.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(DailyCheckin)));
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

/** Tap a scale button by its aria-label (e.g. "Sonno 3"). */
async function tap(ariaLabel: string): Promise<void> {
  const btn = buttons().find((b) => b.getAttribute("aria-label") === ariaLabel);
  if (!btn) throw new Error(`Bottone non trovato: aria-label="${ariaLabel}"`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Tap a button by its visible text (pain options "Sì"/"No", CTA "Salva"). */
async function tapText(text: string): Promise<void> {
  const btn = buttons().find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`Bottone non trovato: testo "${text}"`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The real 11/08 answers on the 1..5 form scale. DB domain after scaling:
 *  sleep 6 · fatigue (6-4)*2 = 4 · stress 4 · mood 8 · digestion 10. */
async function answerBiofeedback(): Promise<void> {
  await tap("Sonno 3");
  await tap("Energia 4");
  await tap("Stress 2");
  await tap("Umore 4");
  await tap("Digestione 5");
}

describe("confine form→mutazione — il cablaggio del check-in", () => {
  it("le risposte del form arrivano alla mutazione col punteggio giusto (68, non 53)", async () => {
    await answerBiofeedback();
    await tapText("Salva");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    const payload = mocks.mutate.mock.calls[0][0];
    // Each field pinned. NB: in THIS vector fatigue_score and stress_level
    // are both 4 (and both inverted axes), so a fatigue/stress swap is
    // invisible here — the all-distinct vector below covers that pair.
    expect(payload.sleep_quality, "sleep_quality").toBe(6);
    expect(payload.fatigue_score, "fatigue_score (energia invertita)").toBe(4);
    expect(payload.stress_level, "stress_level").toBe(4);
    expect(payload.mood, "mood").toBe(8);
    expect(payload.digestion, "digestion").toBe(10);
    // THE assertion that dies with the stress/mood swap at :337: with the
    // swap this exact input scores 53 instead of 68.
    expect(payload.score, "score composito").toBe(68);
    // Untouched pain question: null, never forged to false (CORE §0.8).
    expect(payload.has_pain, "has_pain non risposto").toBeNull();
    expect(payload.soreness_map).toEqual({});
  });

  it("valori tutti distinti: qualunque scambio di coppia muove un campo o il punteggio", async () => {
    // Stress 1 instead of 2 → scaled values 6·4·2·8·10, all distinct and on
    // mixed polarities: every pair swap at the payload literal changes a
    // field assertion, and every pair swap at the computeCheckinScore call
    // (:337) changes the score (73 becomes 74/46/55/76/82… — never 73).
    await tap("Sonno 3");
    await tap("Energia 4");
    await tap("Stress 1");
    await tap("Umore 4");
    await tap("Digestione 5");
    await tapText("Salva");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    const payload = mocks.mutate.mock.calls[0][0];
    expect(payload.sleep_quality, "sleep_quality").toBe(6);
    expect(payload.fatigue_score, "fatigue_score").toBe(4);
    expect(payload.stress_level, "stress_level").toBe(2);
    expect(payload.mood, "mood").toBe(8);
    expect(payload.digestion, "digestion").toBe(10);
    expect(payload.score, "score composito").toBe(73);
  });

  it("dolore risposto «No» ⇒ has_pain false esplicito (una risposta, non un default)", async () => {
    await answerBiofeedback();
    await tapText("No");
    await tapText("Salva");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0].has_pain).toBe(false);
  });

  it("dolore risposto «Sì» ⇒ has_pain true", async () => {
    await answerBiofeedback();
    await tapText("Sì");
    await tapText("Salva");

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0].has_pain).toBe(true);
  });
});
