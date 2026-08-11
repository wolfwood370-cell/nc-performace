// =============================================================================
// src/pages/athlete/AthleteDashboard.tsx
// =============================================================================
// Phase 1 of the new Athlete App — "Dense Dashboard".
//
// Adapts the layout from athlete_home_dashboard_dense.html to React, using:
//   - the project's existing Tailwind tokens (brand / surface / on-surface),
//   - lucide-react icons in place of Material Symbols,
//   - inline sub-components (ReadinessRing, MetricRow, ReadinessCard,
//     NextWorkoutCard, Header) so the file is fully self-contained and
//     doesn't create new module surface area before the data layer lands.
//
// Strict deviations from the reference HTML:
//   - "LUMINA" brand mark → "NC Performance"
//   - Avatar moved from top-left to top-right (per brief)
//   - "Today's Focus" card relabelled "Prossimo Allenamento"; CTA text
//     translated to "Inizia Sessione"; mock title "Forza Lower Body"
//   - Notifications button dropped (brief asks only for app name + avatar)
//   - Nutrition / Metabolic widget OMITTED entirely
//
// Glass surface opacity is bumped from the HTML's `bg-white/[0.04]` to
// `bg-white/70` to follow the DESIGN.md "Level 1 (Widgets)" spec ("white
// surfaces at 70% opacity"). The 4% in the raw HTML is essentially
// invisible against the bright #f5faff base; 70% gives the intended
// frosted-glass effect on light mode.
//
// All data here is mock — Supabase wiring (daily_readiness + next workout
// query) lands in the follow-up commit.
// =============================================================================

import { useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  Dumbbell,
  Minus,
  Play,
  Settings2,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeWorstMetrics,
  METRIC_KEYS,
  useAthleteReadinessStore,
  type MetricKey,
  type MetricSnapshot,
} from "@/stores/useAthleteReadinessStore";
import { useDailyReadinessQuery } from "@/hooks/athlete/useAthleteReadinessHooks";
import { usePaymentOutcome } from "@/hooks/athlete/usePaymentOutcome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

/** Today's date as ISO `YYYY-MM-DD` — used as the `daily_readiness.date` key. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================================================
// Metric polarity map — drives whether "today > yesterday" is rendered
// as improvement (green TrendingUp) or regression (amber TrendingDown).
// "Sonno is up" = better sleep = good. "Stress is up" = worse. The map
// lives at module scope (not inside the component) so its reference is
// stable across renders.
// =============================================================================
const POSITIVE_POLARITY: Record<MetricKey, "high-is-good" | "low-is-good"> = {
  Sonno: "high-is-good",
  Umore: "high-is-good",
  Digestione: "high-is-good",
  Stress: "low-is-good",
  Fatica: "low-is-good",
  Soreness: "low-is-good",
};

type TrendDirection = "up" | "down" | "flat";

function computeTrendDirection(
  metric: MetricKey,
  today: number | null,
  yesterday: number | null,
): TrendDirection {
  if (today === null || yesterday === null) return "flat";
  if (today === yesterday) return "flat";
  const ascending = today > yesterday;
  const polarity = POSITIVE_POLARITY[metric];
  const isImprovement =
    (ascending && polarity === "high-is-good") || (!ascending && polarity === "low-is-good");
  return isImprovement ? "up" : "down";
}

// -----------------------------------------------------------------------------
// MOCK DATA — single source of truth for this page until we wire the hooks.
// -----------------------------------------------------------------------------
const MOCK = {
  athleteName: "Marco",
  nextWorkout: {
    title: "Forza Lower Body",
    durationMin: 45,
    intensity: "High" as const,
  },
} as const;

// =============================================================================
// ReadinessRing — inline SVG circular gauge.
//   - r=45, stroke=8 inside a 100×100 viewBox.
//   - Track is a translucent surface-variant ring; progress is brand cerulean.
//   - Rotated -90° so 0% starts at the 12 o'clock position.
// =============================================================================
function ReadinessRing({ value }: { value: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius; // ≈ 282.74
  const safeValue = Math.max(0, Math.min(100, value));
  const dashOffset = circumference * (1 - safeValue / 100);

  return (
    <div
      role="img"
      aria-label={`Punteggio readiness ${safeValue} su 100`}
      className="relative w-28 h-28 flex items-center justify-center z-10"
    >
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        {/* Track */}
        <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#c5e7ff" strokeWidth="8" />
        {/* Progress */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="#226fa3"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold tabular-nums text-brand-container">
          {safeValue}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// MetricTrendRow — one dashboard metric: name + today value + trend icon.
// All three columns derived from the live readiness store.
// =============================================================================
function MetricTrendRow({ metric, snapshot }: { metric: MetricKey; snapshot: MetricSnapshot }) {
  const direction = computeTrendDirection(metric, snapshot.today, snapshot.yesterday);
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const iconTint =
    direction === "up"
      ? "text-emerald-600"
      : direction === "down"
        ? "text-amber-600"
        : "text-on-surface-variant/60";
  const displayValue =
    snapshot.today === null
      ? "—"
      : Number.isInteger(snapshot.today)
        ? String(snapshot.today)
        : snapshot.today.toFixed(1);

  return (
    <div className="flex items-center justify-between">
      <span className="font-sans text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant">
        {metric}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-display text-xs font-bold tabular-nums text-on-surface">
          {displayValue}
        </span>
        <Icon
          className={cn("h-3.5 w-3.5", iconTint)}
          strokeWidth={2.5}
          aria-label={
            direction === "up"
              ? "In miglioramento"
              : direction === "down"
                ? "In peggioramento"
                : "Stabile"
          }
        />
      </span>
    </div>
  );
}

// =============================================================================
// ReadinessCard — top glass widget for today's readiness.
//
// Behaviour:
//   - Interactive ONLY while today's check-in is missing: the whole
//     surface then routes to /athlete/daily-checkin (logging flow) via
//     the parent's `onLogToday`. Once the check-in exists the card goes
//     static — real score, no navigation (the mock analysis page it
//     used to open was removed).
//   - Completion flag and score come from the card's own
//     useDailyReadinessQuery (DB row for today), not from the store.
//   - The ring renders `dailyScore` when available, else 0.
//   - The left column maps over `selectedDashboardMetrics` and renders
//     one MetricTrendRow per pick (default: Sonno / Stress / Fatica).
//   - A small Settings2 button (top-right) opens the settings dialog.
//     stopPropagation keeps it from triggering the card's tap action;
//     the card uses `role="button"` (not an actual <button>) precisely
//     so this inner button stays HTML-valid.
// =============================================================================
function ReadinessCard({
  onLogToday,
  onEditMetrics,
}: {
  onLogToday: () => void;
  onEditMetrics: () => void;
}) {
  // Source of truth: the DB row for today. `isCompletedToday` is just
  // "did we get a row back" and `dailyScore` is its `score` column.
  const todayQuery = useDailyReadinessQuery(todayIso());
  const dailyScore = todayQuery.data?.score ?? null;
  const isCompletedToday = Boolean(todayQuery.data);

  const metrics = useAthleteReadinessStore((s) => s.metrics);
  const selectedDashboardMetrics = useAthleteReadinessStore((s) => s.selectedDashboardMetrics);
  const isCustomMetricsPinned = useAthleteReadinessStore((s) => s.isCustomMetricsPinned);

  // When the user has NOT pinned a custom selection, surface the three
  // worst-scoring metrics from today's checkin so the dashboard draws
  // attention to what needs work. Falls back to the pinned default when
  // no submission exists yet (empty worst list).
  const worstMetrics = computeWorstMetrics(metrics, 3);
  const displayedMetricKeys =
    isCustomMetricsPinned || worstMetrics.length === 0 ? selectedDashboardMetrics : worstMetrics;

  const ringValue = isCompletedToday && dailyScore !== null ? dailyScore : 0;

  // Interactive only while the check-in is missing. A completed card is
  // a static region: no role, no tabIndex, no aria-label (a generic div
  // must not carry one), no pointer affordance.
  const interactiveProps = isCompletedToday
    ? {}
    : {
        role: "button",
        tabIndex: 0,
        onClick: onLogToday,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onLogToday();
          }
        },
        "aria-label": "Registra la tua Prontezza di oggi",
      };

  return (
    <div
      {...interactiveProps}
      className={cn(
        "relative overflow-hidden w-full text-left",
        "rounded-3xl p-6",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "flex justify-between items-center",
        !isCompletedToday && "transition-transform active:scale-[0.99] cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-container/40",
      )}
    >
      {/* Ambient brand glow — decorative, behind everything else. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 bg-brand-container/15 rounded-full blur-[40px]"
      />

      {/* Settings2 button — picks the 3 dashboard metrics. stopPropagation
          keeps the card's onClick from firing when this is tapped. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditMetrics();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Modifica metriche visibili"
        className={cn(
          "absolute top-3 right-3 z-20",
          "h-8 w-8 rounded-full",
          "flex items-center justify-center",
          "bg-white/70 backdrop-blur-md border border-[#c0c7d0]/30",
          "text-on-surface-variant",
          "hover:text-on-surface hover:bg-white transition-colors",
          "active:scale-95",
        )}
      >
        <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>

      {/* Left half: dynamic metric rows */}
      <div className="flex flex-col gap-3 z-10 w-1/2">
        <h2 className="font-display text-xl font-semibold text-brand-container leading-tight">
          Prontezza
        </h2>

        {displayedMetricKeys.map((key) => (
          <MetricTrendRow key={key} metric={key} snapshot={metrics[key]} />
        ))}
      </div>

      {/* Right half: circular gauge — real value from today's check-in
          (0 while the check-in is missing) */}
      <ReadinessRing value={ringValue} />
    </div>
  );
}

// =============================================================================
// NextWorkoutCard — middle glass widget with primary CTA. The "Inizia
// Sessione" button delegates to the page-level `onStart` handler so the
// store / navigation wiring lives in one place at the composition root.
// =============================================================================
function NextWorkoutCard({ onStart }: { onStart: () => void }) {
  return (
    <section
      aria-label="Prossimo allenamento"
      className={cn(
        "relative overflow-hidden",
        "rounded-3xl p-6",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "flex flex-col gap-6",
      )}
    >
      {/* Soft brand gradient — decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-container/8 to-transparent opacity-70"
      />

      <div className="z-10">
        <span className="block font-sans text-[11px] font-semibold tracking-widest uppercase text-brand-container/80">
          Prossimo Allenamento
        </span>

        <p className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant">
          <Activity className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
          {MOCK.nextWorkout.durationMin} min
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <Dumbbell className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
          {MOCK.nextWorkout.intensity} intensity
        </p>

        <h2 className="mt-2 font-display text-2xl font-semibold leading-tight text-brand-container">
          {MOCK.nextWorkout.title}
        </h2>
      </div>

      <button
        type="button"
        onClick={onStart}
        className={cn(
          "z-10 w-full",
          "flex items-center justify-center gap-2",
          "py-4 px-6 rounded-full",
          "bg-brand-container text-white",
          "font-sans text-base font-semibold",
          "shadow-[0_4px_14px_rgba(34,111,163,0.3)]",
          "active:scale-[0.98] transition-transform duration-200",
        )}
      >
        Inizia Sessione
        <Play className="h-5 w-5 fill-white" strokeWidth={0} aria-hidden="true" />
      </button>
    </section>
  );
}

// =============================================================================
// Header — sticks to the top of the layout's scroll container.
//
// Negative margins (-mx-5 / -mt-6) cancel the parent <main>'s padding so the
// header spans edge-to-edge and pins at top:0 cleanly. z-30 keeps it under
// the global bottom nav (z-50) but above all card content.
// =============================================================================
function Header() {
  return (
    <header
      className={cn(
        "sticky top-0 z-30",
        "-mx-5 -mt-6 px-5 py-4",
        "backdrop-blur-3xl bg-white/85",
        "border-b border-[#c0c7d0]/40",
      )}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-black tracking-tighter text-on-surface">
          NC Performance
        </h1>

        <Link
          to="/athlete/profile"
          aria-label="Apri profilo"
          className={cn(
            "h-10 w-10 rounded-full",
            "flex items-center justify-center",
            "bg-surface-container border border-[#c0c7d0]/50",
            "text-brand-container",
            "transition-transform active:scale-95",
          )}
        >
          <User className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

// =============================================================================
// MetricsSettingsDialog — Settings2 → opens this Dialog. Replaces the
// prior `window.prompt` flow.
//
// UX contract:
//   - Toggle "Personalizza metriche": when off, the Prontezza card
//     auto-surfaces the 3 worst metrics (via `computeWorstMetrics`).
//     When on, the card pins the three checkbox-selected metrics.
//   - 6 checkboxes (one per METRIC_KEY). Disabled while the toggle is
//     off so the affordance reads as "Auto" mode.
//   - The Save button enforces exactly 3 picks when pinned mode is on;
//     it's disabled otherwise with a hint underneath.
// =============================================================================
function MetricsSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const persistedPinned = useAthleteReadinessStore((s) => s.isCustomMetricsPinned);
  const persistedSelected = useAthleteReadinessStore((s) => s.selectedDashboardMetrics);
  const setCustomMetricsPinned = useAthleteReadinessStore((s) => s.setCustomMetricsPinned);
  const setSelectedMetrics = useAthleteReadinessStore((s) => s.setSelectedMetrics);

  // Local draft state — only commits to the store on Save so the user
  // can cancel without side effects. Reseeds from persisted state when
  // the dialog opens (key trick: derive from `open` prop in useState).
  const [draftPinned, setDraftPinned] = useState(persistedPinned);
  const [draftSelected, setDraftSelected] = useState<MetricKey[]>(persistedSelected);

  // Re-sync drafts whenever the dialog opens, so a previous Cancel
  // doesn't leak stale local state into the next open.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (open) {
      setDraftPinned(persistedPinned);
      setDraftSelected(persistedSelected);
    }
  }

  const toggleMetric = (key: MetricKey, checked: boolean) => {
    setDraftSelected((prev) => {
      const set = new Set(prev);
      if (checked) {
        set.add(key);
      } else {
        set.delete(key);
      }
      return Array.from(set);
    });
  };

  const canSave = !draftPinned || draftSelected.length === 3;

  const handleSave = () => {
    setCustomMetricsPinned(draftPinned);
    if (draftPinned) {
      setSelectedMetrics(draftSelected);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Metriche dashboard</DialogTitle>
          <DialogDescription>
            Scegli se mostrare automaticamente le 3 metriche peggiori (default) o pinnare 3 metriche
            fisse.
          </DialogDescription>
        </DialogHeader>

        {/* Pin / auto toggle — inline because Switch isn't pulled in
            elsewhere on this page; a styled checkbox covers the same
            semantic without dragging another primitive. */}
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#c0c7d0]/30 bg-surface-container/40 px-4 py-3 cursor-pointer">
          <span className="flex flex-col">
            <span className="font-sans text-sm font-semibold text-on-surface">
              Personalizza metriche
            </span>
            <span className="font-sans text-xs text-on-surface-variant">
              {draftPinned ? "Pin manuale" : "Auto · 3 peggiori"}
            </span>
          </span>
          <Checkbox
            checked={draftPinned}
            onCheckedChange={(v) => setDraftPinned(v === true)}
            aria-label="Attiva personalizzazione metriche"
          />
        </label>

        <fieldset
          className="flex flex-col gap-2"
          disabled={!draftPinned}
          aria-label="Selezione metriche dashboard"
        >
          {METRIC_KEYS.map((key) => {
            const checked = draftSelected.includes(key);
            return (
              <label
                key={key}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-2",
                  "border border-transparent",
                  draftPinned
                    ? "bg-white hover:bg-surface-container/40 cursor-pointer"
                    : "bg-surface-container/30 cursor-not-allowed opacity-60",
                )}
              >
                <span className="font-sans text-sm text-on-surface">{key}</span>
                <Checkbox
                  checked={checked}
                  disabled={!draftPinned}
                  onCheckedChange={(v) => toggleMetric(key, v === true)}
                  aria-label={`Metrica ${key}`}
                />
              </label>
            );
          })}
        </fieldset>

        {draftPinned && draftSelected.length !== 3 && (
          <p role="alert" className="text-xs font-medium text-amber-600 -mt-1">
            Seleziona esattamente 3 metriche ({draftSelected.length}/3 selezionate).
          </p>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "h-10 px-5 rounded-full",
              "font-sans text-sm font-semibold",
              "border border-[#c0c7d0]/40 text-on-surface",
              "hover:bg-surface-container/60 transition-colors",
            )}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "h-10 px-5 rounded-full",
              "font-sans text-sm font-semibold text-white",
              "bg-brand-container hover:brightness-110 transition-all",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            Salva
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// AthleteDashboard — composition only. All visual work lives in the
// inline sub-components above.
// =============================================================================
export default function AthleteDashboard() {
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Stripe's success_url lands here with ?payment=success.
  usePaymentOutcome();

  /** Card tap while today's check-in is missing — hands off to the
   *  logging flow. Once the check-in exists the card goes static
   *  (ReadinessCard decides from its own query). */
  const handleLogReadiness = () => {
    navigate("/athlete/daily-checkin");
  };

  /** Settings2 affordance on the Readiness card opens the settings
   *  dialog (replaces the prior `window.prompt` flow). */
  const handleEditMetrics = () => {
    setIsSettingsOpen(true);
  };

  /** Starts a session in the shared store and hands off to the
   *  full-screen active workout overlay. Identical contract to the
   *  AthleteTraining sticky CTA so both entry points stay symmetrical. */
  const handleStartWorkout = () => {
    // Session row is INSERTed in ActiveWorkout's mount effect so the
    // mutation only fires once we're truly on that page.
    navigate("/athlete/active-workout");
  };

  return (
    <div className="flex flex-col gap-4">
      <Header />

      {/* Greeting */}
      <section className="pt-2">
        <p className="font-display text-3xl font-bold tracking-tight text-on-surface">
          Ciao, {MOCK.athleteName}
        </p>
        <p className="mt-1 text-sm text-on-surface-variant">Ecco il tuo riepilogo di oggi.</p>
      </section>

      <ReadinessCard onLogToday={handleLogReadiness} onEditMetrics={handleEditMetrics} />
      <NextWorkoutCard onStart={handleStartWorkout} />

      <MetricsSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}
