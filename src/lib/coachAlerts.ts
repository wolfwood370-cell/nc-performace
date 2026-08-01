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
 * `channelAnswered` is deliberately ONE POSITIVE SIGNAL rather than a list of
 * things that can go wrong. The first version of this rule enumerated the
 * failures — "not loading and not errored" — and missed the fourth state:
 * with `networkMode: 'offlineFirst'` a retry paused offline leaves
 * `status: 'pending'`, `fetchStatus: 'paused'`, so `isLoading` and `isError`
 * are BOTH false while `data` is undefined, the unread count is 0 for lack of
 * an answer, and the coach was told everything was fine.
 *
 * That is the general failure of enumerating negatives: every state you
 * forget — and every state the library adds later — defaults to reassuring.
 * Keyed off "the channel answered", anything unfamiliar defaults to silence.
 *
 * Pure so the invariant is falsifiable by a test instead of by eye — the
 * component only renders what this decides.
 */
export function canReassure(input: {
  unreadSystemAlerts: number;
  channelAnswered: boolean;
}): boolean {
  return input.channelAnswered && input.unreadSystemAlerts === 0;
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
