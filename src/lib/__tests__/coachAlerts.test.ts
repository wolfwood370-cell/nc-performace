// Ordering contract of the coach alert surface: unread first, then severity
// (high → low), then most recent first. The list is the last mile of the
// CORE §0 escalation channel — an alert sorted to the bottom is an alert the
// coach reads last, so the order is part of the safety behaviour, not styling.

import { describe, expect, it } from "vitest";
import { severityRank, sortCoachAlerts, type SortableAlert } from "../coachAlerts";

function alert(overrides: Partial<SortableAlert> & { id: string }): SortableAlert & { id: string } {
  return {
    severity: "medium",
    read: false,
    created_at: "2026-08-01T08:00:00.000Z",
    ...overrides,
  };
}

const ids = (list: Array<{ id: string }>) => list.map((a) => a.id);

describe("severityRank", () => {
  it("ranks the DB vocabulary high → medium → low", () => {
    expect(severityRank("high")).toBeLessThan(severityRank("medium"));
    expect(severityRank("medium")).toBeLessThan(severityRank("low"));
  });

  it("pushes an unknown severity below every known one", () => {
    expect(severityRank("catastrophic")).toBeGreaterThan(severityRank("low"));
  });
});

describe("sortCoachAlerts", () => {
  it("puts unread before read even when the read one is more severe", () => {
    const sorted = sortCoachAlerts([
      alert({ id: "read-high", severity: "high", read: true }),
      alert({ id: "unread-low", severity: "low", read: false }),
    ]);
    expect(ids(sorted)).toEqual(["unread-low", "read-high"]);
  });

  it("orders by severity within the same read state", () => {
    const sorted = sortCoachAlerts([
      alert({ id: "low", severity: "low" }),
      alert({ id: "high", severity: "high" }),
      alert({ id: "medium", severity: "medium" }),
    ]);
    expect(ids(sorted)).toEqual(["high", "medium", "low"]);
  });

  it("orders by recency when read state and severity tie", () => {
    const sorted = sortCoachAlerts([
      alert({ id: "older", created_at: "2026-08-01T06:00:00.000Z" }),
      alert({ id: "newer", created_at: "2026-08-01T08:20:49.000Z" }),
    ]);
    expect(ids(sorted)).toEqual(["newer", "older"]);
  });

  it("applies the three keys in order: read, then severity, then date", () => {
    const sorted = sortCoachAlerts([
      alert({
        id: "read-high-new",
        severity: "high",
        read: true,
        created_at: "2026-08-01T09:00:00.000Z",
      }),
      alert({
        id: "unread-medium-old",
        severity: "medium",
        created_at: "2026-07-30T09:00:00.000Z",
      }),
      alert({ id: "unread-high-old", severity: "high", created_at: "2026-07-29T09:00:00.000Z" }),
      alert({ id: "unread-high-new", severity: "high", created_at: "2026-08-01T08:20:49.000Z" }),
    ]);
    expect(ids(sorted)).toEqual([
      "unread-high-new",
      "unread-high-old",
      "unread-medium-old",
      "read-high-new",
    ]);
  });

  it("keeps an unknown severity in the list instead of dropping it", () => {
    const sorted = sortCoachAlerts([
      alert({ id: "unknown", severity: "sconosciuta" }),
      alert({ id: "high", severity: "high" }),
    ]);
    expect(ids(sorted)).toEqual(["high", "unknown"]);
  });

  it("keeps an unparseable timestamp in the list, sorted last", () => {
    const sorted = sortCoachAlerts([
      alert({ id: "broken", created_at: "non-una-data" }),
      alert({ id: "ok", created_at: "2026-08-01T08:20:49.000Z" }),
    ]);
    expect(ids(sorted)).toEqual(["ok", "broken"]);
  });

  it("does not mutate the input array", () => {
    const input = [alert({ id: "low", severity: "low" }), alert({ id: "high", severity: "high" })];
    sortCoachAlerts(input);
    expect(ids(input)).toEqual(["low", "high"]);
  });

  it("handles an empty list", () => {
    expect(sortCoachAlerts([])).toEqual([]);
  });
});
