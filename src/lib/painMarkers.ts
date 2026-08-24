import type { RiskFlag } from "@/hooks/useAthletesRiskOverview";

/**
 * Flags that belong under the roster's "Fastidi segnalati" chip.
 *
 * Selection is by `type` — a stable identifier — never by the displayed
 * label: translating a label must not silently change which flags surface.
 * The previous Italian-regex-on-label selection matched `pain_reported`
 * only by accident (the four historical flags have English labels).
 */
export function selectPainMarkers(
  flags: ReadonlyArray<Pick<RiskFlag, "type" | "label">>,
): string[] {
  return flags.filter((f) => f.type === "pain_reported").map((f) => f.label);
}
