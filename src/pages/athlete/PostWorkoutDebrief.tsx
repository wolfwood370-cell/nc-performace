// =============================================================================
// src/pages/athlete/PostWorkoutDebrief.tsx
// =============================================================================
// Phase 9 — Post-Workout Debrief.
//
// Modal-style summary shown after a finished session. Captures:
//   - A celebratory hero: the name of TODAY's released session (same
//     day-selection door as home and Training Hub — sessionForDate) plus
//     the REAL elapsed duration from the session timer. When today has no
//     released session, only the duration renders: no invented title.
//   - Session stats (total volume, total sets).
//   - Session RPE: 1..10 horizontal scale, no preselection — the scale
//     starts empty and a value exists only if the athlete declares it.
//     Values, anchors (with Foster's deliberate gaps at 6/8/9), the
//     definition and the timing advisory all come from the single home
//     src/lib/effort/sessionRpe.ts — no scale words live in this file.
//     The chosen value is written to workout_logs.srpe (the session
//     column, CR-10); rpe_global is NOT written anymore.
//   - Free-form coach notes textarea, bound to local state.
//   - Sticky bottom CTA "Salva e Torna alla Home".
//
// Mount: SIBLING of <AthleteLayout> at /athlete/post-workout — modal-style
// full-screen flow. The close button routes back to /athlete/training; the
// CTA saves the session (UPDATE on workout_logs via
// useFinishSessionMutation) and routes to /athlete.
// =============================================================================

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, MoreVertical, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDurationHuman } from "@/lib/time/duration";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";
import {
  useFinishSessionMutation,
  useSessionSetsQuery,
} from "@/hooks/athlete/useAthleteWorkoutHooks";
import { useLatestReleaseQuery } from "@/hooks/athlete/useProgramRelease";
import { localIsoDate, sessionForDate, sessionTitle } from "@/lib/program/releaseView";
import {
  SESSION_RPE_ANCHORS,
  SESSION_RPE_CLEAR_LABEL,
  SESSION_RPE_DEFINITION,
  SESSION_RPE_EMPTY_PROMPT,
  SESSION_RPE_QUESTION,
  SESSION_RPE_SECTION_LABEL,
  SESSION_RPE_SLIDER_LABEL,
  SESSION_RPE_TIMING,
  SESSION_RPE_TITLE,
  SESSION_RPE_UNANSWERED,
  type SessionRpe,
} from "@/lib/effort/sessionRpe";
import { SessionRpeGuide } from "@/components/athlete/SessionRpeGuide";

// =============================================================================
// SessionStatsCard — live stats derived from the `exercise_logs` rows
// for the current session.
//
// `rows === undefined` (query loading, or disabled with no session) is NOT
// a measured zero: it renders "—". A loaded empty array IS a real zero.
// "Serie Registrate", not "Completate": the query counts every logged row
// with no is_completed filter.
// `totalVolumeKg` = Σ weight × reps across every set — the canonical
// "tonnage" stat; rounded for display tidiness.
// =============================================================================
function SessionStatsCard() {
  const activeSessionId = useAthleteWorkoutStore((s) => s.activeSessionId);
  const sessionSets = useSessionSetsQuery(activeSessionId);
  const rows = sessionSets.data;
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
            {rows ? `${totalVolumeKg.toLocaleString("it-IT")} kg` : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant mb-1">Serie Registrate</p>
          <p
            aria-live="polite"
            className="font-display text-2xl font-semibold tabular-nums text-brand-container"
          >
            {rows ? rows.length : "—"}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Thumb diameter in px (h-9 w-9): ONE constant shared by the thumb's
 *  `left` calc and the pointer mapping, so they cannot diverge. */
const RPE_THUMB_PX = 36;

// =============================================================================
// RpeSelector — stepped 1..10 slider with NO resting thumb.
//
// A native <input type="range"> always has a thumb somewhere, and a thumb
// resting on a value IS a preselected answer (CORE §0.8) — so the control
// is custom: while value === null the track is empty (no thumb, no fill,
// no aria-valuenow) and the state reads "non risposto". The value is born
// only from a gesture:
//   - pointer: press/drag on the track (nearest integer step);
//   - keyboard: from empty, ANY arrow starts at 1 (the bottom of the
//     scale, then the athlete climbs); Home/End jump to 1/10;
//   - revocation: the "Rimuovi risposta" button, or Delete/Backspace on
//     the slider, returns to null.
// One word at a time: below the number only the chosen value's anchor.
// Colour: ONE hue (brand), light→dark with the value — more effort, never
// "worse". No severity tokens by design.
// =============================================================================
function RpeSelector({
  value,
  onChange,
}: {
  value: SessionRpe | null;
  onChange: (next: SessionRpe | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const valueFromPointer = (clientX: number): SessionRpe | null => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // The thumb's CENTRE travels the inset span [18px, width-18px] (see
    // the `left` calc below): the pointer must map on that SAME span, or
    // the value read under the finger differs from the value shown at the
    // edges on narrow screens (review finding, 25/08).
    const span = rect.width - RPE_THUMB_PX;
    if (span <= 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - RPE_THUMB_PX / 2) / span));
    return Math.min(10, Math.max(1, Math.round(1 + frac * 9))) as SessionRpe;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = valueFromPointer(e.clientX);
    if (next !== null) onChange(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const next = valueFromPointer(e.clientX);
    if (next !== null) onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: SessionRpe | null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value === null ? 1 : (Math.min(10, value + 1) as SessionRpe);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value === null ? 1 : (Math.max(1, value - 1) as SessionRpe);
        break;
      case "Home":
        next = 1;
        break;
      case "End":
        next = 10;
        break;
      case "Delete":
      case "Backspace":
        next = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(next);
  };

  // Thumb/fill geometry: 1 sits at the left edge, 10 at the right.
  const frazione = value === null ? 0 : (value - 1) / 9;
  // ONE hue, light→dark: the brand fill deepens with the value.
  const intensita = value === null ? 0 : 0.3 + 0.07 * value;

  return (
    <section aria-label={SESSION_RPE_SECTION_LABEL}>
      <div className="mb-4">
        <h3 className="font-display text-xl font-semibold text-on-surface mb-1">
          {SESSION_RPE_TITLE}
        </h3>
        <p className="text-sm text-on-surface-variant">{SESSION_RPE_QUESTION}</p>
        <p className="text-xs text-on-surface-variant mt-1">{SESSION_RPE_DEFINITION}</p>
        <p className="text-xs text-on-surface-variant/80 mt-1 italic">{SESSION_RPE_TIMING}</p>
        <div className="mt-2">
          <SessionRpeGuide />
        </div>
      </div>

      {/* The slider proper. aria-valuenow exists ONLY once a value does. */}
      <div className="px-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={SESSION_RPE_SLIDER_LABEL}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={value ?? undefined}
          aria-valuetext={
            value === null ? SESSION_RPE_UNANSWERED : `${value} — ${SESSION_RPE_ANCHORS[value]}`
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative h-11 rounded-full cursor-pointer select-none touch-none",
            "bg-surface-container",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-container focus-visible:ring-offset-2",
          )}
        >
          {value !== null && (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-full bg-brand-container transition-all duration-150"
                style={{ width: `max(${frazione * 100}%, 2.75rem)`, opacity: intensita }}
              />
              <div
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 h-9 w-9 rounded-full",
                  "bg-white border-2 border-brand-container",
                  "shadow-[0_4px_12px_rgba(34,111,163,0.35)]",
                  "flex items-center justify-center",
                  "font-display font-bold tabular-nums text-sm text-brand-container",
                  "transition-all duration-150",
                )}
                style={{ left: `calc(${frazione * 100}% - ${frazione * RPE_THUMB_PX}px)` }}
              >
                {value}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-between px-1 mt-1 text-3xs text-on-surface-variant/70 tabular-nums">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

      <p
        aria-live="polite"
        className={cn(
          "mt-4 text-center text-sm font-medium transition-colors",
          value === null ? "text-on-surface-variant/60 italic" : "text-brand-container",
        )}
      >
        {value === null ? (
          SESSION_RPE_EMPTY_PROMPT
        ) : (
          <>
            <span className="font-display text-lg font-bold mr-1">{value}</span>—{" "}
            {SESSION_RPE_ANCHORS[value]}
          </>
        )}
      </p>

      {value !== null && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-on-surface-variant underline underline-offset-2 hover:text-on-surface transition-colors active:scale-95"
          >
            {SESSION_RPE_CLEAR_LABEL}
          </button>
        </div>
      )}
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
  const startedAt = useAthleteWorkoutStore((s) => s.startedAt);
  const finishSession = useFinishSessionMutation();
  const [rpe, setRpe] = useState<SessionRpe | null>(null);
  const [notes, setNotes] = useState("");

  // The session's NAME is the released session of the day the workout
  // STARTED (store's startedAt) — not the clock at debrief time: a session
  // begun at 22:30 and closed past midnight still belongs to its own day.
  // Same day-selection door as home and Training Hub. No released session
  // for that day (or no readable release) -> no title, only the real
  // duration: a name nobody wrote is not a summary.
  const releaseQuery = useLatestReleaseQuery();
  const program = releaseQuery.data?.program ?? null;
  const sessionDay = localIsoDate(startedAt !== null ? new Date(startedAt) : new Date());
  const todaySession = program ? sessionForDate(program, sessionDay) : null;

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
        // Session rating → its own column (CR-10 of Foster). Untouched
        // scale = null: the athlete may close without declaring (CORE §0.8).
        srpe: rpe,
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
            {todaySession ? `${sessionTitle(todaySession)} · ` : ""}
            {formatDurationHuman(elapsedTime)}
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
