// =============================================================================
// src/pages/athlete/DailyCheckin.tsx
// =============================================================================
// Phase 2 of the new Athlete App — "Daily Readiness Logging".
//
// Adapts the layout from daily_readiness_logging.html. Two glass-on-white
// cards (biofeedback + muscle soreness) stacked over a scrollable canvas,
// with a sticky glassmorphic bottom bar holding the primary "Salva" action.
//
// All state is local React state — no Supabase calls yet (Phase 3 / backend
// integration is explicitly out of scope per brief).
//
// Sub-components are inline (ScoreScaleRow / MusclePill / IntensityControl)
// so the file stays self-contained for this phase. They'll graduate to
// `src/components/athlete/` when reused.
//
// Mount point: this page is a route SIBLING of <AthleteLayout> (not a
// child) — the HTML treats it as a modal-style full-screen flow with its
// own bottom bar that replaces the standard BottomNavBar. Nesting it
// inside the layout would produce two competing bars.
// =============================================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAthleteReadinessStore, type MetricKey } from "@/stores/useAthleteReadinessStore";
import {
  useDailyReadinessQuery,
  useSubmitReadinessMutation,
} from "@/hooks/athlete/useAthleteReadinessHooks";

// -----------------------------------------------------------------------------
// Domain types
// -----------------------------------------------------------------------------
type Score1to5 = 1 | 2 | 3 | 4 | 5;
type Intensity = "mild" | "moderate" | "severe";

interface BiofeedbackMetric {
  id: "sleep" | "energy" | "stress" | "mood" | "digestion";
  label: string;
}

interface MuscleGroup {
  id:
    | "chest"
    | "triceps"
    | "biceps"
    | "shoulders"
    | "traps"
    | "lats"
    | "lower_back"
    | "glutes"
    | "hamstrings"
    | "quads"
    | "calves";
  label: string;
}

type MetricId = BiofeedbackMetric["id"];
type MuscleId = MuscleGroup["id"];

// -----------------------------------------------------------------------------
// Static config — kept inside the file because no other surface needs it.
// -----------------------------------------------------------------------------
const BIOFEEDBACK_METRICS: readonly BiofeedbackMetric[] = [
  { id: "sleep", label: "Sonno" },
  { id: "energy", label: "Energia" },
  { id: "stress", label: "Stress" },
  { id: "mood", label: "Umore" },
  { id: "digestion", label: "Digestione" },
] as const;

const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  { id: "chest", label: "Petto" },
  { id: "triceps", label: "Tricipiti" },
  { id: "biceps", label: "Bicipiti" },
  { id: "shoulders", label: "Spalle" },
  { id: "traps", label: "Trapezi" },
  { id: "lats", label: "Dorsali" },
  { id: "lower_back", label: "Lombari" },
  { id: "glutes", label: "Glutei" },
  { id: "hamstrings", label: "Femorali" },
  { id: "quads", label: "Quadricipiti" },
  { id: "calves", label: "Polpacci" },
] as const;

const INTENSITY_OPTIONS: readonly { value: Intensity; label: string }[] = [
  { value: "mild", label: "Lieve" },
  { value: "moderate", label: "Moderato" },
  { value: "severe", label: "Forte" },
] as const;

/**
 * Classes applied to the *active* intensity button. Mild → yellow,
 * moderate → orange, severe → red — escalating warning palette so the
 * coach can see soreness intensity at a glance on the dashboard.
 */
const ACTIVE_INTENSITY_CLASSES: Record<Intensity, string> = {
  mild: "bg-yellow-500 text-white shadow-inner",
  moderate: "bg-orange-500 text-white shadow-inner",
  severe: "bg-red-500 text-white shadow-inner",
};

const SCORES: readonly Score1to5[] = [1, 2, 3, 4, 5] as const;

/**
 * Pain question options. Deliberately two explicit choices over a boolean
 * toggle: the third state (unanswered = null) is the ABSENCE of a choice,
 * never a default — a missing answer must not be forged into "no pain".
 */
const PAIN_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: true, label: "Sì" },
  { value: false, label: "No" },
] as const;

// =============================================================================
// ScoreScaleRow — one biofeedback metric row: label + 5-button scale.
// Visually & semantically a radiogroup; single-select 1..5.
// =============================================================================
function ScoreScaleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Score1to5 | null;
  onChange: (next: Score1to5) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0">
      <span className="font-sans text-xs font-semibold tracking-wider uppercase text-on-surface-variant min-w-0 truncate">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="flex gap-2 shrink-0">
        {SCORES.map((n) => {
          const isActive = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(n)}
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                "font-sans text-sm font-semibold tabular-nums",
                "transition-all duration-150 active:scale-95",
                isActive
                  ? "bg-brand-container text-white shadow-md"
                  : "bg-surface text-on-surface-variant border border-surface-container hover:bg-surface-variant/40",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MusclePill — single toggle chip in the soreness picker (multi-select).
// =============================================================================
function MusclePill({
  label,
  isSelected,
  onToggle,
}: {
  label: string;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSelected}
      className={cn(
        "px-4 py-2 rounded-full",
        "font-sans text-xs font-semibold tracking-wide",
        "transition-all duration-150 active:scale-95",
        isSelected
          ? "bg-brand-container text-white shadow-md"
          : "bg-surface text-on-surface-variant border border-surface-container hover:bg-surface-variant/40",
      )}
    >
      {label}
    </button>
  );
}

// =============================================================================
// IntensityControl — three-way segmented control for a single sore muscle.
// Renders once per selected muscle.
// =============================================================================
function IntensityControl({
  muscleLabel,
  value,
  onChange,
}: {
  muscleLabel: string;
  value: Intensity;
  onChange: (next: Intensity) => void;
}) {
  return (
    <div className="rounded-2xl p-4 bg-surface-container/70 border border-surface-container/60">
      <p className="font-sans text-[11px] font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
        Intensità · <span className="text-on-surface">{muscleLabel}</span>
      </p>
      <div
        role="radiogroup"
        aria-label={`Intensità per ${muscleLabel}`}
        className="flex rounded-full overflow-hidden border border-surface-container"
      >
        {INTENSITY_OPTIONS.map((opt, i) => {
          const isActive = value === opt.value;
          const isLast = i === INTENSITY_OPTIONS.length - 1;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 py-2.5",
                "font-sans text-xs font-semibold tracking-wide",
                "transition-colors active:brightness-95",
                !isLast && "border-r border-surface-container",
                isActive
                  ? ACTIVE_INTENSITY_CLASSES[opt.value]
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-variant/40",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DailyCheckin — page composition.
// =============================================================================
export default function DailyCheckin() {
  const navigate = useNavigate();
  // Atomic selector — we only fire the submit action; we don't read
  // state here, so the page never re-renders on unrelated mutations.
  const submitDailyCheckin = useAthleteReadinessStore((s) => s.submitDailyCheckin);
  const submitReadiness = useSubmitReadinessMutation();

  // Today's readiness row (if any). Read ONLY to seed the pain answer: the
  // submit is a full-row upsert on (athlete_id, date), so without this seed a
  // same-day re-submit with the question untouched would overwrite an earlier
  // "yes" with null and silently disarm the nutrition safety gate (CORE §0:
  // never bypass silently). Other fields intentionally stay unseeded —
  // pre-existing behaviour, out of this slice's scope.
  // staleTime 0 opts this query out of the app-wide fresh-forever cache
  // (global staleTime Infinity + IndexedDB persist): the pain seed must be
  // re-read from the server every time the observer lands on the key —
  // including the pre-auth "anon" → real key switch, since useAuth is
  // per-instance state and resolves after this page mounts. A persisted
  // value from another tab, device or session is never trusted as-is.
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayReadiness = useDailyReadinessQuery(todayIso, { staleTime: 0 });

  // -- State ----------------------------------------------------------------
  // Biofeedback: per-metric 1..5 single select. Partial: a metric is "unset"
  // until the user taps a value.
  const [biofeedback, setBiofeedback] = useState<Partial<Record<MetricId, Score1to5>>>({});

  // Soreness: a muscle is present in the map iff selected. Its value is the
  // chosen intensity (defaults to "moderate" when first picked).
  const [soreness, setSoreness] = useState<Partial<Record<MuscleId, Intensity>>>({});

  // Pain question — three states: null (unanswered) · true · false. Until the
  // athlete taps an option, the effective value mirrors today's stored answer
  // (null on the first check-in of the day). Once touched, the tap wins over
  // whatever a background refetch may deliver.
  const [painTouched, setPainTouched] = useState(false);
  const [painChoice, setPainChoice] = useState<boolean | null>(null);
  const storedPain = todayReadiness.data?.has_pain ?? null;
  const hasPain = painTouched ? painChoice : storedPain;

  // -- Handlers -------------------------------------------------------------
  const setMetric = (id: MetricId) => (value: Score1to5) => {
    setBiofeedback((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMuscle = (id: MuscleId) => () => {
    setSoreness((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = "moderate"; // sensible default — coach can verify "Forte"
      }
      return next;
    });
  };

  const setIntensity = (id: MuscleId) => (intensity: Intensity) => {
    setSoreness((prev) => ({ ...prev, [id]: intensity }));
  };

  const answerPain = (value: boolean) => () => {
    setPainTouched(true);
    setPainChoice(value);
  };

  const handleClose = () => {
    navigate("/athlete");
  };

  const handleSave = () => {
    // Map the 1..5 biofeedback inputs into the 0..10 scale the store
    // (and the dashboard ring) expects. "Energia" is inverted into
    // "Fatica" because the store models the negative axis (lower
    // fatigue = better). Stress likewise — we store the raw scale and
    // let the dashboard's trend math decide whether up-is-good.
    //
    // The soreness payload aggregates across the picked muscles into a
    // single 0..10 number: average over (10 - intensityCost) where
    // mild=2, moderate=5, severe=8. Zero sore muscles = perfect 10.
    const scale = (n: Score1to5 | undefined): number | null =>
      typeof n === "number" ? n * 2 : null;

    const soreEntries = Object.entries(soreness);
    let sorenessScore: number | null = 10;
    if (soreEntries.length > 0) {
      const intensityCost: Record<Intensity, number> = {
        mild: 2,
        moderate: 5,
        severe: 8,
      };
      const totalCost = soreEntries.reduce(
        (acc, [, level]) => acc + intensityCost[level as Intensity],
        0,
      );
      const avg = totalCost / soreEntries.length;
      sorenessScore = Math.max(0, Math.min(10, 10 - avg));
    }

    const payload: Partial<Record<MetricKey, number | null>> = {
      Sonno: scale(biofeedback.sleep),
      Stress: scale(biofeedback.stress),
      // Fatica = inverted energy. Energy 5 (high) → Fatica 2 (low).
      Fatica: biofeedback.energy !== undefined ? (6 - biofeedback.energy) * 2 : null,
      Umore: scale(biofeedback.mood),
      Digestione: scale(biofeedback.digestion),
      Soreness: sorenessScore,
    };

    // Snappy local UI update so the dashboard trend rows reflect today
    // before the network round-trip completes.
    submitDailyCheckin(payload);

    // Re-check the day at submit time (the hook stamps the row date when the
    // mutation runs): if midnight (UTC) slipped past while the page was open,
    // yesterday's stored seed must not be forged into the new day's row —
    // only an explicit tap survives the day change.
    const submitDate = new Date().toISOString().slice(0, 10);
    const painAnswer = painTouched ? painChoice : submitDate === todayIso ? storedPain : null;

    // Persist to `daily_readiness`. The hook handles error toasts; on
    // success we close the page. The composite `score` is currently a
    // placeholder (85) to match prior mock behaviour — a server-side
    // weighted composite will replace it in a follow-up.
    submitReadiness.mutate(
      {
        sleep_quality: payload.Sonno,
        stress_level: payload.Stress,
        fatigue_score: payload.Fatica,
        mood: payload.Umore,
        digestion: payload.Digestione,
        soreness_map: soreness,
        // Three-way pain answer: null = unanswered (never forged to false).
        // Independent from soreness by contract: zones never imply pain.
        has_pain: painAnswer,
        score: 85,
      },
      {
        onSuccess: () => {
          toast.success("Check-in salvato", {
            description: "Punteggio Prontezza aggiornato sulla dashboard.",
          });
          navigate("/athlete");
        },
      },
    );
  };

  // Selected muscles, in canonical order (to keep the intensity list stable
  // as the user toggles pills).
  const selectedMuscles = MUSCLE_GROUPS.filter(({ id }) => Boolean(soreness[id]));

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface font-sans antialiased pb-[120px]">
      {/* ---------------------------------------------------------------
         Top App Bar — sticky, glass, close button left, title centered
         --------------------------------------------------------------- */}
      <header
        className={cn(
          "sticky top-0 z-40",
          "backdrop-blur-xl bg-white/85",
          "border-b border-[#c0c7d0]/40",
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Chiudi check-in e torna alla dashboard"
            className={cn(
              "h-10 w-10 -ml-2 rounded-full",
              "flex items-center justify-center",
              "text-brand-container",
              "transition-colors hover:bg-surface-container/60",
              "active:scale-95",
            )}
          >
            <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </button>
          <h1 className="font-display text-lg font-bold tracking-tight text-on-surface">
            Prontezza Mattutina
          </h1>
          {/* Right spacer to keep the title visually centered */}
          <div className="w-10 shrink-0" aria-hidden="true" />
        </div>
      </header>

      {/* ---------------------------------------------------------------
         Main scrollable canvas — two cards.
         pb-[120px] on the wrapper above clears the fixed bottom bar.
         --------------------------------------------------------------- */}
      <main className="px-5 py-6 flex flex-col gap-6 max-w-md mx-auto">
        {/* -------- Core Biofeedback card -------------------------- */}
        <section
          aria-label="Biofeedback principale"
          className={cn(
            "rounded-3xl p-6",
            "bg-white",
            "border border-surface-container/60",
            "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
            "flex flex-col gap-5",
          )}
        >
          {BIOFEEDBACK_METRICS.map(({ id, label }) => (
            <ScoreScaleRow
              key={id}
              label={label}
              value={biofeedback[id] ?? null}
              onChange={setMetric(id)}
            />
          ))}
        </section>

        {/* -------- Pain question card ----------------------------- */}
        {/* Own card, BEFORE soreness: pain is the opening question, zones
            are the detail. Distinct signals by contract — selecting a zone
            never turns has_pain on, and vice versa. */}
        <section
          aria-label="Dolore"
          className={cn(
            "rounded-3xl p-6",
            "bg-white",
            "border border-surface-container/60",
            "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
          )}
        >
          <h2
            id="pain-question-label"
            className="font-display text-2xl font-semibold tracking-tight text-on-surface mb-1"
          >
            Hai dolore oggi?
          </h2>
          <p id="pain-question-help" className="font-sans text-xs text-on-surface-variant mb-4">
            Un dolore diverso dal normale indolenzimento dopo l'allenamento.
          </p>
          <div
            role="radiogroup"
            aria-labelledby="pain-question-label"
            aria-describedby="pain-question-help"
            className="flex gap-2"
          >
            {PAIN_OPTIONS.map(({ value, label }) => {
              const isActive = hasPain === value;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={answerPain(value)}
                  className={cn(
                    "flex-1 py-3 rounded-full",
                    "font-sans text-sm font-semibold tracking-wide",
                    "transition-all duration-150 active:scale-95",
                    isActive
                      ? "bg-brand-container text-white shadow-md"
                      : "bg-surface text-on-surface-variant border border-surface-container hover:bg-surface-variant/40",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* -------- Muscle Soreness card --------------------------- */}
        <section
          aria-label="Indolenzimento muscolare"
          className={cn(
            "rounded-3xl p-6",
            "bg-white",
            "border border-surface-container/60",
            "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
          )}
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight text-on-surface mb-4">
            Indolenzimento
          </h2>

          <div
            role="group"
            aria-label="Seleziona i gruppi muscolari indolenziti"
            className="flex flex-wrap gap-2 mb-6"
          >
            {MUSCLE_GROUPS.map(({ id, label }) => (
              <MusclePill
                key={id}
                label={label}
                isSelected={Boolean(soreness[id])}
                onToggle={toggleMuscle(id)}
              />
            ))}
          </div>

          {/* Contextual intensity sub-menus — one per selected muscle.
              Renders nothing if no muscles are picked. */}
          {selectedMuscles.length > 0 && (
            <div className="flex flex-col gap-3">
              {selectedMuscles.map(({ id, label }) => (
                <IntensityControl
                  key={id}
                  muscleLabel={label}
                  value={soreness[id] ?? "moderate"}
                  onChange={setIntensity(id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ---------------------------------------------------------------
         Sticky bottom action bar — glassmorphic, holds the "Salva" CTA.
         Uses pb-safe via env() so on iPhones the button clears the
         home indicator without the layout doing math.
         --------------------------------------------------------------- */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 z-50",
          "backdrop-blur-2xl bg-white/90",
          "border-t border-[#c0c7d0]/40",
          "rounded-t-[32px]",
          "shadow-[0_-10px_40px_rgba(80,118,142,0.1)]",
          "pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]",
        )}
      >
        <div className="max-w-md mx-auto px-6">
          <button
            type="button"
            onClick={handleSave}
            // Fail-closed guard: Salva stays off until this mount has
            // CONFIRMED today's row with a server response — never on the
            // persisted cache alone. isFetchedAfterMount is false through
            // the pre-auth phase, while offline-paused and until the first
            // fetch on the real key settles; isError keeps it off when that
            // fetch failed (errors flip isFetchedAfterMount true); isPending
            // stops a double tap from firing twice.
            disabled={
              !todayReadiness.isFetchedAfterMount ||
              todayReadiness.isFetching ||
              todayReadiness.isError ||
              submitReadiness.isPending
            }
            className={cn(
              "w-full py-4 rounded-full",
              "disabled:opacity-50 disabled:pointer-events-none",
              "flex items-center justify-center gap-2",
              "bg-brand-container text-white",
              "font-display text-sm font-bold uppercase tracking-widest",
              "shadow-[0_8px_20px_rgba(34,111,163,0.3)]",
              "transition-transform duration-200 active:scale-[0.98]",
              "hover:brightness-110",
            )}
          >
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
