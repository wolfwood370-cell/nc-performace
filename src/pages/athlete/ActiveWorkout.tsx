// =============================================================================
// src/pages/athlete/ActiveWorkout.tsx
// =============================================================================
// The Active Workout Hub — a full-screen focus-mode overlay (z-50) that
// hides the global BottomNavBar.
//
// Composition:
//   - <GlobalTimerHUD> — sticky top bar with X (opens the friction
//     modal) and the centered live MM:SS timer. The red dot pulses only
//     while a session actually exists and is running (isLive), never as
//     decoration.
//   - <EmptySessionNotice> — explicit empty state: this page has no real
//     source for the session's exercises yet (no route state, no release
//     query), and says so instead of rendering an invented workout.
//   - <SessionStartFailedNotice> — explicit failure state when the
//     workout_logs INSERT did not happen: nothing done here would be
//     saved, so the page says so and offers a retry.
//   - <BottomActionBar> — sticky glass strip with a 70/30 split:
//     Pause/Resume toggle (wider) + Termina (narrower, opens dialog).
//   - <ExitWorkoutDialog> — friction modal shown when the user taps X
//     or Termina. Resume closes; Finish navigates to the debrief,
//     Discard back to /athlete/training with a toast.
//
// What is real here: the persisted timer (Zustand store), the session
// lifecycle (useStartSessionMutation on mount — the hook resolves the
// athlete's identity inside mutationFn via supabase.auth.getSession(),
// so the INSERT never depends on render-time auth state; on failure the
// page shows the explicit error state with a retry), and the
// exit/debrief flows. The mock exercise list, per-set "coach
// prescription" targets, pre-completed warm-up phase and the hardcoded
// session progress bar have been removed: they return only when the
// release document is actually wired in.
//
// Timer: pure useEffect + setInterval, paused via local boolean.
// Cleanup on unmount via the effect's return.
//
// Mount: SIBLING of <AthleteLayout> at /athlete/active-workout. The wrapper
// uses `fixed inset-0 z-50` per brief, so even if it were nested under
// the layout the global nav would be obscured anyway — but mounting it
// outside the layout subtree is the architecturally honest choice for
// "stack-pushed full-screen flow" pages.
// =============================================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dumbbell, Pause, Play, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMMSS } from "@/lib/time/duration";
import { ExitWorkoutDialog } from "@/components/athlete/ExitWorkoutDialog";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";
import { useStartSessionMutation } from "@/hooks/athlete/useAthleteWorkoutHooks";

// =============================================================================
// GlobalTimerHUD — sticky top header with the live MM:SS timer. The
// trailing element is a spacer (same size as the X button) so the timer
// stays optically centered without offering a control that does nothing.
// =============================================================================
function GlobalTimerHUD({
  seconds,
  isLive,
  hasSession,
  onExit,
}: {
  seconds: number;
  /** True only while a session row exists and the timer is running —
   *  the red dot must never pulse over a session that was never started
   *  (nor over a paused one). */
  isLive: boolean;
  /** True once the workout_logs row exists (store has its id) — the
   *  eyebrow must not claim a running workout that was never started. */
  hasSession: boolean;
  onExit: () => void;
}) {
  return (
    <header
      className={cn(
        "shrink-0 z-30",
        "backdrop-blur-xl bg-white/90",
        "border-b border-[#c0c7d0]/30",
      )}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Apri il menu di uscita allenamento"
          className={cn(
            "h-10 w-10 rounded-full",
            "flex items-center justify-center text-on-surface",
            "transition-colors hover:bg-surface-container/60",
            "active:scale-95",
          )}
        >
          <X className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>

        <div className="flex flex-col items-center">
          <span className="font-sans text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant">
            {hasSession ? "Workout in corso" : "Workout non avviato"}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-full",
                isLive ? "bg-error animate-pulse" : "bg-on-surface-variant/40",
              )}
            />
            <span
              role="timer"
              aria-live="off"
              className="font-display text-2xl font-semibold tabular-nums tracking-tight text-brand-container"
            >
              {formatMMSS(seconds)}
            </span>
          </div>
        </div>

        <span aria-hidden="true" className="h-10 w-10" />
      </div>
    </header>
  );
}

// =============================================================================
// EmptySessionNotice — explicit empty state for the exercise area. The
// page cannot know which exercises belong to this session (nothing real
// reaches it), so it says exactly that and points to what does work.
// =============================================================================
function EmptySessionNotice() {
  return (
    <section
      aria-label="Esercizi non collegati"
      className={cn(
        "rounded-3xl p-6",
        "bg-white border border-[#c0c7d0]/30",
        "flex flex-col items-center text-center gap-3",
      )}
    >
      <span
        aria-hidden="true"
        className="h-12 w-12 rounded-full bg-surface-container/60 flex items-center justify-center text-on-surface-variant"
      >
        <Dumbbell className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="font-display text-base font-bold tracking-tight text-on-surface">
        Esercizi non collegati
      </h2>
      <p className="font-sans text-sm text-on-surface-variant max-w-prose">
        Questa schermata non è ancora collegata agli esercizi del tuo programma. Se hai un programma
        attivo, trovi il dettaglio della seduta nella scheda Allenamento. Qui puoi cronometrare la
        sessione e chiuderla quando hai finito.
      </p>
    </section>
  );
}

// =============================================================================
// SessionStartFailedNotice — explicit failure state: the workout_logs
// INSERT did not go through, so nothing done on this page would be
// saved. The specific cause lives in the mutation's error toast; this
// card states the consequence and offers the retry. It stays mounted
// through the retry itself (mutate() resets isError for the whole
// request) with the button disabled, so the page never flashes back to
// the healthy-looking empty state while nothing is saved yet.
// =============================================================================
function SessionStartFailedNotice({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <section
      aria-label="Sessione non avviata"
      className={cn(
        "rounded-3xl p-6",
        "bg-white border border-[#c0c7d0]/30",
        "flex flex-col items-center text-center gap-3",
      )}
    >
      <span
        aria-hidden="true"
        className="h-12 w-12 rounded-full bg-surface-container/60 flex items-center justify-center text-error"
      >
        <TriangleAlert className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="font-display text-base font-bold tracking-tight text-on-surface">
        Sessione non avviata
      </h2>
      <p className="font-sans text-sm text-on-surface-variant max-w-prose">
        Questo allenamento non verrebbe salvato. Riprova.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className={cn(
          "mt-1 px-6 py-3 rounded-full",
          "bg-on-surface text-white",
          "font-display text-sm font-bold tracking-wide",
          "transition-all duration-200 hover:brightness-110 active:scale-[0.98]",
          "disabled:opacity-60 disabled:pointer-events-none",
        )}
      >
        {isRetrying ? "Riavvio in corso…" : "Riprova"}
      </button>
    </section>
  );
}

// =============================================================================
// BottomActionBar — sticky glass strip with 70/30 split.
// =============================================================================
function BottomActionBar({
  isPaused,
  onTogglePause,
  onFinishRequest,
}: {
  isPaused: boolean;
  onTogglePause: () => void;
  onFinishRequest: () => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 z-30",
        "backdrop-blur-2xl bg-white/90",
        "border-t border-[#c0c7d0]/30",
        "px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]",
      )}
    >
      <div className="max-w-3xl mx-auto flex gap-3">
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={isPaused ? "Riprendi il timer" : "Metti in pausa il timer"}
          className={cn(
            "flex-[7] py-4 rounded-full",
            "flex items-center justify-center gap-2",
            "bg-surface-container text-on-surface",
            "font-display text-sm font-bold tracking-wide",
            "transition-colors hover:bg-surface-variant/60",
            "active:scale-[0.98] transition-transform duration-200",
          )}
        >
          {isPaused ? (
            <>
              <Play className="h-5 w-5 fill-on-surface" strokeWidth={0} aria-hidden="true" />
              Riprendi
            </>
          ) : (
            <>
              <Pause className="h-5 w-5 fill-on-surface" strokeWidth={0} aria-hidden="true" />
              Pausa
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onFinishRequest}
          className={cn(
            "flex-[3] py-4 rounded-full",
            "bg-on-surface text-white",
            "font-display text-sm font-bold tracking-wide",
            "shadow-[0_4px_14px_rgba(0,30,45,0.25)]",
            "transition-all duration-200",
            "hover:brightness-110 active:scale-[0.98]",
          )}
        >
          Termina
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// ActiveWorkout — page composition.
// =============================================================================
export default function ActiveWorkout() {
  const navigate = useNavigate();

  // -- Store integration ----------------------------------------------------
  // Live timer + active flag live in the persisted Zustand store, so a
  // mid-session refresh, accidental tab close, or a navigation away (e.g.
  // to /athlete/profile from the global nav while the workout is somehow
  // running in the background) doesn't lose the elapsed time.
  // We subscribe with individual selectors so a tick doesn't re-render any
  // component that doesn't read the seconds counter.
  const seconds = useAthleteWorkoutStore((s) => s.elapsedTime);
  const isSessionActive = useAthleteWorkoutStore((s) => s.isSessionActive);
  const stopSession = useAthleteWorkoutStore((s) => s.stopSession);
  const tick = useAthleteWorkoutStore((s) => s.tick);

  // Session start on mount. The hook resolves the athlete's identity
  // inside mutationFn (supabase.auth.getSession()), so the INSERT does
  // not depend on when any render-time auth state finishes populating.
  const startSessionMutation = useStartSessionMutation();

  // -- Local UI state -------------------------------------------------------
  // `isPaused` is page-local: pause halts the visible timer without ending
  // the session (the store stays `isSessionActive=true`). Dialog visibility
  // is also page-local. `hasStartFailed` is the page's memory of a failed
  // start: mutation.isError alone cannot drive the failure card because
  // mutate() resets it to false for the whole duration of a retry — the
  // card would flash back to the healthy empty state mid-retry.
  const [isPaused, setIsPaused] = useState(false);
  const [isExitOpen, setIsExitOpen] = useState(false);
  const [hasStartFailed, setHasStartFailed] = useState(false);

  // Start (or retry) the session. Discarding any leftover
  // `activeSessionId` FIRST means the id held in the store can only ever
  // belong to THIS session — never to one from a previous workout. On
  // failure the mutation throws: `hasStartFailed` keeps the explicit
  // failure notice up (through retries too) and the toast names the
  // cause; the store stays empty, so the timer never pretends a session
  // exists.
  const startSession = () => {
    // Re-entry guard: a second mutate() while one is in flight would fire
    // a second INSERT and re-subscribe the observer, silently dropping
    // the first call's onSuccess (TanStack v5) — an orphaned in_progress
    // row in DB with no id in the store.
    if (startSessionMutation.isPending) return;
    useAthleteWorkoutStore.getState().stopSession();
    startSessionMutation.mutate(
      {},
      {
        onSuccess: (row) => {
          setHasStartFailed(false);
          useAthleteWorkoutStore.getState().startSession(row.id);
        },
        onError: () => {
          setHasStartFailed(true);
        },
      },
    );
  };

  // Always start a fresh session on mount.
  useEffect(() => {
    startSession();
    // Mount-only: re-running would restart the session every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer — 1Hz tick into the store while session is active and not paused.
  // Cleanup is the entire point of this useEffect: setInterval lives only
  // as long as the component is mounted AND the session is running.
  useEffect(() => {
    if (isPaused || !isSessionActive) return undefined;
    const id = window.setInterval(() => {
      tick();
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPaused, isSessionActive, tick]);

  // -- Handlers -------------------------------------------------------------
  const openExitDialog = () => setIsExitOpen(true);
  const handleResume = () => setIsExitOpen(false);

  /** "Termina e Salva" → jump to the debrief so the athlete can rate
   *  RPE + log notes. The session id stays in the store; the debrief's
   *  finish mutation needs it to UPDATE the workout_logs row. The store
   *  is cleared by the debrief once the mutation completes. */
  const handleFinish = () => {
    setIsExitOpen(false);
    navigate("/athlete/post-workout");
  };

  /** "Annulla Workout" → discard intent: same store cleanup, but we drop
   *  the user back at the Training Hub rather than the debrief flow. */
  const handleDiscard = () => {
    setIsExitOpen(false);
    stopSession();
    toast("Allenamento annullato", {
      description: "I dati di questa sessione non sono stati salvati.",
    });
    navigate("/athlete/training");
  };

  return (
    <>
      {/* Full-screen overlay — sits above the global BottomNavBar (z-50).
          flex flex-col + sticky-ish header/footer via shrink-0 inside a
          flex parent gives a clean three-band layout where only <main>
          scrolls. */}
      <div
        role="region"
        aria-label="Schermata allenamento"
        className={cn(
          "fixed inset-0 z-50",
          "bg-surface text-on-surface font-sans antialiased",
          "flex flex-col",
        )}
      >
        <GlobalTimerHUD
          seconds={seconds}
          isLive={isSessionActive && !isPaused}
          hasSession={isSessionActive}
          onExit={openExitDialog}
        />

        <main className="flex-1 overflow-y-auto px-5 py-6 max-w-3xl mx-auto w-full flex flex-col gap-6">
          {hasStartFailed ? (
            <SessionStartFailedNotice
              onRetry={startSession}
              isRetrying={startSessionMutation.isPending}
            />
          ) : (
            <EmptySessionNotice />
          )}
        </main>

        <BottomActionBar
          isPaused={isPaused}
          onTogglePause={() => setIsPaused((p) => !p)}
          onFinishRequest={openExitDialog}
        />
      </div>

      {/* Friction modal — sits at z-[60] above the workout overlay. */}
      <ExitWorkoutDialog
        open={isExitOpen}
        timerSeconds={seconds}
        onResume={handleResume}
        onFinish={handleFinish}
        onDiscard={handleDiscard}
      />
    </>
  );
}
