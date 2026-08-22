// =============================================================================
// src/pages/athlete/AthleteTraining.tsx
// =============================================================================
// Phase 5 of the new Athlete App — Training Hub.
//
// Synthesises the two reference HTML files (daily_training_hub_hybrid.html
// for the diary surface + workout_overview_hub_preview.html for the
// blueprint detail) into a single "Diario / Metriche" page.
//
// Surface:
//   - Page header (eyebrow + Manrope title).
//   - Diario / Metriche pill segmented control (useState toggle).
//   - Mon-Sun micro-calendar strip computed from today's date.
//   - Diario view:
//       1. Hero workout card (glass, left brand border, eyebrow badge,
//          meta with Clock + Zap lucide icons).
//       2. Glance card: today's readiness (mini ring + real score, or a
//          tappable "Da registrare" card into the daily check-in).
//       3. Workout blueprint: numbered phases ("Fase 1: ...") with the
//          dashed vertical guide line and a glass card per exercise.
//          Main-session exercises get a thin primary left-border + a
//          letter code prefix (A1, B1, ...).
//   - Metriche view: placeholder card noting that the dedicated
//     metrics surface is in progress.
//   - Sticky bottom "Inizia Sessione" CTA at bottom-24 — sits above the
//     global BottomNavBar (which lives in <AthleteLayout> and uses
//     bottom-0). pb-32 on the content wrapper guarantees the last
//     blueprint exercise is fully scrollable above the CTA.
//
// Mount: this page is a CHILD route of <AthleteLayout> (already wired in
// App.tsx as /athlete/training). The BottomNavBar from the layout
// remains visible — that's intentional, the tab IS Training.
//
// Data: the workout comes from the athlete's REAL program release
// (program_releases via useProgramRelease — RLS select-own). Weekday i shows
// program day i (Mon -> Giorno 1); beyond the program length the day is rest.
// Without a release the page derives its state: consent required / pending
// review / generate CTA (autonomous) or waiting-for-coach (coached). The edge
// function stays the authoritative gate; no clinical detail is shown (art. 9).
// =============================================================================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ChevronsUpDown,
  Dumbbell,
  Hourglass,
  Moon,
  MoreHorizontal,
  Play,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";
import { ConsentPromptDialog } from "@/components/athlete/ConsentPromptDialog";
import { useDailyReadinessQuery } from "@/hooks/athlete/useAthleteReadinessHooks";
import {
  useAthleteGateStatusQuery,
  useLatestReleaseQuery,
  useRecordConsentMutation,
  useRequestReleaseMutation,
} from "@/hooks/athlete/useProgramRelease";
import {
  formatReleaseSetLine,
  formatSessionRpeRange,
  localIsoDate,
  sessionForDate,
  sessionRpeRange,
} from "@/lib/program/releaseView";
import type { ReleaseDayView, ReleaseExerciseView } from "@/lib/program/releaseView";

// =============================================================================
// Date helpers — pure functions, kept here so they're co-located with
// the only consumer (the WeekStrip calendar).
// =============================================================================
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  const clone = new Date(d);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

/**
 * Returns < 0 for past, 0 for today, > 0 for future. Robust to timezone
 * because we drop the time component before comparing.
 */
function compareDays(a: Date, b: Date): number {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

// =============================================================================
// Domain types
// =============================================================================
type View = "diario" | "metriche";

interface WeekDay {
  label: string;
  date: number;
  /** Full Date for click handlers. */
  fullDate: Date;
  isToday: boolean;
  isSelected: boolean;
}

// =============================================================================
// useWeekDays — Mon-Sun strip derived from today (Italian day initials).
// Memoised on `selectedDate` so the "isSelected" flag updates as the
// user taps a different day without rebuilding the array on every tick.
// =============================================================================
function useWeekDays(selectedDate: Date): WeekDay[] {
  return useMemo(() => {
    const today = new Date();
    // Monday-anchored offset: getDay() returns 0=Sun..6=Sat. We want 0=Mon..6=Sun.
    const todayMondayIdx = (today.getDay() + 6) % 7;
    const initials = ["L", "M", "M", "G", "V", "S", "D"] as const;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - todayMondayIdx + i);
      return {
        label: initials[i],
        date: d.getDate(),
        fullDate: d,
        isToday: i === todayMondayIdx,
        isSelected: isSameDay(d, selectedDate),
      };
    });
  }, [selectedDate]);
}

// =============================================================================
// PageHeader — eyebrow + title (non-sticky to keep the canvas tall).
// =============================================================================
function PageHeader() {
  return (
    <header className="pt-2 pb-1">
      <span className="font-display text-xs font-semibold tracking-widest uppercase text-brand-container">
        Allenamento
      </span>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-on-surface">
        Allenamento odierno
      </h1>
    </header>
  );
}

// =============================================================================
// ViewSwitcher — pill segmented control between Diario & Metriche.
// =============================================================================
function ViewSwitcher({ view, onChange }: { view: View; onChange: (next: View) => void }) {
  const tabs: { id: View; label: string }[] = [
    { id: "diario", label: "Diario" },
    { id: "metriche", label: "Metriche" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Vista training"
      className="flex items-center gap-1 p-1 rounded-full bg-surface-variant/40 border border-[#c0c7d0]/30"
    >
      {tabs.map(({ id, label }) => {
        const isActive = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "flex-1 py-2 px-4 rounded-full",
              "font-display text-sm font-bold tracking-wide",
              "transition-all duration-200",
              isActive
                ? "bg-white text-on-surface shadow-[0_4px_12px_rgba(80,118,142,0.08)]"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// WeekStrip — 7-day Mon..Sun row, fully interactive. Tapping a day
// hoists the selection into the parent via `onSelectDate`. Today gets
// the filled brand pill; the actively-selected day (which may or may
// not be today) gets a brand ring so both signals stay readable.
// =============================================================================
function WeekStrip({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (next: Date) => void;
}) {
  const days = useWeekDays(selectedDate);
  return (
    <div
      role="group"
      aria-label="Settimana corrente"
      className="flex justify-between items-center py-2"
    >
      {days.map((d, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelectDate(d.fullDate)}
          aria-pressed={d.isSelected}
          aria-current={d.isToday ? "date" : undefined}
          className={cn(
            "flex flex-col items-center gap-1",
            "rounded-full p-1",
            "transition-transform active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-container/40",
          )}
        >
          <span
            className={cn(
              "font-sans text-[11px] font-semibold uppercase tracking-wider",
              d.isToday ? "text-brand-container" : "text-on-surface-variant",
            )}
          >
            {d.label}
          </span>
          <span
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              "font-display font-bold tabular-nums text-sm",
              d.isToday
                ? "bg-brand-container text-white shadow-[0_4px_14px_rgba(34,111,163,0.35)]"
                : "text-on-surface-variant",
              d.isSelected && !d.isToday && "ring-2 ring-brand-container/60",
            )}
          >
            {d.date}
          </span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// StateCard — shared empty/status surface for every non-workout state
// (rest day, consent required, pending review, coached waiting, generate CTA).
// No clinical detail ever renders here (art. 9): generic copy only.
// =============================================================================
function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-3xl p-8",
        "bg-white/70 backdrop-blur-xl border border-[#c0c7d0]/30",
        "flex flex-col items-center justify-center text-center gap-3",
        "min-h-[200px]",
      )}
    >
      <div className="h-12 w-12 rounded-full bg-brand-container/10 flex items-center justify-center">
        {icon}
      </div>
      <p className="font-display text-base font-semibold text-on-surface">{title}</p>
      <p className="text-sm text-on-surface-variant max-w-[280px]">{body}</p>
      {children}
    </section>
  );
}

const stateIconClass = "h-6 w-6 text-brand-container";

/** ai_processing is the only consent the athlete can self-serve in-app: the
 *  prompt is offered only when it is the SOLE missing one (intake-gate
 *  consents stay coach-mediated). Shared by the mirror card and the
 *  post-invoke consentRequired branch so the two paths cannot diverge. */
const isSelfServiceableMissing = (missing: readonly string[]) =>
  missing.length > 0 && missing.every((c) => c === "ai_processing");

/** Autonomous athlete, clean gate, no release yet: the generate CTA. */
function GenerateProgramCard({
  onGenerate,
  isPending,
}: {
  onGenerate: () => void;
  isPending: boolean;
}) {
  return (
    <StateCard
      icon={<Sparkles className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
      title="Il tuo programma ti aspetta"
      body="Genera la tua prima settimana di allenamento: il motore la costruisce dai dati del tuo intake."
    >
      <button
        type="button"
        onClick={onGenerate}
        disabled={isPending}
        className={cn(
          "mt-2 px-6 py-3 rounded-full",
          "bg-brand-container text-white",
          "font-display text-sm font-bold uppercase tracking-widest",
          "shadow-[0_10px_30px_rgba(34,111,163,0.35)]",
          "transition-all duration-200 active:scale-[0.98] hover:brightness-110",
          "disabled:opacity-60 disabled:pointer-events-none",
        )}
      >
        {isPending ? "Generazione in corso…" : "Genera il mio programma"}
      </button>
    </StateCard>
  );
}

// =============================================================================
// HeroWorkoutCard — glass card, left brand border, badge + title + meta.
// Fed by the release day: focus as title, exercise count + the PRESCRIBED
// RPE range as meta (a quotation of the sets, never a session-RPE estimate:
// that judgement is the athlete's, after the session).
// =============================================================================
function HeroWorkoutCard({ day }: { day: ReleaseDayView }) {
  const rpeRange = sessionRpeRange(day);
  return (
    <section
      aria-label="Allenamento principale di oggi"
      className={cn(
        "relative overflow-hidden",
        "rounded-3xl p-6",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "border-l-4 border-l-brand-container",
        "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-container/8 to-transparent"
      />
      <div className="relative z-10 flex flex-col gap-4">
        <span className="self-start font-sans text-[10px] font-semibold tracking-widest uppercase text-brand-container bg-brand-container/10 px-2 py-1 rounded-full">
          {day.dayName}
        </span>
        <h2 className="font-display text-xl font-semibold leading-tight text-on-surface">
          {day.focus}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <Dumbbell className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span className="font-sans text-xs font-semibold">{day.exercises.length} esercizi</span>
          </div>
          {rpeRange !== null && (
            <div className="flex items-center gap-1.5">
              <Zap className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span className="font-sans text-xs font-semibold">
                {formatSessionRpeRange(rpeRange)}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// GlanceCards — single full-width Prontezza card, honest in both states:
//   - check-in missing → tappable button into /athlete/daily-checkin;
//     the score slot shows "—" (absent value → dash, never an invented
//     number) under the "Da registrare" state label.
//   - check-in done → static, non-interactive card with the REAL score
//     only. No qualitative label: a score→label mapping is not a
//     validated method yet, and the mock analysis pages the card used
//     to open were removed.
// =============================================================================
function GlanceCards() {
  const navigate = useNavigate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const readinessToday = useDailyReadinessQuery(todayIso);
  const isReadinessCompletedToday = Boolean(readinessToday.data);
  const dailyScore = readinessToday.data?.score ?? null;

  const cardShell = cn(
    "w-full rounded-3xl p-5 text-left",
    "bg-white/70 backdrop-blur-xl",
    "border border-[#c0c7d0]/30",
    "flex flex-col justify-between gap-3 min-h-[144px]",
  );

  const header = (
    <div className="flex items-start justify-between">
      <span className="font-sans text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant">
        Prontezza
      </span>
      <MiniReadinessRing percent={dailyScore ?? 0} />
    </div>
  );

  if (!isReadinessCompletedToday) {
    return (
      <button
        type="button"
        onClick={() => navigate("/athlete/daily-checkin")}
        aria-label="Registra la prontezza di oggi"
        className={cn(
          cardShell,
          "transition-transform active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-container/40",
        )}
      >
        {header}
        <p className="font-display text-xl font-bold text-on-surface leading-none">Da registrare</p>
        <span className="self-start px-2 py-0.5 rounded-full bg-brand-container/10 text-brand-container font-sans text-[10px] font-bold tabular-nums">
          —
        </span>
      </button>
    );
  }

  return (
    <div className={cardShell}>
      {header}
      <p className="font-display text-xl font-bold tabular-nums text-on-surface leading-none">
        {dailyScore !== null ? `${dailyScore}%` : "—"}
      </p>
    </div>
  );
}

// =============================================================================
// MiniReadinessRing — tiny SVG ring used inside the glance card.
// =============================================================================
function MiniReadinessRing({ percent }: { percent: number }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - safe / 100);
  return (
    <svg width="24" height="24" viewBox="0 0 36 36" className="-rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#c5e7ff" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#226fa3"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

// =============================================================================
// PhaseHeader + ExerciseCard + WorkoutBlueprint
// =============================================================================
function PhaseHeader({ index, name }: { index: number; name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="h-7 w-7 rounded-full bg-surface-container flex items-center justify-center font-display text-xs font-bold text-on-surface tabular-nums"
      >
        {index}
      </span>
      <h3 className="font-display text-base font-semibold text-on-surface">
        Fase {index}: {name}
      </h3>
    </div>
  );
}

/**
 * Whole card is a button — tapping it navigates to the exercise preview
 * with the exercise payload passed via route state, so the preview page
 * can show the right protocol/numbers without re-fetching. The inner
 * MoreHorizontal action is downgraded to a non-interactive span to
 * avoid nested interactive elements.
 */
function ExerciseCard({
  exercise,
  emphasised,
  onSelect,
}: {
  exercise: ReleaseExerciseView;
  emphasised: boolean;
  onSelect: (ex: ReleaseExerciseView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(exercise)}
      aria-label={`Apri anteprima ${exercise.code ? exercise.code + ". " : ""}${exercise.name}`}
      className={cn(
        "relative overflow-hidden w-full text-left",
        "rounded-2xl p-4",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "transition-transform active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-container/40",
      )}
    >
      {emphasised && (
        <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-brand-container" />
      )}
      <div className={cn("flex items-start justify-between gap-3", emphasised && "pl-2")}>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-semibold text-on-surface leading-snug">
            {exercise.code && (
              <span className="text-brand-container font-bold mr-1.5">{exercise.code}.</span>
            )}
            {exercise.name}
          </p>
          <p className="mt-1 font-sans text-xs text-on-surface-variant">{exercise.scheme}</p>
          {/* v2 non-uniform sets: the compact line says only "N serie" — the
              per-set list carries the real prescription, one labelled entry
              per set. Null values render nothing (never a 0). */}
          {exercise.sets_detail && exercise.uniform === false && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {exercise.sets_detail.map((s) => (
                <li
                  key={s.set_number}
                  className="font-sans text-xs text-on-surface-variant tabular-nums"
                >
                  {formatReleaseSetLine(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span
          aria-hidden="true"
          className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-on-surface-variant/70"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
    </button>
  );
}

/**
 * Release days carry a single main-session phase (the functional warm-up is
 * the coach's/rationale's note, not structured data — see buildRationale).
 */
function WorkoutBlueprint({
  day,
  onSelectExercise,
}: {
  day: ReleaseDayView;
  onSelectExercise: (ex: ReleaseExerciseView) => void;
}) {
  return (
    <section aria-label="Struttura allenamento" className="flex flex-col gap-5">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-lg font-bold text-on-surface">Fasi dell'Allenamento</h2>
        <ChevronsUpDown
          className="h-4 w-4 text-on-surface-variant"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-col gap-3">
        <PhaseHeader index={1} name="Main Session" />
        {/* Indented vertical guide rail */}
        <div className="flex flex-col gap-2 pl-4 ml-3 border-l-2 border-surface-container">
          {day.exercises.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} emphasised onSelect={onSelectExercise} />
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// MetricheView — placeholder for the secondary tab.
// =============================================================================
function MetricheView() {
  return (
    <section
      aria-label="Metriche training — in arrivo"
      className={cn(
        "rounded-3xl p-8",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "flex flex-col items-center justify-center text-center gap-3",
        "min-h-[240px]",
      )}
    >
      <div className="h-12 w-12 rounded-full bg-brand-container/10 flex items-center justify-center">
        <Activity className="h-6 w-6 text-brand-container" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="font-display text-base font-semibold text-on-surface">
        Le tue metriche in arrivo
      </p>
      <p className="text-sm text-on-surface-variant max-w-[280px]">
        Volume, intensità e progressione settimanale saranno qui dopo le prime sessioni completate.
      </p>
    </section>
  );
}

// =============================================================================
// StickyStartCTA — fixed bar that floats above the global BottomNavBar.
// Position: bottom-24 (96px) clears the nav (which is ~80px tall at bottom-0)
// with a 16px breathing gap. z-40 sits below the nav (z-50) so the nav is
// always the topmost interactive layer.
// =============================================================================
function StickyStartCTA({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed bottom-24 inset-x-0 z-40 px-5 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        <button
          type="button"
          onClick={onStart}
          className={cn(
            "w-full py-4 rounded-full",
            "flex items-center justify-center gap-2",
            "bg-brand-container text-white",
            "backdrop-blur-xl",
            "font-display text-sm font-bold uppercase tracking-widest",
            "shadow-[0_10px_30px_rgba(34,111,163,0.35)]",
            "transition-all duration-200 active:scale-[0.98]",
            "hover:brightness-110",
          )}
        >
          <Play className="h-5 w-5 fill-white" strokeWidth={0} aria-hidden="true" />
          Inizia Sessione
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// DiarioView — the release-driven diary content (extracted so all hooks stay
// unconditional at the top of the page component — hook-order law).
// =============================================================================
function DiarioView({
  selectedDate,
  isToday,
  onSelectExercise,
  onStartSession,
}: {
  selectedDate: Date;
  isToday: boolean;
  onSelectExercise: (ex: ReleaseExerciseView) => void;
  onStartSession: () => void;
}) {
  const releaseQuery = useLatestReleaseQuery();
  const gateQuery = useAthleteGateStatusQuery();
  const requestRelease = useRequestReleaseMutation();
  const recordConsent = useRecordConsentMutation();
  const [consentPromptOpen, setConsentPromptOpen] = useState(false);

  const handleGenerate = () => {
    requestRelease.mutate(undefined, {
      onSuccess: (res) => {
        if (res.ok) {
          toast.success("Programma generato", {
            description: "La tua prima settimana è pronta.",
          });
        } else if (res.consentRequired) {
          if (isSelfServiceableMissing(res.missing ?? [])) {
            // Self-serviceable: the in-app prompt collects the grant and
            // retries. The edge function stays the authoritative gate.
            setConsentPromptOpen(true);
          } else {
            toast.info("Consenso richiesto", {
              description:
                "Manca un consenso necessario al rilascio automatico. Contatta il tuo coach.",
            });
          }
        } else if (res.gate) {
          toast.info("Programma in attesa di revisione", {
            description: "Il tuo coach è stato avvisato: riceverai il programma dopo la revisione.",
          });
        } else if (res.alreadyActive) {
          toast.info("Hai già un programma attivo");
        } else if (res.paymentRequired) {
          // The one honest message of the silent barrier: the athlete asked for
          // something and deserves to know why it did not arrive. No upsell.
          toast.info("Abbonamento non attivo", {
            description:
              "Per generare il programma serve un abbonamento attivo. Lo trovi nel tuo profilo.",
          });
        } else {
          toast.error("Generazione non riuscita", { description: "Riprova più tardi." });
        }
      },
      onError: () => toast.error("Generazione non riuscita", { description: "Riprova più tardi." }),
    });
  };

  /** Grant intent from the prompt: record server-side, then retry the release. */
  const handleConsentConfirm = () => {
    recordConsent.mutate(undefined, {
      onSuccess: () => {
        setConsentPromptOpen(false);
        handleGenerate();
      },
      onError: (err) => {
        // PGRST202 = the RPC does not exist yet (FE live before the
        // record_consent migration is applied): retrying can never help.
        const rpcMissing = (err as { code?: string })?.code === "PGRST202";
        toast.error("Consenso non registrato", {
          description: rpcMissing
            ? "La registrazione del consenso non è ancora attiva: riprova più tardi o contatta il tuo coach."
            : "Non sono riuscito a salvare il consenso. Riprova più tardi.",
        });
      },
    });
  };

  /** "Not now": no silent dead end — the card below keeps the path open. */
  const handleConsentCancel = () => {
    setConsentPromptOpen(false);
    toast.info("Consenso non concesso", {
      description:
        "Senza questo consenso il programma autonomo non può essere rilasciato. Puoi concederlo in qualsiasi momento da questa pagina.",
    });
  };

  const consentPrompt = (
    <ConsentPromptDialog
      open={consentPromptOpen}
      isPending={recordConsent.isPending || requestRelease.isPending}
      onConfirm={handleConsentConfirm}
      onCancel={handleConsentCancel}
    />
  );

  /** Every branch mounts the dialog: an open prompt must never go orphan
   *  (background refetch swapping the branch would hide it while the state
   *  stays true, resurfacing it later with no user action). */
  const withPrompt = (content: React.ReactNode) => (
    <>
      {content}
      {consentPrompt}
    </>
  );

  if (releaseQuery.isPending || gateQuery.isPending) {
    return withPrompt(
      <StateCard
        icon={<Hourglass className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title="Caricamento"
        body="Sto recuperando il tuo programma…"
      />,
    );
  }

  // A failed query must never masquerade as a real state (e.g. an autonomous
  // athlete with a released program shown as "waiting for the coach").
  if (releaseQuery.isError || gateQuery.isError) {
    return withPrompt(
      <StateCard
        icon={<TriangleAlert className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title="Errore di caricamento"
        body="Non riesco a recuperare il tuo programma. Controlla la connessione e riprova."
      >
        <button
          type="button"
          onClick={() => {
            void releaseQuery.refetch();
            void gateQuery.refetch();
          }}
          className={cn(
            "mt-2 px-6 py-3 rounded-full",
            "bg-brand-container text-white",
            "font-display text-sm font-bold uppercase tracking-widest",
            "transition-all duration-200 active:scale-[0.98] hover:brightness-110",
          )}
        >
          Riprova
        </button>
      </StateCard>,
    );
  }

  const program = releaseQuery.data?.program ?? null;

  if (releaseQuery.data && program) {
    // ONE door for the day selection (v2 exact date / v1 weekday mapping),
    // shared with the home and the debrief — the caller only owns the clock.
    const sessionForDay = sessionForDate(program, localIsoDate(selectedDate));
    if (!sessionForDay) {
      return withPrompt(
        <>
          <StateCard
            icon={<Moon className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
            title="Giorno di riposo"
            body="Nessuna seduta in programma: recupero anche questo è allenamento."
          />
          <GlanceCards />
        </>,
      );
    }
    return withPrompt(
      <>
        <HeroWorkoutCard day={sessionForDay} />
        <GlanceCards />
        <WorkoutBlueprint day={sessionForDay} onSelectExercise={onSelectExercise} />
        {isToday && <StickyStartCTA onStart={onStartSession} />}
      </>,
    );
  }

  if (releaseQuery.data && !program) {
    // A release exists but its document doesn't parse: never render garbage.
    return withPrompt(
      <StateCard
        icon={<Hourglass className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title="Programma non disponibile"
        body="Il programma non è leggibile su questo dispositivo: contatta il tuo coach."
      />,
    );
  }

  const gate = gateQuery.data;
  if (gate?.coachingMode === "autonomous") {
    // Onboarding first: without the intake, "pending review" or "consent
    // required" would mislabel a simply-incomplete questionnaire.
    if (!gate.onboardingCompleted) {
      return withPrompt(
        <StateCard
          icon={<Hourglass className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
          title="Completa l'intake"
          body="Il tuo programma arriva dopo il questionario iniziale: completalo per iniziare."
        />,
      );
    }
    if (gate.missingConsents.length > 0) {
      const selfServiceable = isSelfServiceableMissing(gate.missingConsents);
      return withPrompt(
        <StateCard
          icon={<ShieldCheck className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
          title="Consenso richiesto"
          body={
            selfServiceable
              ? "Per generare il programma in autonomia serve il tuo consenso al trattamento automatizzato. Senza, il rilascio resta fermo: puoi concederlo qui sotto."
              : "Per il rilascio automatico del programma serve un consenso che non risulta ancora concesso. Contatta il tuo coach per completarlo."
          }
        >
          {selfServiceable && (
            <button
              type="button"
              onClick={() => setConsentPromptOpen(true)}
              className={cn(
                "mt-2 px-6 py-3 rounded-full",
                "bg-brand-container text-white",
                "font-display text-sm font-bold uppercase tracking-widest",
                "shadow-[0_10px_30px_rgba(34,111,163,0.35)]",
                "transition-all duration-200 active:scale-[0.98] hover:brightness-110",
              )}
            >
              Rivedi e acconsenti
            </button>
          )}
        </StateCard>,
      );
    }
    if (gate.pendingReview) {
      return withPrompt(
        <StateCard
          icon={<Hourglass className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
          title="Programma in attesa di revisione"
          body="Il tuo intake è in revisione: riceverai il programma appena approvato."
        />,
      );
    }
    // The authoritative gate can still ask for the consent even when the
    // mirror looks clean (post-invoke consentRequired) — the prompt is
    // mounted by withPrompt like everywhere else.
    return withPrompt(
      <GenerateProgramCard onGenerate={handleGenerate} isPending={requestRelease.isPending} />,
    );
  }

  return withPrompt(
    <StateCard
      icon={<UsersRound className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
      title="In attesa del coach"
      body="Il tuo coach sta preparando il tuo programma: lo troverai qui appena rilasciato."
    />,
  );
}

// =============================================================================
// AthleteTraining — page composition.
// =============================================================================
export default function AthleteTraining() {
  const [view, setView] = useState<View>("diario");
  // Calendar selection — defaults to today. We initialise lazily via a
  // function so the Date() ticking past midnight between hot-reloads
  // doesn't surface stale state.
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const navigate = useNavigate();
  // Pull only the action — we don't subscribe to state that we don't
  // read here, which keeps the page from re-rendering on every tick.
  const startSession = useAthleteWorkoutStore((s) => s.startSession);

  /** Booting handler for the bottom "Inizia Sessione" CTA.
   *  Stamps a fresh session in the store and jumps to the full-screen
   *  active workout overlay. */
  const handleStart = () => {
    startSession(crypto.randomUUID());
    navigate("/athlete/active-workout");
  };

  /** Per-exercise card tap → exercise preview. We pass the picked
   *  exercise via route state so the preview page can hydrate without
   *  re-fetching. The preview component will read it from
   *  `useLocation().state` once it is updated to consume real data. */
  const handleSelectExercise = (exercise: ReleaseExerciseView) => {
    // v2 additions are additive: sets_detail carries the per-set prescription;
    // restSeconds/tut are filled ONLY when uniform across sets (a single value
    // that is true for every set) — otherwise they stay absent, and the
    // preview renders its honest "—".
    const uniformFirst =
      exercise.uniform && exercise.sets_detail?.length ? exercise.sets_detail[0] : null;
    navigate("/athlete/exercise-preview", {
      state: {
        exercise: {
          id: exercise.id,
          code: exercise.code,
          name: exercise.name,
          scheme: exercise.scheme,
          type: "standard",
          sets: exercise.sets,
          reps: exercise.reps,
          rpe: exercise.rpe,
          sets_detail: exercise.sets_detail,
          restSeconds: uniformFirst ? uniformFirst.rest_seconds : undefined,
          tut: uniformFirst?.tempo ?? undefined,
        },
      },
    });
  };

  const today = new Date();
  const isToday = compareDays(selectedDate, today) === 0;

  return (
    <>
      {/* pb-32 reserves bottom space for the sticky CTA + global nav so the
          last blueprint exercise is reachable without overlap. */}
      <div className="flex flex-col gap-6 pb-32">
        <PageHeader />
        <ViewSwitcher view={view} onChange={setView} />
        <WeekStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        {view === "diario" ? (
          <DiarioView
            selectedDate={selectedDate}
            isToday={isToday}
            onSelectExercise={handleSelectExercise}
            onStartSession={handleStart}
          />
        ) : (
          <MetricheView />
        )}
      </div>
    </>
  );
}
