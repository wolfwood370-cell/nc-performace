// =============================================================================
// src/pages/athlete/PostWorkoutDebrief.tsx
// =============================================================================
// Phase 9 — Post-Workout Debrief.
//
// Modal-style summary shown after a finished session. Captures:
//   - A celebratory hero (mock title + duration).
//   - Session stats (total volume, sets/sets, muscle chips).
//   - Session RPE: 1..10 horizontal scale; the selected number becomes
//     the focal pill (brand-filled, scale-110, shadow). The descriptive
//     text below updates from RPE_LABELS.
//   - Free-form coach notes textarea, bound to local state.
//   - Sticky bottom CTA "Salva e Torna alla Home".
//
// Mount: SIBLING of <AthleteLayout> at /athlete/post-workout — modal-style
// full-screen flow, the close button + the CTA both route back to
// /athlete/training. No Supabase wiring.
// =============================================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, MoreVertical, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";
import {
  useFinishSessionMutation,
  useSessionSetsQuery,
} from "@/hooks/athlete/useAthleteWorkoutHooks";

// =============================================================================
// Constants — mock workout stats + RPE label dictionary.
// =============================================================================
/**
 * Mock metadata for the just-finished session. The DERIVED stats —
 * total volume + total sets completed — are computed live from
 * `useAthleteWorkoutStore.loggedSets` inside SessionStatsCard, so this
 * struct only carries the static "what session was this" labels.
 */
const WORKOUT_SUMMARY = {
  title: "Lower Body Power",
  duration: "1h 15m",
  muscles: ["Quadricipiti", "Glutei", "Femorali", "Core"] as const,
};

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
type Rpe = (typeof RPE_VALUES)[number];

const RPE_LABELS: Record<Rpe, string> = {
  1: "Riposo · nessuno sforzo",
  2: "Molto leggero",
  3: "Leggero",
  4: "Comodo · attivo",
  5: "Medio · respirabile",
  6: "Impegnativo · respira più forte",
  7: "Difficile · 3 reps massimo in più",
  8: "Duro · 2 reps massimo in più",
  9: "Molto duro · 1 rep massimo in più",
  10: "Massimale · nessuna rep in tank",
};

// =============================================================================
// SessionStatsCard — live stats derived from the `exercise_logs` rows
// for the current session.
//
// `totalSetsCompleted` = number of rows in the session-sets query.
// `totalVolumeKg`     = Σ weight × reps across every set. This is the
//                       canonical "tonnage" stat coaches use to gauge
//                       cumulative work; rounded for display tidiness.
// =============================================================================
function SessionStatsCard() {
  const activeSessionId = useAthleteWorkoutStore((s) => s.activeSessionId);
  const sessionSets = useSessionSetsQuery(activeSessionId);
  const rows = sessionSets.data;
  const totalSetsCompleted = rows ? rows.length : 0;
  let totalVolumeKg = 0;
  if (rows) {
    for (const row of rows) {
      totalVolumeKg += row.weight * row.reps;
    }
    totalVolumeKg = Math.round(totalVolumeKg);
  }

  return (
    <section
      aria-label="Riepilogo sessione"
      className={cn(
        "rounded-3xl p-6",
        "bg-white border border-[#c0c7d0]/30",
        "shadow-[0_10px_40px_rgba(80,118,142,0.08)]",
      )}
    >
      <h3 className="font-sans text-[11px] font-semibold tracking-widest uppercase text-on-surface-variant mb-5 opacity-80">
        Riepilogo Sessione
      </h3>
      <div className="grid grid-cols-2 gap-y-5 gap-x-4 mb-6">
        <div>
          <p className="text-sm text-on-surface-variant mb-1">Volume Totale</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-on-surface">
            {totalVolumeKg.toLocaleString("it-IT")} kg
          </p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant mb-1">Serie Completate</p>
          <p
            aria-live="polite"
            className="font-display text-2xl font-semibold tabular-nums text-brand-container"
          >
            {totalSetsCompleted}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm text-on-surface-variant mb-3">Muscoli Allenati</p>
        <div className="flex flex-wrap gap-2">
          {WORKOUT_SUMMARY.muscles.map((m) => (
            <span
              key={m}
              className="bg-surface-container px-3 py-1.5 rounded-full font-sans text-[11px] font-semibold tracking-wide text-on-surface-variant"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// RpeSelector — horizontal 1..10 scale + active-state description.
// =============================================================================
function RpeSelector({ value, onChange }: { value: Rpe | null; onChange: (next: Rpe) => void }) {
  return (
    <section aria-label="Sforzo percepito della sessione">
      <div className="mb-4">
        <h3 className="font-display text-xl font-semibold text-on-surface mb-1">
          RPE della Sessione
        </h3>
        <p className="text-sm text-on-surface-variant">
          Quanto è stato impegnativo l'allenamento complessivo?
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Scala RPE da 1 a 10"
        className="flex flex-wrap justify-center gap-2 pb-1"
      >
        {RPE_VALUES.map((n) => {
          const isActive = value === n;
          return (
            <button
              key={n}
              role="radio"
              aria-checked={isActive}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center",
                "font-display font-semibold tabular-nums text-sm",
                "transition-all duration-200 active:scale-95",
                isActive
                  ? "bg-brand-container text-white shadow-[0_8px_18px_rgba(34,111,163,0.35)]"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-variant/60",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className={cn(
          "mt-4 text-center text-sm font-medium transition-colors",
          value === null ? "text-on-surface-variant/60 italic" : "text-brand-container",
        )}
      >
        {value === null ? (
          "Seleziona un valore"
        ) : (
          <>
            <span className="font-display text-base font-bold mr-1">{value}</span>—{" "}
            {RPE_LABELS[value]}
          </>
        )}
      </p>
    </section>
  );
}

// =============================================================================
// PostWorkoutDebrief — page composition.
// =============================================================================
export default function PostWorkoutDebrief() {
  const navigate = useNavigate();
  const stopSession = useAthleteWorkoutStore((s) => s.stopSession);
  const activeSessionId = useAthleteWorkoutStore((s) => s.activeSessionId);
  const elapsedTime = useAthleteWorkoutStore((s) => s.elapsedTime);
  const finishSession = useFinishSessionMutation();
  const [rpe, setRpe] = useState<Rpe | null>(null);
  const [notes, setNotes] = useState("");

  /**
   * Final submit handler — UPDATE the workout_logs row with end time /
   * duration / RPE / notes, then clear the local session and return to
   * the dashboard. Errors are surfaced via the mutation's toast.
   */
  const handleSave = () => {
    if (!activeSessionId) {
      // Defensive — should never happen if the user arrived via the
      // normal Termina-e-Salva flow, but guard against a deep-link
      // landing on this page without an active session.
      toast.error("Nessuna sessione attiva da salvare.");
      navigate("/athlete");
      return;
    }
    finishSession.mutate(
      {
        session_id: activeSessionId,
        duration_seconds: elapsedTime,
        rpe_global: rpe,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Debrief salvato", {
            description: "Il tuo coach riceverà le note appena disponibili.",
          });
          stopSession();
          navigate("/athlete");
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-white text-on-surface font-sans antialiased pb-32 flex flex-col">
      {/* Top bar */}
      <header
        className={cn(
          "fixed top-0 inset-x-0 z-40",
          "h-16 flex items-center justify-between px-4",
          "backdrop-blur-xl bg-white/85",
          "border-b border-[#c0c7d0]/30",
        )}
      >
        <button
          type="button"
          onClick={() => navigate("/athlete/training")}
          aria-label="Chiudi debrief"
          className="h-10 w-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container/60 transition-colors active:scale-95"
        >
          <X className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
        <h1 className="font-display text-lg font-bold tracking-tight text-on-surface">
          Riepilogo Sessione
        </h1>
        <button
          type="button"
          aria-label="Altre opzioni"
          className="h-10 w-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container/60 transition-colors active:scale-95"
        >
          <MoreVertical className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <main className="flex-1 pt-24 px-5 pb-6 max-w-md mx-auto w-full flex flex-col gap-8">
        {/* Celebration */}
        <section className="flex flex-col items-center text-center mt-2">
          <div
            aria-hidden="true"
            className="h-24 w-24 rounded-full bg-surface-container flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(34,111,163,0.15)]"
          >
            <CheckCircle2 className="h-12 w-12 fill-emerald-500 text-white" strokeWidth={2} />
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tight text-on-surface mb-1">
            Workout Completo
          </h2>
          <p className="text-base text-on-surface-variant">
            {WORKOUT_SUMMARY.title} · {WORKOUT_SUMMARY.duration}
          </p>
        </section>

        <SessionStatsCard />

        <RpeSelector value={rpe} onChange={setRpe} />

        {/* Notes */}
        <section>
          <label
            htmlFor="debrief-notes"
            className="block font-display text-lg font-semibold text-on-surface mb-3"
          >
            Note per il Coach (Opzionale)
          </label>
          <textarea
            id="debrief-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1500))}
            placeholder="Dolori, stanchezza, feedback…"
            rows={5}
            className={cn(
              "w-full p-4 rounded-2xl",
              "bg-surface-container border-none",
              "font-sans text-base text-on-surface",
              "placeholder:text-on-surface-variant/50",
              "focus:outline-none focus:ring-2 focus:ring-brand-container",
              "resize-none",
            )}
          />
        </section>
      </main>

      {/* Sticky CTA */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 z-40",
          "px-5 pt-10 pb-[max(env(safe-area-inset-bottom),1rem)]",
          "bg-gradient-to-t from-white via-white to-transparent",
        )}
      >
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={handleSave}
            className={cn(
              "w-full py-4 rounded-full",
              "flex items-center justify-center gap-2",
              "bg-brand-container text-white",
              "font-display text-base font-bold",
              "shadow-[0_8px_20px_rgba(0,86,133,0.3)]",
              "transition-all duration-200 active:scale-[0.98] hover:brightness-110",
            )}
          >
            Salva e Torna alla Home
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
