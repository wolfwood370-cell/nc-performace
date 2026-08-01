// Ordering contract of the coach alert surface: unread first, then severity
// (high → low), then most recent first. The list is the last mile of the
// CORE §0 escalation channel — an alert sorted to the bottom is an alert the
// coach reads last, so the order is part of the safety behaviour, not styling.

import { describe, expect, it } from "vitest";
import {
  canReassure,
  CHANNEL_FRESHNESS_MS,
  severityRank,
  sortCoachAlerts,
  unreadAlertsSummary,
  type SortableAlert,
} from "../coachAlerts";

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

// The reassurance on the Command Center used to be computed from the
// client-side triage alone, and could sit right above an unread server-side
// alert. These pin the rule that closes it: the coach never reads that
// everything is fine while an alert is waiting underneath.
describe("canReassure", () => {
  /** A fresh answer with nothing pending — the only state that earns an all-clear. */
  const answeredEmpty = { unreadSystemAlerts: 0, channelAnswered: true, answeredAgoMs: 1_000 };

  it("reassures when the channel has answered recently and nothing is unread", () => {
    expect(canReassure(answeredEmpty)).toBe(true);
  });

  it("stays silent with a single unread alert", () => {
    expect(canReassure({ ...answeredEmpty, unreadSystemAlerts: 1 })).toBe(false);
  });

  it("stays silent with many unread alerts", () => {
    expect(canReassure({ ...answeredEmpty, unreadSystemAlerts: 7 })).toBe(false);
  });

  it("stays silent when the channel has not answered", () => {
    expect(canReassure({ ...answeredEmpty, channelAnswered: false })).toBe(false);
  });

  it("stays silent when it has not answered even if a count is already known", () => {
    expect(
      canReassure({ unreadSystemAlerts: 3, channelAnswered: false, answeredAgoMs: 1_000 }),
    ).toBe(false);
  });

  // "Success" is not always an answer. This app hydrates the query cache
  // from IndexedDB (maxAge 24h): a hydrated query reports
  // `status: 'success'` with YESTERDAY'S state, and a placeholder forges
  // 'success' with no fetch at all. Freshness is what tells them apart.
  describe("success that does not mean what it seems", () => {
    it("stays silent on a day-old snapshot hydrated from the persisted cache", () => {
      expect(canReassure({ ...answeredEmpty, answeredAgoMs: 24 * 60 * 60 * 1000 })).toBe(false);
    });

    it("stays silent on placeholder data, which never had a fetch", () => {
      // `dataUpdatedAt` is 0 for placeholder data; callers map that to Infinity.
      expect(canReassure({ ...answeredEmpty, answeredAgoMs: Infinity })).toBe(false);
    });

    it("reassures at the freshness boundary and goes silent just past it", () => {
      expect(canReassure({ ...answeredEmpty, answeredAgoMs: CHANNEL_FRESHNESS_MS })).toBe(true);
      expect(canReassure({ ...answeredEmpty, answeredAgoMs: CHANNEL_FRESHNESS_MS + 1 })).toBe(
        false,
      );
    });

    it("a stale answer with unread alerts stays silent for both reasons", () => {
      expect(
        canReassure({
          unreadSystemAlerts: 2,
          channelAnswered: true,
          answeredAgoMs: 24 * 60 * 60 * 1000,
        }),
      ).toBe(false);
    });
  });

  // The reason the rule keys off one positive signal instead of a list of
  // failures: the first version enumerated "not loading and not errored" and
  // missed `paused`, which is what an offline retry produces under
  // `networkMode: 'offlineFirst'`. Then `isSuccess` alone proved too wide:
  // a query hydrated from the persisted cache is `success` with yesterday's
  // state. In every silent row below the unread count is 0 for lack of a
  // (fresh) answer, not for lack of alerts.
  describe("across every state the alert query can be in", () => {
    // `channelAnswered` is the hook's `isSuccess`, i.e. `status === "success"`
    // (@tanstack/query-core queryObserver.js:316); `answeredAgoMs` derives
    // from its `dataUpdatedAt`. The status columns are what TanStack actually
    // reports, and are the reason the rule cannot be written as "not loading
    // and not errored": `isLoading` is `isPending && isFetching`, so it is
    // false in four of these six rows.
    const QUERY_STATES = [
      { name: "in flight", status: "pending", fetchStatus: "fetching", agoMs: Infinity },
      { name: "paused offline", status: "pending", fetchStatus: "paused", agoMs: Infinity },
      { name: "disabled, no user yet", status: "pending", fetchStatus: "idle", agoMs: Infinity },
      { name: "errored", status: "error", fetchStatus: "idle", agoMs: Infinity },
      {
        name: "hydrated from yesterday's persisted cache",
        status: "success",
        fetchStatus: "paused",
        agoMs: 24 * 60 * 60 * 1000,
      },
      { name: "freshly answered", status: "success", fetchStatus: "idle", agoMs: 1_000 },
    ];

    for (const state of QUERY_STATES) {
      const expected = state.status === "success" && state.agoMs <= CHANNEL_FRESHNESS_MS;
      const verb = expected ? "reassures" : "stays silent";
      it(`${verb} when the query is ${state.name}`, () => {
        expect(
          canReassure({
            unreadSystemAlerts: 0,
            channelAnswered: state.status === "success",
            answeredAgoMs: state.agoMs,
          }),
        ).toBe(expected);
      });
    }
  });
});

describe("unreadAlertsSummary", () => {
  it("uses the singular for one alert", () => {
    expect(unreadAlertsSummary(1)).toBe("Hai 1 avviso dal sistema da leggere qui sotto.");
  });

  it("uses the plural for more than one", () => {
    expect(unreadAlertsSummary(4)).toBe("Hai 4 avvisi dal sistema da leggere qui sotto.");
  });

  it("names the count, so the coach knows how many are waiting", () => {
    expect(unreadAlertsSummary(12)).toContain("12");
  });
});
