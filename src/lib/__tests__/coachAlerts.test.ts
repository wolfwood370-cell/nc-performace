// Ordering contract of the coach alert surface: unread first, then severity
// (high → low), then most recent first. The list is the last mile of the
// CORE §0 escalation channel — an alert sorted to the bottom is an alert the
// coach reads last, so the order is part of the safety behaviour, not styling.

import { describe, expect, it } from "vitest";
import {
  canReassure,
  CHANNEL_FRESHNESS_MS,
  composeTriageBullets,
  severityRank,
  sortCoachAlerts,
  unreadAlertsSummary,
  type SortableAlert,
  type TriageBullet,
  type TriageBulletsInput,
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

// ---------------------------------------------------------------------------
// composeTriageBullets — the assembly of the Command Center bullets.
//
// canReassure was extracted and tested, but the condition deciding WHETHER it
// runs stayed inline in the component, untested — and that is where the
// channel-mute defect lived. These tests exist so the assembly can never be
// the untested half of the problem again.
// ---------------------------------------------------------------------------

/** Client triage fixtures (already filtered/capped upstream). */
const CRITICO = { severity: "critical", athleteName: "Anna", description: "ACWR 1.8" };
const SECONDO_CRITICO = {
  severity: "critical",
  athleteName: "Bruno",
  description: "dolore al ginocchio",
};
const WARNING = { severity: "warning", athleteName: "Carla", description: "sonno in calo" };

/** Channel states, named for what they mean at the hook boundary. */
const CANALE_FRESCO = { channelAnswered: true, channelFetching: false, answeredAgoMs: 1_000 };
const CANALE_MUTO = { channelAnswered: false, channelFetching: false, answeredAgoMs: Infinity };
const CANALE_IN_VOLO = { channelAnswered: false, channelFetching: true, answeredAgoMs: Infinity };
const CANALE_STANTIO = {
  channelAnswered: true,
  channelFetching: false,
  answeredAgoMs: 24 * 60 * 60 * 1000,
};

function compose(overrides: Partial<TriageBulletsInput> = {}): TriageBullet[] {
  return composeTriageBullets({
    triage: [],
    feedbackCount: 0,
    unreadSystemAlerts: 0,
    ...CANALE_FRESCO,
    ...overrides,
  });
}

const kinds = (bullets: TriageBullet[]) => bullets.map((b) => b.kind);

describe("composeTriageBullets — behaviour that stays across the fix", () => {
  it("orders unread → critical → warning → feedback and caps at 3 on a healthy channel", () => {
    const result = compose({
      triage: [CRITICO, WARNING],
      feedbackCount: 1,
      unreadSystemAlerts: 2,
    });
    expect(kinds(result)).toEqual(["unread", "critical", "warning"]);
  });

  it("fills the warning slot with the 2nd critical when no warning exists", () => {
    const result = compose({ triage: [CRITICO, SECONDO_CRITICO] });
    expect(result).toEqual([
      { kind: "critical", athleteName: "Anna", description: "ACWR 1.8" },
      { kind: "warning", athleteName: "Bruno", description: "dolore al ginocchio" },
    ]);
  });

  it("passes the unread and feedback counts through, for the component copy", () => {
    const result = compose({ feedbackCount: 3, unreadSystemAlerts: 5 });
    expect(result).toEqual([
      { kind: "unread", count: 5 },
      { kind: "feedback", count: 3 },
    ]);
  });

  it("keeps the unread bullet as the head when the channel is healthy", () => {
    const result = compose({ triage: [CRITICO], unreadSystemAlerts: 1 });
    expect(kinds(result)).toEqual(["unread", "critical"]);
  });

  it("reassures only an empty board with a fresh answer and nothing unread", () => {
    expect(compose()).toEqual([{ kind: "all-clear" }]);
  });

  it("reassures at the freshness boundary, exactly like canReassure", () => {
    expect(compose({ answeredAgoMs: CHANNEL_FRESHNESS_MS })).toEqual([{ kind: "all-clear" }]);
  });

  it("goes mute one instant past the freshness boundary on an empty board", () => {
    expect(compose({ answeredAgoMs: CHANNEL_FRESHNESS_MS + 1 })).toEqual([
      { kind: "channel-mute" },
    ]);
  });

  it("says 'checking' on an empty board while the request is in flight", () => {
    expect(compose({ ...CANALE_IN_VOLO })).toEqual([{ kind: "channel-checking" }]);
  });

  it("says the channel is mute on an empty board when it never answered", () => {
    expect(compose({ ...CANALE_MUTO })).toEqual([{ kind: "channel-mute" }]);
  });

  it("says the channel is mute on an empty board when the answer is stale", () => {
    expect(compose({ ...CANALE_STANTIO })).toEqual([{ kind: "channel-mute" }]);
  });

  it("shows no doppione when the channel is fresh: unread alone, even mid-refetch", () => {
    expect(compose({ unreadSystemAlerts: 3 })).toEqual([{ kind: "unread", count: 3 }]);
    expect(compose({ unreadSystemAlerts: 3, channelFetching: true })).toEqual([
      { kind: "unread", count: 3 },
    ]);
  });

  it("is pure: same input, same output, input untouched", () => {
    const triage = [CRITICO, WARNING];
    const input = { triage, feedbackCount: 1, unreadSystemAlerts: 1, ...CANALE_MUTO };
    const first = composeTriageBullets(input);
    const second = composeTriageBullets(input);
    expect(first).toEqual(second);
    expect(triage).toEqual([CRITICO, WARNING]);
  });
});

// NOTE on the red-first evidence: the extraction commit carried a describe
// block pinning the DEFECT with these same inputs and inverted assertions
// (mute absent behind a full board). It was retired in the same commit as
// the fix — its inputs live on below with the corrected expectations, and
// the red run captured on the extraction tree is archived in the PR.

// Acceptance of the fix (spec §4, corrected 2026-08-02): the channel-status
// bullet becomes the HEAD of the list — pushed first, independent of the
// board, never dropped by the cap. Precedence: a fresh answer needs no
// bullet (even mid-refetch); otherwise an in-flight request says "checking";
// otherwise (never answered, errored, paused offline, or stale) the channel
// is mute and says so — over a full board too.
describe("composeTriageBullets — the mute channel speaks over a full board", () => {
  it("puts the mute bullet ahead of pending feedback (the spec §2 scenario)", () => {
    // Covers error, never-answered and paused-offline alike: same inputs.
    const result = compose({ ...CANALE_MUTO, feedbackCount: 2 });
    expect(result).toEqual([{ kind: "channel-mute" }, { kind: "feedback", count: 2 }]);
  });

  it("keeps the mute bullet through the cap with critical+warning+feedback", () => {
    const result = compose({ ...CANALE_MUTO, triage: [CRITICO, WARNING], feedbackCount: 1 });
    expect(kinds(result)).toEqual(["channel-mute", "critical", "warning"]);
    expect(result).toHaveLength(3);
  });

  it("with five candidates drops the last of the others, never the channel", () => {
    const result = compose({
      ...CANALE_MUTO,
      triage: [CRITICO, WARNING],
      feedbackCount: 1,
      unreadSystemAlerts: 2,
    });
    expect(kinds(result)).toEqual(["channel-mute", "unread", "critical"]);
  });

  it("says 'checking', never mute, while the first load is in flight over a full board", () => {
    const result = compose({ ...CANALE_IN_VOLO, feedbackCount: 2 });
    expect(result).toEqual([{ kind: "channel-checking" }, { kind: "feedback", count: 2 }]);
  });

  it("keeps the checking bullet through the cap too", () => {
    const result = compose({ ...CANALE_IN_VOLO, triage: [CRITICO, WARNING], feedbackCount: 1 });
    expect(kinds(result)).toEqual(["channel-checking", "critical", "warning"]);
  });

  it("lets mute and unread coexist on a stale answer, mute first (spec §4.6)", () => {
    const result = compose({ ...CANALE_STANTIO, unreadSystemAlerts: 2 });
    expect(result).toEqual([{ kind: "channel-mute" }, { kind: "unread", count: 2 }]);
  });

  it("says 'checking' instead of mute while a stale answer is being refreshed", () => {
    const result = compose({ ...CANALE_STANTIO, channelFetching: true, unreadSystemAlerts: 2 });
    expect(kinds(result)).toEqual(["channel-checking", "unread"]);
  });

  it("treats a failed refetch after a fresh success as a mute channel", () => {
    // TanStack v5 flips status to 'error' on a failed refetch even though
    // recent data is retained: answered=false, age irrelevant.
    const result = compose({
      channelAnswered: false,
      channelFetching: false,
      answeredAgoMs: 31_000,
      feedbackCount: 1,
    });
    expect(kinds(result)).toEqual(["channel-mute", "feedback"]);
  });

  // The rule as a whole, swept over the full input grid: never an empty
  // list, never more than 3 bullets, exactly one channel-status bullet
  // unless the answer is fresh, the all-clear only ever alone and only on
  // a fresh empty board. This is also the tripwire for the fail-closed
  // fallback: if the head's freshness test ever drifts from canReassure's,
  // one of these cells breaks.
  it("holds the invariants over every channel state × board combination", () => {
    const agos = [1_000, CHANNEL_FRESHNESS_MS, CHANNEL_FRESHNESS_MS + 1, Infinity];
    const boards = [[], [CRITICO], [CRITICO, WARNING]];
    for (const channelAnswered of [true, false])
      for (const channelFetching of [true, false])
        for (const answeredAgoMs of agos)
          for (const unreadSystemAlerts of [0, 2])
            for (const feedbackCount of [0, 1])
              for (const triage of boards) {
                const result = composeTriageBullets({
                  triage,
                  feedbackCount,
                  unreadSystemAlerts,
                  channelAnswered,
                  channelFetching,
                  answeredAgoMs,
                });
                const label = JSON.stringify({
                  channelAnswered,
                  channelFetching,
                  answeredAgoMs,
                  unreadSystemAlerts,
                  feedbackCount,
                  triage: triage.length,
                });
                const fresh = channelAnswered && answeredAgoMs <= CHANNEL_FRESHNESS_MS;
                const channelBullets = result.filter(
                  (b) => b.kind === "channel-mute" || b.kind === "channel-checking",
                ).length;
                expect(result.length, label).toBeGreaterThanOrEqual(1);
                expect(result.length, label).toBeLessThanOrEqual(3);
                expect(channelBullets, label).toBe(fresh ? 0 : 1);
                if (kinds(result).includes("all-clear")) {
                  expect(result, label).toEqual([{ kind: "all-clear" }]);
                  expect(
                    canReassure({ unreadSystemAlerts, channelAnswered, answeredAgoMs }),
                    label,
                  ).toBe(true);
                }
              }
  });
});
