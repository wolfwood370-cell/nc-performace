/**
 * src/stores/useAthleteReadinessStore.ts
 * ---------------------------------------------------------------------------
 * Zustand store for the athlete's "Prontezza" dashboard PREFERENCES.
 *
 * Preferences ONLY — this store holds which metrics the athlete wants on
 * the dashboard card and whether that pick is pinned. It is NOT a data
 * source: today's metric values and the composite score live in the
 * `daily_readiness` row (useDailyReadinessQuery) and nowhere else. The
 * previous version also persisted per-metric today/yesterday snapshots
 * in localStorage; those never expired, so days-old values resurfaced
 * under "riepilogo di oggi". v1 (`version` + `migrate`) drops them.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Domain — the metric vocabulary of the dashboard card.
// ---------------------------------------------------------------------------

export const METRIC_KEYS = [
  "Sonno",
  "Stress",
  "Fatica",
  "Soreness",
  "Umore",
  "Digestione",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

const DEFAULT_DASHBOARD_METRICS: MetricKey[] = ["Sonno", "Stress", "Fatica"];

// ---------------------------------------------------------------------------
// Store contract
// ---------------------------------------------------------------------------

export interface AthleteReadinessStoreState {
  /**
   * Three metric keys to render on the dashboard Prontezza card when
   * `isCustomMetricsPinned === true`. When false, the dashboard
   * dynamically picks the 3 worst metrics from TODAY's readiness row.
   */
  selectedDashboardMetrics: MetricKey[];
  /**
   * When true, the dashboard pins `selectedDashboardMetrics` regardless
   * of today's values. When false (default), it auto-surfaces the 3
   * lowest-scoring metrics so the worst signals get attention.
   */
  isCustomMetricsPinned: boolean;

  // ---- Actions -----------------------------------------------------------
  /** Replace the three metrics to surface on the dashboard card. */
  setSelectedMetrics: (next: MetricKey[]) => void;
  /** Toggle the "pin user choice" mode on the dashboard Prontezza card. */
  setCustomMetricsPinned: (pinned: boolean) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useAthleteReadinessStore = create<AthleteReadinessStoreState>()(
  persist(
    immer((set) => ({
      selectedDashboardMetrics: DEFAULT_DASHBOARD_METRICS,
      isCustomMetricsPinned: false,

      setSelectedMetrics: (next) =>
        set((s) => {
          // Clamp to the first 3 unique keys to keep the dashboard
          // surface consistent. Anything not in METRIC_KEYS is dropped.
          const seen = new Set<MetricKey>();
          const cleaned: MetricKey[] = [];
          for (const k of next) {
            if ((METRIC_KEYS as readonly string[]).includes(k) && !seen.has(k)) {
              cleaned.push(k);
              seen.add(k);
              if (cleaned.length === 3) break;
            }
          }
          if (cleaned.length > 0) {
            s.selectedDashboardMetrics = cleaned;
          }
        }),

      setCustomMetricsPinned: (pinned) =>
        set((s) => {
          s.isCustomMetricsPinned = pinned;
        }),
    })),
    {
      name: "athlete-readiness-storage",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedDashboardMetrics: s.selectedDashboardMetrics,
        isCustomMetricsPinned: s.isCustomMetricsPinned,
      }),
      migrate: (persisted) => {
        // v0 blobs also carried per-metric today/yesterday DATA that
        // never expired. Preferences are the only state that survives:
        // stale metric values must never resurface as "today".
        const p = (persisted ?? {}) as Record<string, unknown>;
        const selected = Array.isArray(p.selectedDashboardMetrics)
          ? p.selectedDashboardMetrics.filter((k): k is MetricKey =>
              (METRIC_KEYS as readonly string[]).includes(k as string),
            )
          : [];
        return {
          selectedDashboardMetrics: selected.length > 0 ? selected : DEFAULT_DASHBOARD_METRICS,
          isCustomMetricsPinned: p.isCustomMetricsPinned === true,
        } as AthleteReadinessStoreState;
      },
    },
  ),
);
