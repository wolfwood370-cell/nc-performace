// =============================================================================
// src/pages/athlete/ExercisePreview.tsx
// =============================================================================
// Single-exercise preview page. Two visual variants, driven by the
// `exercise: PreviewExercise` payload on the router location state:
//
//   - "standard" — title + variables grid + rest chip + locked logging table.
//   - "emom"     — block badge + numbered minute-window rows (reached from
//                  WorkoutPhaseDetail; scheduled for cleanup with that page).
//
// Every rendered value comes from the payload; missing values render as
// "—". There is NO default exercise: a direct deep-link / refresh lands
// on an empty route state and the page redirects to /athlete/training
// instead of showing an exercise the athlete never selected.
//
// Mount: SIBLING of <AthleteLayout> at /athlete/exercise-preview.
// Back affordance points to /athlete/training.
// =============================================================================

import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Lock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// Public contract — exported so AthleteTraining + WorkoutPhaseDetail can
// build a typed payload before calling navigate(..., { state: { exercise }}).
// =============================================================================
export type ExerciseType = "standard" | "emom";

export interface PreviewExercise {
  id: string;
  /** Programme code: "A1", "B2", "C1"... optional for warm-up moves. */
  code?: string;
  /** Display name, e.g. "Barbell Back Squat". */
  name: string;
  /** Drives which variant is rendered. */
  type: ExerciseType;
  /** Prescribed sets count. */
  sets?: number;
  /** Free-form reps prescription ("8", "6-8", "AMRAP", "60s"). */
  reps?: string;
  /** Prescribed load in kilograms. 0 = bodyweight; undefined = not specified. */
  weightKg?: number;
  /** Target RPE 1..10. */
  rpe?: number;
  /** Tempo Under Tension descriptor ("3-0-1-0", "controlled", ...). */
  tut?: string;
  /** Rest period between sets, in seconds. Drives the rest chip. */
  restSeconds?: number;
  /** Optional sub-line (phase or protocol descriptor). */
  meta?: string;
}

// =============================================================================
// TopBar — back + title. The trailing element is a spacer (same size as
// the back button) so the title stays centered without offering a
// control that does nothing.
// =============================================================================
function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-40",
        "h-16 flex items-center justify-between px-4",
        "backdrop-blur-xl bg-white/85",
        "border-b border-[#c0c7d0]/40",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Torna agli allenamenti"
        className="h-10 w-10 rounded-full flex items-center justify-center text-brand-container hover:bg-surface-container/60 transition-colors active:scale-95"
      >
        <ChevronLeft className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      </button>
      <h1 className="font-display text-lg font-bold tracking-tight text-on-surface">
        Anteprima Esercizio
      </h1>
      <span aria-hidden="true" className="h-10 w-10" />
    </header>
  );
}

// =============================================================================
// VariablesRow — compact 5-cell grid for the canonical training
// variables (Sets, Reps, Weight, TUT, RPE). Adapts from 2 columns on
// mobile to 3 on small+ viewports so labels never overflow.
// Unspecified values render as "—". The release parser (releaseView.ts)
// coerces missing sets/rpe to 0 and missing reps to "": those coerced
// values are treated as unspecified too — a "0" the coach never wrote
// must not be displayed as a prescription.
// =============================================================================
function VariablesRow({ exercise }: { exercise: PreviewExercise }) {
  const cells: { label: string; value: string }[] = [
    {
      label: "Sets",
      value: exercise.sets !== undefined && exercise.sets > 0 ? String(exercise.sets) : "—",
    },
    { label: "Reps", value: exercise.reps ? exercise.reps : "—" },
    {
      label: "Peso",
      value:
        exercise.weightKg === undefined
          ? "—"
          : exercise.weightKg > 0
            ? `${exercise.weightKg} kg`
            : "BW",
    },
    { label: "TUT", value: exercise.tut ?? "—" },
    {
      label: "RPE",
      value: exercise.rpe !== undefined && exercise.rpe > 0 ? String(exercise.rpe) : "—",
    },
  ];
  return (
    <section
      aria-label="Variabili dell'esercizio"
      className="grid grid-cols-2 sm:grid-cols-3 gap-2"
    >
      {cells.map(({ label, value }) => (
        <div
          key={label}
          className={cn(
            "rounded-2xl px-3 py-2",
            "bg-white/70 backdrop-blur-xl",
            "border border-[#c0c7d0]/30",
            "flex flex-col items-start",
          )}
        >
          <span className="font-sans text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant">
            {label}
          </span>
          <span className="font-display text-base font-bold text-on-surface tabular-nums">
            {value}
          </span>
        </div>
      ))}
    </section>
  );
}

// =============================================================================
// RestChip — static display of the prescribed rest period between sets.
// "—" plus an explicit aria-label when the payload carries no value.
// No countdown widget exists yet, so this is deliberately NOT a button:
// a control promising a timer would be a lie.
// =============================================================================
function RestChip({ seconds }: { seconds?: number }) {
  const display = seconds !== undefined ? `${seconds}s` : "—";
  return (
    <div
      aria-label={
        seconds !== undefined
          ? `Recupero previsto: ${seconds} secondi`
          : "Periodo di recupero non specificato"
      }
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 rounded-2xl",
        "px-4 py-3",
        "bg-brand-container/10 text-brand-container",
        "font-sans text-sm font-bold tracking-wide uppercase",
      )}
    >
      <Timer className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      Recupero · {display}
    </div>
  );
}

// =============================================================================
// VARIANT 1 — Standard / Locked
//   Title + variables grid + rest chip + lock banner + disabled logging
//   table. Every value comes from the prop; the table renders only when
//   a real set count exists.
// =============================================================================
function StandardVariant({ exercise }: { exercise: PreviewExercise }) {
  const fullName = exercise.code ? `${exercise.code}. ${exercise.name}` : exercise.name;
  // releaseView coerces missing reps to "": both count as unspecified.
  const repsTarget = exercise.reps ? exercise.reps : null;
  const setCount = exercise.sets !== undefined && exercise.sets > 0 ? exercise.sets : null;

  return (
    <>
      <h2 className="font-display text-2xl font-bold tracking-tight text-on-surface">{fullName}</h2>

      {/* 5-variable summary grid (Sets / Reps / Peso / TUT / RPE). */}
      <VariablesRow exercise={exercise} />

      {/* Prescribed rest period (static). */}
      <RestChip seconds={exercise.restSeconds} />

      {/* Preview / lock banner */}
      <div
        className={cn(
          "rounded-2xl p-4",
          "bg-surface-container/40 border border-[#c0c7d0]/30",
          "flex items-center gap-3",
        )}
      >
        <Lock className="h-5 w-5 text-on-surface-variant" strokeWidth={2} aria-hidden="true" />
        <p className="text-sm text-on-surface-variant">
          Modalità anteprima — la registrazione delle serie non è ancora disponibile.
        </p>
      </div>

      {/* Locked logging table — only when a real set count exists. */}
      {setCount !== null && (
        <section aria-label="Tabella set (anteprima, disabilitata)" className="flex flex-col gap-2">
          <div className="grid grid-cols-[28px_1fr_56px_56px] gap-2 px-2 pb-2 border-b border-[#c0c7d0]/25">
            {["SET", "TARGET", "KG", "REPS"].map((h) => (
              <span
                key={h}
                className="font-sans text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant text-center"
              >
                {h}
              </span>
            ))}
          </div>
          {Array.from({ length: setCount }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[28px_1fr_56px_56px] gap-2 items-center px-2 py-3 bg-white/60 rounded-2xl border border-transparent"
            >
              <span className="font-sans text-xs font-semibold tabular-nums text-on-surface-variant text-center">
                {i + 1}
              </span>
              <span className="text-sm text-on-surface-variant text-center">
                {repsTarget !== null ? `${repsTarget} reps` : "—"}
              </span>
              <div
                aria-disabled="true"
                className="bg-surface-container/40 rounded-lg p-2 text-center border border-dashed border-[#c0c7d0]/60"
              >
                <span className="text-sm text-on-surface-variant">–</span>
              </div>
              <div
                aria-disabled="true"
                className="bg-surface-container/40 rounded-lg p-2 text-center border border-dashed border-[#c0c7d0]/60"
              >
                <span className="text-sm text-on-surface-variant">–</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

// =============================================================================
// VARIANT 2 — EMOM
//   Block badge + numbered minute-windows. Block name + code from prop;
//   the minute-window rows are protocol-specific and stay internal.
// =============================================================================
function EmomVariant({ exercise }: { exercise: PreviewExercise }) {
  const fullName = exercise.code ? `${exercise.code}. ${exercise.name}` : exercise.name;
  // For EMOM the `reps` slot conventionally carries minutes — fall back
  // to "12'" when missing so the badge never reads "—'".
  const minutesLabel = exercise.reps ? `${exercise.reps}'` : "12'";

  const rows = [
    {
      id: "odd",
      label: "Minuti 1, 3, 5...",
      name: "15× Kettlebell Swings",
      hint: "Carico pesante. Il tempo rimanente è recupero.",
    },
    {
      id: "even",
      label: "Minuti 2, 4, 6...",
      name: "10× Burpees over the KB",
      hint: "Ritmo costante. Il tempo rimanente è recupero.",
    },
  ];

  return (
    <section
      className={cn(
        "rounded-3xl p-6",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
        "flex flex-col gap-6",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-sans text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant">
            {exercise.meta ?? "Blocco di Condizionamento"}
          </span>
          <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-on-surface">
            {fullName}
          </h2>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 bg-brand-container text-white text-xs font-bold tracking-wide px-3 py-1.5 rounded-full">
          <Timer className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          EMOM {minutesLabel}
        </span>
      </div>

      <p className="text-sm text-on-surface-variant max-w-prose">
        Lavoro metabolico alternato. Rispetta la finestra di lavoro del minuto.
      </p>

      <div className="rounded-2xl p-5 bg-surface-container/40 border border-[#c0c7d0]/20 flex flex-col gap-5">
        {rows.map((row, i) => (
          <div key={row.id}>
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <span className="shrink-0 inline-flex items-center bg-white text-on-surface text-xs font-semibold px-3 py-1.5 rounded-full border border-[#c0c7d0]/30">
                {row.label}
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-on-surface leading-tight">
                  {row.name}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">{row.hint}</p>
              </div>
            </div>
            {i < rows.length - 1 && (
              <div aria-hidden="true" className="mt-5 border-t border-dashed border-[#c0c7d0]/50" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// readExerciseFromLocationState — defensively type-narrows the unknown
// `location.state` blob into a PreviewExercise. Returns null when the
// state is missing or malformed: the page then redirects to
// /athlete/training instead of inventing an exercise the athlete never
// selected. Exported for the unit tests that pin this contract.
// =============================================================================
export function readExerciseFromLocationState(state: unknown): PreviewExercise | null {
  if (
    state &&
    typeof state === "object" &&
    "exercise" in state &&
    state.exercise &&
    typeof state.exercise === "object"
  ) {
    const candidate = state.exercise as Partial<PreviewExercise>;
    if (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      (candidate.type === "standard" || candidate.type === "emom")
    ) {
      return candidate as PreviewExercise;
    }
  }
  return null;
}

// =============================================================================
// ExercisePreview — page composition. Reads `exercise` off the router
// location state (set by AthleteTraining / WorkoutPhaseDetail before
// navigate) and renders EXACTLY ONE variant based on `exercise.type`.
// Missing / malformed state → redirect, never a made-up exercise.
// =============================================================================
export default function ExercisePreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const exercise = readExerciseFromLocationState(location.state);

  // No hooks below this point, so the early return is hook-order safe.
  if (!exercise) {
    return <Navigate to="/athlete/training" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface font-sans antialiased pb-16">
      <TopBar onBack={() => navigate("/athlete/training")} />

      <main className="pt-20 px-5 max-w-lg mx-auto flex flex-col gap-6">
        {/* Conditional rendering on the exercise type — only ONE variant
            renders at a time, driven by the data the caller passed in. */}
        {exercise.type === "standard" && <StandardVariant exercise={exercise} />}
        {exercise.type === "emom" && <EmomVariant exercise={exercise} />}
      </main>
    </div>
  );
}
