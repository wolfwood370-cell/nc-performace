/**
 * src/pages/coach/CoachHome.tsx
 * ---------------------------------------------------------------------------
 * Aura Command Center — Coach dashboard.
 *
 * Implements the Stitch design (`stitch_aura_coach_command_center.html`)
 * 1:1 in terms of layout, tone and shape language, while binding every
 * widget to the live data hooks already in the codebase.
 *
 * Bento grid (DESIGN.md fluid grid):
 *   grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6
 *
 * Widgets:
 *   1. Centrale Operativa (AI Copilot)  — full top, primary gradient
 *   2. Avvisi dal Sistema               — full width, coach_alerts list
 *   3. Atleti a Rischio / Triage        — md:col-span-2
 *   4. Attività Oggi (Pulse)            — md:col-span-1, SVG ring
 *   5. Ultimi Allenamenti Conclusi      — md:col-span-2 xl:col-span-2
 *   6. Azioni Rapide                    — md:col-span-1, pill buttons
 *
 * Two distinct alert sources sit on this page and must not be confused:
 *   - `urgentAlerts` (useCoachDashboardMetrics) — client-side triage
 *     heuristics computed from readiness/workouts/injuries.
 *   - `coach_alerts` (useCoachAlerts) — rows written server-side by the
 *     CORE §0 escalation channel. This page is where their text becomes
 *     readable; the sidebar badge counts the unread ones.
 *
 * Live data:
 *   - useCoachDashboardMetrics → urgentAlerts, feedbackItems, todaySchedule,
 *     businessMetrics, isLoading
 *   - useCoachAlerts → alerts, isLoading, isSuccess, isFetching,
 *     dataUpdatedAt, unreadCount, markAsRead
 *   - useAuth → user, profile, auth loading
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { CoachLayout } from "@/components/coach/CoachLayout";
import { MetaHead } from "@/components/MetaHead";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InviteAthleteDialog } from "@/components/coach/InviteAthleteDialog";
import { CoachAlertsPanel } from "@/components/coach/CoachAlertsPanel";

import { useAuth } from "@/hooks/useAuth";
import { useCoachDashboardMetrics, type UrgentAlert } from "@/hooks/useCoachDashboardMetrics";
import { useCoachAlerts } from "@/hooks/useCoachAlerts";

import {
  Bot,
  AlertTriangle,
  Activity,
  CheckSquare,
  ShieldAlert,
  Dumbbell,
  Timer,
  ChevronRight,
  UserPlus,
  FileText,
  Megaphone,
  ListFilter,
} from "lucide-react";
import {
  ALL_CLEAR_MESSAGE,
  CHANNEL_CHECKING_MESSAGE,
  CHANNEL_MUTE_MESSAGE,
  composeTriageBullets,
  unreadAlertsSummary,
  type TriageBullet,
} from "@/lib/coachAlerts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Aura bento card — Stitch reference style
//   rounded-[32px] · bg-surface-container-lowest · outline-variant/10 border
//   wide ambient shadow · p-6 (md:p-8) · hover lifts the shadow
// ---------------------------------------------------------------------------
const bentoCard =
  "rounded-[32px] bg-surface-container-lowest border border-outline-variant/10 shadow-[0_12px_40px_rgb(0,0,0,0.03)] hover:shadow-[0_16px_48px_rgb(0,0,0,0.05)] transition-shadow p-6 md:p-8";

// ---------------------------------------------------------------------------
// Triage severity → Stitch status pill mapping
// ---------------------------------------------------------------------------
function severityPill(severity: UrgentAlert["severity"]): {
  bg: string;
  text: string;
  dot: string;
  label: string;
} {
  switch (severity) {
    case "critical":
      return {
        bg: "bg-error-container",
        text: "text-on-error-container",
        dot: "bg-destructive",
        label: "Critico",
      };
    case "warning":
      return {
        bg: "bg-tertiary-container/10",
        text: "text-tertiary-container",
        dot: "bg-tertiary-container",
        label: "Attenzione",
      };
    default:
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        dot: "bg-yellow-500",
        label: "Monitorare",
      };
  }
}

// RPE → Stitch RPE pill (1-3 facile, 4-6 mod, 7-10 forte)
function rpePill(rpe: number | null | undefined): {
  bg: string;
  text: string;
  dot: string;
  label: string;
} | null {
  if (rpe == null) return null;
  if (rpe >= 7) {
    return {
      bg: "bg-destructive/10",
      text: "text-destructive",
      dot: "bg-destructive",
      label: `RPE ${rpe} — Forte`,
    };
  }
  if (rpe >= 4) {
    return {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      dot: "bg-yellow-500",
      label: `RPE ${rpe} — Mod`,
    };
  }
  return {
    bg: "bg-green-100",
    text: "text-green-800",
    dot: "bg-green-500",
    label: `RPE ${rpe} — Facile`,
  };
}

// ---------------------------------------------------------------------------
// Triage bullet kind → Centrale Operativa presentation. Pure lookup: WHICH
// bullets exist, in which order, and who survives the cap is decided by
// `composeTriageBullets` (src/lib/coachAlerts.ts), where it is unit-tested.
// ---------------------------------------------------------------------------
function bulletPresentation(bullet: TriageBullet): {
  icon: typeof AlertTriangle;
  iconWrap: string;
  iconColor: string;
  text: React.ReactNode;
} {
  switch (bullet.kind) {
    case "unread":
      return {
        icon: AlertTriangle,
        iconWrap: "bg-white/20",
        iconColor: "text-white",
        text: <>{unreadAlertsSummary(bullet.count)}</>,
      };
    case "critical":
      return {
        icon: AlertTriangle,
        iconWrap: "bg-destructive/20",
        iconColor: "text-error-container",
        text: (
          <>
            <strong>{bullet.athleteName}</strong>: {bullet.description}.
          </>
        ),
      };
    case "warning":
      return {
        icon: Activity,
        iconWrap: "bg-tertiary-fixed/20",
        iconColor: "text-tertiary-fixed",
        text: (
          <>
            <strong>{bullet.athleteName}</strong>: {bullet.description}.
          </>
        ),
      };
    case "feedback":
      return {
        icon: CheckSquare,
        iconWrap: "bg-white/20",
        iconColor: "text-white",
        text: (
          <>
            Hai <strong>{bullet.count} check-in</strong> in attesa di revisione.
          </>
        ),
      };
    case "all-clear":
      return {
        icon: CheckSquare,
        iconWrap: "bg-white/20",
        iconColor: "text-white",
        text: <>{ALL_CLEAR_MESSAGE}</>,
      };
    case "channel-checking":
      return {
        icon: AlertTriangle,
        iconWrap: "bg-white/20",
        iconColor: "text-white",
        text: <>{CHANNEL_CHECKING_MESSAGE}</>,
      };
    case "channel-mute":
      return {
        icon: AlertTriangle,
        iconWrap: "bg-white/20",
        iconColor: "text-white",
        text: <>{CHANNEL_MUTE_MESSAGE}</>,
      };
  }
}

// "Recent" icon rotation — adds visual variety to the activity feed
// without needing per-workout type metadata in the underlying hook.
const FEED_ICONS = [Dumbbell, Timer, Activity];

// ===========================================================================
// Page
// ===========================================================================
export default function CoachHome() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { urgentAlerts, feedbackItems, todaySchedule, businessMetrics, isLoading } =
    useCoachDashboardMetrics();
  const {
    alerts: systemAlerts,
    isLoading: alertsLoading,
    isSuccess: alertsAnswered,
    isFetching: alertsFetching,
    dataUpdatedAt: alertsAnsweredAt,
    unreadCount,
    markAsRead,
  } = useCoachAlerts();

  const firstName = profile?.full_name?.split(" ")[0] ?? "Coach";
  const hasAthletes = businessMetrics.activeClients > 0;

  // The mutation has no onError of its own, and `networkMode: 'offlineFirst'`
  // lets it fire while offline: without this the button would look inert and
  // the badge would silently stay put. Failing closed means saying so.
  const handleMarkRead = (alertId: string) => {
    markAsRead.mutate(alertId, {
      onError: () => toast.error("Non è stato possibile segnare l'avviso come letto. Riprova."),
    });
  };

  // Triage: critical + warning, top 5 for layout calmness.
  const triageAlerts = useMemo(
    () =>
      urgentAlerts.filter((a) => a.severity === "critical" || a.severity === "warning").slice(0, 5),
    [urgentAlerts],
  );

  // Pulse: completed/scheduled today
  const completedToday = feedbackItems.length;
  const scheduledToday = todaySchedule.length;
  const totalToday = Math.max(scheduledToday, completedToday);
  const pulseFrac = totalToday > 0 ? Math.min(1, completedToday / totalToday) : 0;
  const pulseInProgress = Math.max(0, Math.min(scheduledToday - completedToday, scheduledToday));
  const pulseToStart = Math.max(0, scheduledToday - pulseInProgress - completedToday);

  // AI Copilot bullets — derived from live data, max 3 lines so the widget
  // visually matches the Stitch reference (which shows 3 bullets). The
  // composition (which bullets, in which order, who survives the cap) lives
  // in `composeTriageBullets`, pure and unit-tested; only the impure inputs
  // (`Date.now()`, `details || value`) and the JSX mapping stay here.
  const aiBullets = useMemo(
    () =>
      composeTriageBullets({
        triage: triageAlerts.map((a) => ({
          severity: a.severity,
          athleteName: a.athleteName,
          description: a.details || a.value,
        })),
        feedbackCount: feedbackItems.length,
        unreadSystemAlerts: unreadCount,
        channelAnswered: alertsAnswered,
        channelFetching: alertsFetching,
        answeredAgoMs: alertsAnsweredAt > 0 ? Date.now() - alertsAnsweredAt : Infinity,
      }).map(bulletPresentation),
    [
      triageAlerts,
      feedbackItems.length,
      unreadCount,
      alertsFetching,
      alertsAnswered,
      alertsAnsweredAt,
    ],
  );

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <CoachLayout title="Aura Command Center" subtitle="Caricamento...">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
          <Skeleton className="md:col-span-3 xl:col-span-4 h-56 rounded-[32px]" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80 rounded-[32px]" />
          ))}
        </div>
      </CoachLayout>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!isLoading && !hasAthletes) {
    return (
      <>
        <MetaHead title="Aura Command Center" description="Dashboard del coach." />
        <CoachLayout title="Aura Command Center" subtitle="Inizia con il tuo primo atleta">
          {/* An empty roster does not mean an empty inbox: alerts about an
              athlete with no coach are routed to SAFETY_NET_COACH_ID
              (release-autonomous-program/index.ts:70), whose roster is empty
              by construction. Without this the sidebar badge would count
              alerts whose text the coach cannot reach anywhere. */}
          {systemAlerts.length > 0 && (
            <CoachAlertsPanel
              className={cn(bentoCard, "max-w-2xl mx-auto mb-6")}
              alerts={systemAlerts}
              isLoading={alertsLoading}
              onMarkRead={handleMarkRead}
              onOpenAthlete={(id) => navigate(`/coach/athlete/${id}`)}
            />
          )}
          <div className={cn(bentoCard, "max-w-2xl mx-auto text-center p-12")}>
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-container to-primary mb-6 ring-4 ring-primary/10">
              <UserPlus className="h-10 w-10 text-white" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-2xl font-bold text-on-surface mb-2 tracking-tight">
              Benvenuto, {firstName}!
            </h3>
            <p className="text-base text-on-surface-variant max-w-md mx-auto mb-6 leading-relaxed">
              Invita il tuo primo atleta per attivare il Command Center: triage automatico, pulse
              giornaliero e insight AI in tempo reale.
            </p>
            <InviteAthleteDialog
              trigger={
                <Button size="lg" className="gap-2">
                  <UserPlus className="h-5 w-5" />
                  Invita il primo atleta
                </Button>
              }
            />
          </div>
        </CoachLayout>
      </>
    );
  }

  // ── Bento grid ─────────────────────────────────────────────────────────
  return (
    <>
      <MetaHead title="Aura Command Center" description="Dashboard del coach." />
      <CoachLayout
        title="Aura Command Center"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: it })}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in">
          {/* ═══ 1. Centrale Operativa (AI Copilot) ═══ */}
          <CentraleOperativaWidget firstName={firstName} bullets={aiBullets} />

          {/* ═══ 2. Avvisi dal Sistema (coach_alerts) ═══ */}
          <CoachAlertsPanel
            className={cn(bentoCard, "md:col-span-3 xl:col-span-4")}
            alerts={systemAlerts}
            isLoading={alertsLoading}
            onMarkRead={handleMarkRead}
            onOpenAthlete={(id) => navigate(`/coach/athlete/${id}`)}
          />

          {/* ═══ 3. Atleti a Rischio / Triage ═══ */}
          <TriageWidget
            alerts={triageAlerts}
            isLoading={isLoading}
            onSelect={(id) => navigate(`/coach/athlete/${id}`)}
          />

          {/* ═══ 4. Attività Oggi (Pulse) ═══ */}
          <PulseWidget
            completed={completedToday}
            total={totalToday}
            fraction={pulseFrac}
            inProgress={pulseInProgress}
            toStart={pulseToStart}
            isLoading={isLoading}
          />

          {/* ═══ 5. Ultimi Allenamenti Conclusi ═══ */}
          <RecentFeedWidget
            items={feedbackItems}
            isLoading={isLoading}
            onReview={(id) => navigate(`/coach/athlete/${id}`)}
          />

          {/* ═══ 6. Azioni Rapide ═══ */}
          <QuickActionsWidget onNavigate={navigate} />
        </div>
      </CoachLayout>
    </>
  );
}

// ===========================================================================
// 1. Centrale Operativa — AI Copilot hero (full top)
// ===========================================================================
function CentraleOperativaWidget({
  firstName,
  bullets,
}: {
  firstName: string;
  bullets: Array<{
    icon: typeof AlertTriangle;
    iconWrap: string;
    iconColor: string;
    text: React.ReactNode;
  }>;
}) {
  return (
    <div
      className={cn(
        "md:col-span-3 xl:col-span-4 rounded-[32px] p-6 md:p-8",
        "bg-gradient-to-br from-primary-container to-primary text-white",
        "shadow-[0_16px_48px_rgb(0_62_98_/_0.20)]",
        "flex flex-col h-full justify-between",
      )}
    >
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Bot className="h-6 w-6 text-white" strokeWidth={1.75} />
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Centrale Operativa — NC Personal Trainer
          </h2>
        </div>
        <p className="text-lg text-white/95 mb-6 leading-relaxed">
          <span aria-hidden>👋</span> Buongiorno, {firstName}. Ecco il triage della tua scuderia
          oggi:
        </p>
        <ul className="space-y-4 text-base text-white/90">
          {bullets.map((b, idx) => {
            const Icon = b.icon;
            return (
              <li key={idx} className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full",
                    b.iconWrap,
                  )}
                >
                  <Icon className={cn("h-4 w-4", b.iconColor)} strokeWidth={2} />
                </div>
                <span className="leading-relaxed pt-0.5">{b.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ===========================================================================
// 3. Atleti a Rischio / Triage (md:col-span-2)
// ===========================================================================
function TriageWidget({
  alerts,
  isLoading,
  onSelect,
}: {
  alerts: UrgentAlert[];
  isLoading: boolean;
  onSelect: (athleteId: string) => void;
}) {
  return (
    <div className={cn(bentoCard, "md:col-span-2 flex flex-col min-h-[400px]")}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-on-surface">
          Atleti a Rischio / Triage
        </h2>
        <ShieldAlert className="h-6 w-6 text-destructive" strokeWidth={1.75} />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center mb-3">
            <CheckSquare className="h-7 w-7 text-success" strokeWidth={1.75} />
          </div>
          <h3 className="font-display text-lg font-semibold mb-1">Tutto sotto controllo</h3>
          <p className="text-sm text-on-surface-variant">Nessun atleta in zona critica.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((a) => {
            const pill = severityPill(a.severity);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.athleteId)}
                className="w-full flex items-center justify-between p-3 rounded-[24px] hover:bg-surface-container-high transition-colors border border-transparent hover:border-outline-variant/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar className="h-12 w-12 bg-surface-container-highest">
                    <AvatarImage src={a.avatarUrl || undefined} alt={a.athleteName} />
                    <AvatarFallback className="bg-secondary-container text-on-secondary-container text-sm font-semibold">
                      {a.avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {a.athleteName}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {a.details || a.value}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold flex-shrink-0",
                    pill.bg,
                    pill.text,
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", pill.dot)} />
                  {pill.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 4. Attività Oggi — circular gauge (md:col-span-1)
// ===========================================================================
function PulseWidget({
  completed,
  total,
  fraction,
  inProgress,
  toStart,
  isLoading,
}: {
  completed: number;
  total: number;
  fraction: number;
  inProgress: number;
  toStart: number;
  isLoading: boolean;
}) {
  // r=45 → circumference 2πr ≈ 283; dashoffset moves the cap.
  const circumference = 283;
  const dashOffset = circumference * (1 - fraction);

  return (
    <div
      className={cn(
        bentoCard,
        "md:col-span-1 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[400px]",
      )}
    >
      <h2 className="font-display text-2xl font-semibold tracking-tight self-start w-full text-left mb-6">
        Attività Oggi
      </h2>

      {isLoading ? (
        <Skeleton className="w-48 h-48 rounded-full" />
      ) : (
        <>
          <div className="relative w-48 h-48 flex items-center justify-center mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-surface-container-highest"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="text-primary"
                style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-5xl font-bold text-primary tracking-tighter">
                {completed}
                <span className="text-2xl text-on-surface-variant font-normal">/{total}</span>
              </span>
              <span className="text-sm font-semibold text-on-surface mt-1">Completati</span>
            </div>
          </div>

          <div className="flex w-full justify-around mt-2">
            <div className="flex flex-col items-center">
              <span className="font-display text-2xl font-semibold text-on-surface">
                {inProgress}
              </span>
              <span className="text-xs text-on-surface-variant">In corso</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-display text-2xl font-semibold text-on-surface">{toStart}</span>
              <span className="text-xs text-on-surface-variant">Da iniziare</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// 5. Ultimi Allenamenti Conclusi — activity feed (md:col-span-2)
// ===========================================================================
type FeedbackItem = ReturnType<typeof useCoachDashboardMetrics>["feedbackItems"][number];

function RecentFeedWidget({
  items,
  isLoading,
  onReview,
}: {
  items: FeedbackItem[];
  isLoading: boolean;
  onReview: (athleteId: string) => void;
}) {
  return (
    <div className={cn(bentoCard, "md:col-span-2 xl:col-span-2 flex flex-col min-h-[400px]")}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Ultimi Allenamenti Conclusi
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Filtra"
          className="text-on-surface-variant hover:bg-surface-container-high"
        >
          <ListFilter className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-[24px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <Timer className="h-10 w-10 text-on-surface-variant/40 mb-3" />
          <p className="text-sm text-on-surface-variant">Nessun workout in attesa di revisione.</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 max-h-[320px] -mx-2 px-2 custom-scrollbar">
          <div className="space-y-3">
            {items.map((item, idx) => {
              const Icon = FEED_ICONS[idx % FEED_ICONS.length];
              const pill = rpePill(item.rpeGlobal);
              return (
                <div
                  key={item.id}
                  className="group flex items-center justify-between p-4 bg-surface rounded-[24px] border border-outline-variant/5 hover:border-outline-variant/20 transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container flex-shrink-0">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-on-surface truncate">
                        {item.athleteName}
                      </h3>
                      <p className="text-sm text-on-surface-variant truncate">
                        {item.workoutTitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {pill && (
                      <span
                        className={cn(
                          "hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold",
                          pill.bg,
                          pill.text,
                        )}
                      >
                        <span className={cn("w-2 h-2 rounded-full", pill.dot)} />
                        {pill.label}
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={() => onReview(item.athleteId)}
                      className="bg-primary-container text-on-primary-container hover:bg-primary-container/80 transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      Esamina
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ===========================================================================
// 6. Azioni Rapide — pill action buttons (md:col-span-1)
// ===========================================================================
function QuickActionsWidget({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className={cn(bentoCard, "md:col-span-1 flex flex-col min-h-[400px]")}>
      <h2 className="font-display text-2xl font-semibold tracking-tight mb-6">Azioni Rapide</h2>
      <div className="flex flex-col gap-4">
        <InviteAthleteDialog trigger={<ActionRow icon={UserPlus} label="Invita Nuovo Atleta" />} />
        <ActionRow
          icon={FileText}
          label="Nuovo Programma"
          onClick={() => onNavigate("/coach/programs")}
        />
        <ActionRow
          icon={Megaphone}
          label="Invia Broadcast"
          onClick={() => onNavigate("/coach/messages")}
        />
      </div>
    </div>
  );
}

const ActionRow = ({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof UserPlus;
  label: string;
  onClick?: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-4 p-4 bg-surface rounded-full hover:bg-primary-container/10 transition-colors text-on-surface border border-outline-variant/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container/20 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors flex-shrink-0">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <span className="text-sm font-semibold flex-1 text-left">{label}</span>
      <ChevronRight className="h-5 w-5 text-on-surface-variant opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
    </button>
  );
};
