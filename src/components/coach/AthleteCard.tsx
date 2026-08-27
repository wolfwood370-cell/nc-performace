/**
 * src/components/coach/AthleteCard.tsx
 * ---------------------------------------------------------------------------
 * Aura Health System — Premium athlete summary card.
 *
 * Container shape (DESIGN.md):
 *   - rounded-3xl (32px), bg-surface-container-lowest, border-outline-variant/20
 *   - shadow-xl ambient + scale-on-hover lift
 *   - p-6 interior for the "ultra-rounded" airy feel
 *
 * Three visual states driven by live telemetry:
 *   A) Optimized      → emerald halo + readiness chip + weekly progress bar
 *   B) Critical       → destructive halo + pain context tags
 *   C) Pending        → muted halo + inline stepper on missing onboarding steps
 *   D) Standard       → fallback (no halo, basic compliance/program rows)
 *
 * Every state also renders the load lens row (LoadLine): the recent-vs-
 * habitual load ratio with its descriptive band, or the absence with its
 * reason — computed ONLY by src/lib/math/acwr.ts, never judged here.
 *
 * State derivation (priority order, top wins):
 *   1. Pending  — when `missingOnboardingSteps` is non-empty
 *   2. Critical — when pain markers exist (the load ratio is a descriptive
 *      lens, not a risk verdict: it never makes a card "Critico")
 *   3. Optimized — when readiness ≥ 80 AND adherence ≥ 80
 *   4. Standard — default
 *
 * All props beyond the originals are **optional**; existing consumers that
 * only pass the base set continue to render the Standard variant unchanged.
 *
 * onClick + routing (`navigate(`/coach/athlete/${id}`)`) and the original
 * data props (avatarUrl, lastCheckinDate, programName, isActive) are
 * preserved 1:1 — no fetch logic in this component.
 */
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  CheckCircle2,
  AlertTriangle,
  Heart,
  Clock,
  Dumbbell,
  TrendingUp,
  CircleAlert,
  ChevronRight,
  Activity,
} from "lucide-react";
import {
  ACWR_BAND_LABELS,
  ACWR_CAVEAT,
  acwrAbsenceText,
  type AcwrComputation,
} from "@/lib/math/acwr";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface AthleteCardProps {
  athleteId: string;
  athleteName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  /** Date of the athlete's latest readiness check-in — that is what the
   *  roster actually measures (workout logs do NOT feed this). The label
   *  in StandardBody says "Ultimo check-in" for the same reason. */
  lastCheckinDate: string | null;
  programName: string | null;
  /** Active in the last 3 days. Drives the status dot fallback for Standard. */
  isActive: boolean;

  // ── Optional telemetry (Aura state-driven UI) ──────────────────────────
  /** Readiness score 0–100. Feeds State A when ≥80. */
  readinessScore?: number;
  /** Weekly adherence 0–100. Powers the progress bar in State A. */
  weeklyAdherence?: number;
  /** The load lens from src/lib/math/acwr.ts — ratio + band, or the
   *  absence with its reason. Display-only: no thresholds in the card. */
  acwr?: AcwrComputation;
  /** Localized pain markers ("Spalla Sx", "Ginocchio Dx"). Triggers State B. */
  painMarkers?: string[];
  /** Missing onboarding steps ("PAR-Q", "Anamnesi"). Triggers State C. */
  missingOnboardingSteps?: string[];

  // ── Optional UX hooks ──────────────────────────────────────────────────
  /** Override the default navigate target. */
  onClick?: () => void;
}

type CardState = "optimized" | "critical" | "pending" | "standard";

function deriveState(p: AthleteCardProps): CardState {
  if (p.missingOnboardingSteps && p.missingOnboardingSteps.length > 0) return "pending";
  // Only declared pain makes a card critical: the load ratio is a lens of
  // awareness, not a risk verdict, so it never drives this state.
  if (p.painMarkers && p.painMarkers.length > 0) {
    return "critical";
  }
  if (
    typeof p.readinessScore === "number" &&
    p.readinessScore >= 80 &&
    typeof p.weeklyAdherence === "number" &&
    p.weeklyAdherence >= 80
  ) {
    return "optimized";
  }
  return "standard";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AthleteCard(props: AthleteCardProps) {
  const {
    athleteId,
    athleteName,
    avatarUrl,
    avatarInitials,
    lastCheckinDate,
    programName,
    isActive,
    readinessScore,
    weeklyAdherence,
    acwr,
    painMarkers,
    missingOnboardingSteps,
    onClick,
  } = props;
  const navigate = useNavigate();
  const state = deriveState(props);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    navigate(`/coach/athlete/${athleteId}`);
  };

  const getLastCheckinText = () => {
    if (!lastCheckinDate) return "Nessun check-in";
    try {
      return formatDistanceToNow(new Date(lastCheckinDate), { addSuffix: true, locale: it });
    } catch {
      return "Data sconosciuta";
    }
  };

  // ── Per-state visual contract ──────────────────────────────────────────
  const ringClass = {
    optimized: "ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-surface-container-lowest",
    critical: "ring-2 ring-destructive/80 ring-offset-2 ring-offset-surface-container-lowest",
    pending: "ring-2 ring-outline-variant/40 ring-offset-2 ring-offset-surface-container-lowest",
    standard: "ring-1 ring-outline-variant/30",
  }[state];

  const statusDotBg = {
    optimized: "bg-emerald-500",
    critical: "bg-destructive",
    pending: "bg-outline",
    standard: isActive ? "bg-success" : "bg-muted-foreground/50",
  }[state];

  return (
    <Card
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Apri profilo di ${athleteName}`}
      className={cn(
        // Layer hover/active behaviour on top of the Card primitive (which
        // already provides rounded-3xl + bg-surface-container-lowest +
        // ambient shadow + border-outline-variant/20).
        "group cursor-pointer transition-all duration-200 shadow-xl",
        "hover:shadow-[0_16px_48px_rgb(0,0,0,0.08)] hover:scale-[1.015]",
        "active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Subtle tinted background overlay per state (very low opacity to
        // keep the white surface DESIGN.md mandates as primary).
        state === "critical" && "bg-gradient-to-b from-destructive/[0.03] to-transparent",
        state === "optimized" && "bg-gradient-to-b from-emerald-500/[0.03] to-transparent",
      )}
    >
      {/* ── HEADER ── */}
      <div className="p-6 pb-4 flex items-start gap-4">
        {/* Avatar with state-driven halo */}
        <div className="relative flex-shrink-0">
          <Avatar className={cn("h-14 w-14", ringClass)}>
            <AvatarImage src={avatarUrl || undefined} alt={athleteName} />
            <AvatarFallback
              className={cn(
                "font-bold text-base",
                state === "pending"
                  ? "bg-surface-container-low text-on-surface-variant"
                  : "bg-primary-container/15 text-primary",
              )}
            >
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
          {/* Status dot */}
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface-container-lowest",
              statusDotBg,
            )}
            aria-hidden
          />
        </div>

        {/* Name + status label */}
        <div className="flex-1 min-w-0 pt-1">
          <h3 className="font-display text-label-md font-bold text-on-surface truncate group-hover:text-primary transition-colors">
            {athleteName}
          </h3>
          <StateBadge state={state} isActive={isActive} />
        </div>

        {/* Chevron — gentle affordance for "open detail" */}
        <ChevronRight
          className="h-5 w-5 text-on-surface-variant/40 mt-1 flex-shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
          aria-hidden
        />
      </div>

      {/* ── BODY (state-driven content) ── */}
      <div className="px-6 pb-6 space-y-3">
        {state === "optimized" && (
          <OptimizedBody
            readinessScore={readinessScore}
            weeklyAdherence={weeklyAdherence}
            programName={programName}
          />
        )}
        {state === "critical" && (
          <CriticalBody painMarkers={painMarkers} programName={programName} />
        )}
        {state === "pending" && <PendingBody missingSteps={missingOnboardingSteps ?? []} />}
        {state === "standard" && (
          <StandardBody lastCheckinText={getLastCheckinText()} programName={programName} />
        )}
        {/* Load lens — same outcome the athlete detail shows: the ratio
            with its band, or the absence with its reason. */}
        <LoadLine acwr={acwr} />
      </div>
    </Card>
  );
}

// ===========================================================================
// State badge — single pill at the top right of the name row
// ===========================================================================
function StateBadge({ state, isActive }: { state: CardState; isActive: boolean }) {
  const config: Record<CardState, { label: string; classes: string; icon: typeof CheckCircle2 }> = {
    optimized: {
      label: "Optimized",
      classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      icon: CheckCircle2,
    },
    critical: {
      label: "Critico",
      classes: "bg-destructive/10 text-destructive font-bold",
      icon: AlertTriangle,
    },
    pending: {
      label: "Onboarding",
      classes: "bg-outline-variant/30 text-on-surface-variant",
      icon: CircleAlert,
    },
    standard: {
      label: isActive ? "Attivo" : "Inattivo",
      classes: isActive
        ? "bg-success/10 text-success"
        : "bg-surface-container-low text-on-surface-variant",
      icon: isActive ? Activity : Clock,
    },
  };
  const c = config[state];
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 mt-1 text-3xs font-bold tracking-wide",
        c.classes,
      )}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ===========================================================================
// State A — Optimized
// ===========================================================================
function OptimizedBody({
  readinessScore,
  weeklyAdherence,
  programName,
}: {
  readinessScore: number | undefined;
  weeklyAdherence: number | undefined;
  programName: string | null;
}) {
  const adherence = Math.max(0, Math.min(100, weeklyAdherence ?? 0));

  return (
    <div className="space-y-4">
      {/* Readiness pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" />
          Readiness {readinessScore ?? "—"}%
        </span>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-3xs font-bold bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
          Zona ottimale
        </span>
      </div>

      {/* Weekly adherence progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-on-surface-variant font-medium">Aderenza settimanale</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {adherence}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${adherence}%` }}
          />
        </div>
      </div>

      {/* Program row */}
      {programName && (
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
            <Dumbbell className="h-3.5 w-3.5" />
            Programma
          </span>
          <span className="text-on-surface font-medium truncate max-w-[140px]">{programName}</span>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Load lens row — rendered in EVERY state
// ===========================================================================

/** The recent-vs-habitual load lens. Purely descriptive: the words come
 *  from the acwr module (single owner) — the ratio with its band and the
 *  caveat, or the absence with its reason and the real numbers. Neutral
 *  tokens on purpose: a description never wears alarm colours. */
function LoadLine({ acwr }: { acwr: AcwrComputation | undefined }) {
  if (!acwr) return null;
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
          <Activity className="h-3 w-3" />
          Carico recente vs abituale
        </span>
        {acwr.available === true && (
          <span className="inline-flex items-center rounded-full bg-surface-container-lowest/60 px-2.5 py-0.5 text-sm font-bold tabular-nums text-on-surface flex-shrink-0">
            {acwr.ratio.toFixed(2)}
          </span>
        )}
      </div>
      {acwr.available === true && (
        <>
          <p className="text-xs text-on-surface mt-1">{ACWR_BAND_LABELS[acwr.band]}</p>
          <p className="text-3xs text-on-surface-variant mt-0.5">{ACWR_CAVEAT}</p>
        </>
      )}
      {acwr.available === false && (
        <p className="text-xs text-on-surface-variant mt-1">{acwrAbsenceText(acwr)}</p>
      )}
    </div>
  );
}

// ===========================================================================
// State B — Critical
// ===========================================================================

function CriticalBody({
  painMarkers,
  programName,
}: {
  painMarkers: string[] | undefined;
  programName: string | null;
}) {
  return (
    <div className="space-y-3">
      {/* Localized pain markers */}
      {painMarkers && painMarkers.length > 0 && (
        <div>
          <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 inline-flex items-center gap-1">
            <Heart className="h-3 w-3" />
            Fastidi segnalati
          </p>
          <div className="flex flex-wrap gap-1.5">
            {painMarkers.map((m, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full bg-destructive/[0.08] border border-destructive/20 px-2.5 py-0.5 text-3xs font-bold text-destructive"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Program row */}
      {programName && (
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
            <Dumbbell className="h-3.5 w-3.5" />
            Programma
          </span>
          <span className="text-on-surface font-medium truncate max-w-[140px]">{programName}</span>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// State C — Pending Onboarding (inline stepper)
// ===========================================================================
function PendingBody({ missingSteps }: { missingSteps: string[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface-container-low border border-outline-variant/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <CircleAlert className="h-4 w-4 text-on-surface-variant" />
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Onboarding in corso
          </p>
        </div>
        <ol className="space-y-1.5" aria-label="Step di onboarding mancanti">
          {missingSteps.map((step, idx) => (
            <li key={step} className="flex items-center gap-2 text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-outline-variant/40 text-on-surface-variant font-bold text-3xs flex-shrink-0">
                {idx + 1}
              </span>
              <span className="text-on-surface font-medium">{step}:</span>
              <span className="text-on-surface-variant">Mancante</span>
            </li>
          ))}
        </ol>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <CircleAlert className="h-3.5 w-3.5" />
        Completa profilo
      </Button>
    </div>
  );
}

// ===========================================================================
// State D — Standard (fallback)
// ===========================================================================
function StandardBody({
  lastCheckinText,
  programName,
}: {
  lastCheckinText: string;
  programName: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
          <Clock className="h-3.5 w-3.5" />
          Ultimo check-in
        </span>
        <span className="text-on-surface font-medium tabular-nums">{lastCheckinText}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
          <Dumbbell className="h-3.5 w-3.5" />
          Programma
        </span>
        <span className="text-on-surface font-medium truncate max-w-[140px]">
          {programName || "Nessun programma"}
        </span>
      </div>
    </div>
  );
}
