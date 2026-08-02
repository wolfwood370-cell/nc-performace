/**
 * src/lib/coachAlerts.ts
 * ---------------------------------------------------------------------------
 * Ordering rules for the coach alert surface (`coach_alerts`).
 *
 * Pure on purpose: vitest runs node-only over `src/**\/*.test.ts`
 * (`vitest.config.ts`, decision 2026-07-14), so the only ordering contract
 * that can be covered by a test is one that lives outside the component.
 */

/**
 * DB severity vocabulary (`coach_alerts.severity`). Deliberately NOT the
 * client triage enum (`critical|warning|info`): the two were never
 * reconciled, and mapping one onto the other would invent a correspondence
 * that does not exist.
 */
const SEVERITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Unknown severities sort last instead of throwing. The column carries a
 * CHECK today, but `type` next to it is free TEXT — the surface tolerates
 * a vocabulary that drifts server-side.
 */
const UNKNOWN_SEVERITY_RANK = 3;

export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? UNKNOWN_SEVERITY_RANK;
}

/** Epoch ms, with unparseable timestamps pushed to the bottom. */
function timeOf(createdAt: string): number {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Structural shape of what the ordering needs. Keeps this module from
 * having to import the row type out of `useCoachAlerts`, which does not
 * export it.
 */
export interface SortableAlert {
  severity: string;
  read: boolean;
  created_at: string;
}

/**
 * Unread first, then severity (high → low), then most recent first.
 *
 * Returns a new array: the input is TanStack Query cache data and must
 * never be sorted in place.
 */
export function sortCoachAlerts<T extends SortableAlert>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;

    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;

    return timeOf(b.created_at) - timeOf(a.created_at);
  });
}

/**
 * Whether the Command Center is allowed to tell the coach that everything is
 * fine.
 *
 * It exists because the reassurance on `CoachHome` was computed from
 * `useCoachDashboardMetrics` (client-side triage) alone, while the alerts
 * that contradict it come from `useCoachAlerts` (`coach_alerts`, written
 * server-side by the CORE §0 escalation channel). The two sources never
 * talked, so «Tutto sotto controllo» could be printed straight above an
 * unread `nutrition_safety` alert — measured on the live app, 2026-08-01.
 *
 * The gate is ONE POSITIVE SIGNAL, deliberately narrow: the channel answered
 * RECENTLY. Two prior versions of this rule were each defeated the same way,
 * and the history is the specification:
 *
 * 1. Enumerating failures ("not loading and not errored") missed the retry
 *    paused offline (`networkMode: 'offlineFirst'` → `status: 'pending'`,
 *    `fetchStatus: 'paused'`, both flags false, data undefined) — every state
 *    you forget, or the library adds later, defaults to reassuring.
 * 2. `isSuccess` alone trusts an answer that is not one: this app hydrates
 *    the query cache from IndexedDB with `maxAge` 24h (src/main.tsx:33-37),
 *    and a hydrated query is `status: 'success'` WITH YESTERDAY'S state
 *    (query-core hydration.js:124 keeps the persisted `dataUpdatedAt`). An
 *    offline coach would be reassured on a day-old snapshot that cannot
 *    contain last night's alert. `placeholderData` forges 'success' the same
 *    way (queryObserver.js:277-283) with `dataUpdatedAt` 0 — unused by this
 *    hook today, but covered by the same check.
 *
 * So the caller passes the AGE of the answer, not just its existence, and
 * the threshold lives here so the test can pin it. Freshness is judged at
 * render time; `refetchOnWindowFocus` re-renders on the coach's return, so a
 * tab left open does not hold a stale all-clear across a wake-up.
 *
 * Pure so the invariant is falsifiable by a test instead of by eye — the
 * component only renders what this decides.
 */
export const CHANNEL_FRESHNESS_MS = 5 * 60 * 1000;

export function canReassure(input: {
  unreadSystemAlerts: number;
  channelAnswered: boolean;
  /** Age of the last successful answer; Infinity when there has never been one. */
  answeredAgoMs: number;
}): boolean {
  return (
    input.channelAnswered &&
    input.answeredAgoMs <= CHANNEL_FRESHNESS_MS &&
    input.unreadSystemAlerts === 0
  );
}

/**
 * Copy for the unread-alert bullet. Total for any input, but the caller only
 * builds it when the count is positive (`canReassure` is the gate).
 */
export function unreadAlertsSummary(count: number): string {
  return count === 1
    ? "Hai 1 avviso dal sistema da leggere qui sotto."
    : `Hai ${count} avvisi dal sistema da leggere qui sotto.`;
}

/**
 * Copy for the channel-status bullets of the Command Center, exported (like
 * `unreadAlertsSummary`) so the exact wording is pinned by unit tests: the
 * component only maps these onto icons.
 */
export const ALL_CLEAR_MESSAGE = "Tutto sotto controllo. Nessun alert critico in coda oggi.";
export const CHANNEL_CHECKING_MESSAGE = "Sto controllando gli avvisi dal sistema…";
export const CHANNEL_MUTE_MESSAGE =
  "Non riesco a leggere gli avvisi dal sistema. Controlla la connessione.";

/**
 * Client-side triage alert as the composition needs it. `description` is the
 * component's `details || value`; the composition never sees a raw
 * `UrgentAlert`.
 */
export interface ComposableTriageAlert {
  severity: string;
  athleteName: string;
  description: string;
}

/** Data-only bullet descriptors: the component maps `kind` onto icon + JSX. */
export type TriageBullet =
  | { kind: "channel-mute" }
  | { kind: "channel-checking" }
  | { kind: "unread"; count: number }
  | { kind: "critical"; athleteName: string; description: string }
  | { kind: "warning"; athleteName: string; description: string }
  | { kind: "feedback"; count: number }
  | { kind: "all-clear" };

export interface TriageBulletsInput {
  /** Client triage, already filtered to critical|warning and capped upstream. */
  triage: ReadonlyArray<ComposableTriageAlert>;
  feedbackCount: number;
  unreadSystemAlerts: number;
  /** alertsQuery.isSuccess */
  channelAnswered: boolean;
  /** alertsQuery.isFetching */
  channelFetching: boolean;
  /** Age of the last successful answer at render time; Infinity when there has never been one. */
  answeredAgoMs: number;
}

/**
 * Composition of the Command Center bullets.
 *
 * The channel-status bullet is the HEAD of the list: pushed first,
 * independent of the board, so the cap can never drop it. A dropped critical
 * is still discoverable in the Triage card below on the same page; a dropped
 * channel warning has no other surface — so when the list overflows, the
 * LAST of the board bullets falls, never the channel (spec §4.3).
 *
 * Channel precedence (spec §4.2, corrected 2026-08-02):
 *   1. fresh answer (`answered && age <= CHANNEL_FRESHNESS_MS`) → no channel
 *      bullet, even while a background refetch is in flight — otherwise
 *      "checking" would flash on a healthy dashboard on nearly every
 *      navigation (staleTime 30s, and the hook remounts with the sidebar);
 *   2. otherwise, a request in flight → "checking" (the truth);
 *   3. otherwise → mute. Reachable ONLY with no fetch in flight and no fresh
 *      answer (never-answered, errored, paused offline, stale-hydrated): the
 *      first-load false alarm is impossible by construction.
 *
 * On a stale answer with unread alerts the mute and unread bullets coexist,
 * mute first — they say different things: "there are N alerts" and "these
 * numbers are old" (spec §4.6).
 */
export function composeTriageBullets(input: TriageBulletsInput): TriageBullet[] {
  // Same constant and same `<=` as canReassure: if the two ever drift, the
  // fail-closed fallback below stops being dead code and the invariant sweep
  // in the tests breaks.
  const channelFresh = input.channelAnswered && input.answeredAgoMs <= CHANNEL_FRESHNESS_MS;

  const head: TriageBullet[] = [];
  if (!channelFresh) {
    head.push(input.channelFetching ? { kind: "channel-checking" } : { kind: "channel-mute" });
  }

  const rest: TriageBullet[] = [];

  // Unread system alerts (`coach_alerts`) — ahead of the board bullets, so
  // only the channel-status bullet can outrank it.
  if (input.unreadSystemAlerts > 0) {
    rest.push({ kind: "unread", count: input.unreadSystemAlerts });
  }

  const topCritical = input.triage.find((a) => a.severity === "critical");
  if (topCritical) {
    rest.push({
      kind: "critical",
      athleteName: topCritical.athleteName,
      description: topCritical.description,
    });
  }

  // Warning slot: top warning, or the 2nd critical if no warning exists.
  const topWarning =
    input.triage.find((a) => a.severity === "warning") ??
    input.triage.filter((a) => a.severity === "critical")[1];
  if (topWarning) {
    rest.push({
      kind: "warning",
      athleteName: topWarning.athleteName,
      description: topWarning.description,
    });
  }

  if (input.feedbackCount > 0) {
    rest.push({ kind: "feedback", count: input.feedbackCount });
  }

  const out = [...head, ...rest.slice(0, 3 - head.length)];
  if (out.length > 0) return out;

  // An empty list here means a fresh channel over an empty board, which is
  // exactly `canReassure`'s conjunction — so the mute arm is dead code by
  // construction. Kept fail-closed on purpose: any state this reasoning
  // forgot, or a future drift of the freshness test above, must read as
  // "cannot read the channel", never as good news.
  return canReassure({
    unreadSystemAlerts: input.unreadSystemAlerts,
    channelAnswered: input.channelAnswered,
    answeredAgoMs: input.answeredAgoMs,
  })
    ? [{ kind: "all-clear" }]
    : [{ kind: "channel-mute" }];
}
