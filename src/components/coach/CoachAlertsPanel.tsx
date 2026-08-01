/**
 * src/components/coach/CoachAlertsPanel.tsx
 * ---------------------------------------------------------------------------
 * The coach-facing list of `coach_alerts` — the last mile of the CORE §0
 * escalation channel (watchdog RPE, intake semaforo, autonomous release gate,
 * nutrition safety). Before this panel those rows only ever reached the coach
 * as a bare number on the sidebar badge and as an ephemeral browser
 * notification: the text itself was not readable anywhere in the app.
 *
 * Presentational on purpose. `useCoachAlerts` is already mounted twice
 * (CoachSidebar for the badge, CoachHome for this panel) and its realtime
 * channel is process-wide; a third mount would only churn it. Data and
 * callbacks arrive as props.
 *
 * GDPR art. 9: the alert text is health data. It is rendered and nothing
 * else — never put into a URL, a logger call or analytics. The `link`
 * column is deliberately not consumed here.
 *
 * "Read" is not "resolved": marking read flips `read` and leaves the row in
 * place. Archiving (`dismissed`) is a separate, unwired mutation.
 */
import { AlertTriangle, Check, CheckSquare, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sortCoachAlerts } from "@/lib/coachAlerts";
import { COACH_ALERT_SEVERITY_LABELS, COACH_ALERT_TYPE_LABELS, t } from "@/utils/translations";
import { cn } from "@/lib/utils";

/**
 * Structural shape of a row. Declared here rather than imported because
 * `useCoachAlerts` does not export its row type; the hook's richer type is
 * assignable to this one.
 */
export interface CoachAlertRow {
  id: string;
  athlete_id: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  created_at: string;
  athlete?: { id: string; full_name: string | null } | null;
}

interface CoachAlertsPanelProps {
  alerts: CoachAlertRow[];
  isLoading: boolean;
  onMarkRead: (alertId: string) => void;
  onOpenAthlete: (athleteId: string) => void;
  /** Bento cell styling is owned by the page that mounts the panel. */
  className?: string;
}

/**
 * DB severity (`high|medium|low`) → Aura status pill.
 *
 * `high` uses the `destructive` tokens rather than the `error-container` pair
 * the other coach widgets reach for: `error-container` is not a key in
 * `tailwind.config.ts` (nor a CSS var in `index.css`), so those classes emit
 * nothing and the pill renders unstyled. Shipping the most severe alert with
 * no colour is not an option; the pre-existing occurrences elsewhere are
 * flagged separately.
 */
function severityTone(severity: string): { bg: string; text: string; dot: string } {
  switch (severity) {
    case "high":
      return {
        bg: "bg-destructive/10",
        text: "text-destructive",
        dot: "bg-destructive",
      };
    case "medium":
      return {
        bg: "bg-tertiary-container/10",
        text: "text-tertiary-container",
        dot: "bg-tertiary-container",
      };
    default:
      return {
        bg: "bg-surface-container-high",
        text: "text-on-surface-variant",
        dot: "bg-outline-variant",
      };
  }
}

function relativeTime(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatDistanceToNow(parsed, { addSuffix: true, locale: it });
}

export function CoachAlertsPanel({
  alerts,
  isLoading,
  onMarkRead,
  onOpenAthlete,
  className,
}: CoachAlertsPanelProps) {
  const ordered = sortCoachAlerts(alerts);
  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <section className={cn("flex flex-col", className)} aria-labelledby="coach-alerts-heading">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <h2
            id="coach-alerts-heading"
            className="font-display text-2xl font-semibold tracking-tight text-on-surface"
          >
            Avvisi dal Sistema
          </h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-bold tabular-nums bg-destructive/10 text-destructive flex-shrink-0">
              {unreadCount}
            </span>
          )}
        </div>
        <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" strokeWidth={1.75} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[24px]" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center mb-3">
            <CheckSquare className="h-7 w-7 text-success" strokeWidth={1.75} />
          </div>
          <h3 className="font-display text-lg font-semibold mb-1">Nessun avviso</h3>
          <p className="text-sm text-on-surface-variant">
            Il sistema non ha segnalato nulla che richieda la tua attenzione.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {ordered.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onMarkRead={onMarkRead}
              onOpenAthlete={onOpenAthlete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertRow({
  alert,
  onMarkRead,
  onOpenAthlete,
}: {
  alert: CoachAlertRow;
  onMarkRead: (alertId: string) => void;
  onOpenAthlete: (athleteId: string) => void;
}) {
  const tone = severityTone(alert.severity);
  const athleteName = alert.athlete?.full_name?.trim() || "Atleta";
  const timeAgo = relativeTime(alert.created_at);

  return (
    <li
      className={cn(
        "p-4 rounded-[24px] border transition-colors",
        alert.read
          ? "bg-surface border-outline-variant/10"
          : "bg-surface-container-low border-outline-variant/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0",
            tone.bg,
            tone.text,
          )}
        >
          <span className={cn("w-2 h-2 rounded-full", tone.dot)} />
          {t(COACH_ALERT_SEVERITY_LABELS, alert.severity)}
        </span>
        <span className="text-sm font-semibold text-on-surface">
          {t(COACH_ALERT_TYPE_LABELS, alert.type)}
        </span>
        {!alert.read && (
          <span className="text-3xs font-bold uppercase tracking-wider text-destructive">
            Non letto
          </span>
        )}
      </div>

      {/* The alert text itself — the whole point of this surface. */}
      <p className={cn("text-sm leading-relaxed text-on-surface", !alert.read && "font-medium")}>
        {alert.message}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <p className="text-xs text-on-surface-variant">
          {athleteName}
          {timeAgo && <span> · {timeAgo}</span>}
        </p>
        <div className="flex items-center gap-2">
          {!alert.read && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMarkRead(alert.id)}
              className="gap-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            >
              <Check className="h-4 w-4" />
              Segna come letto
            </Button>
          )}
          {/* Offered only when the profile join came back: if RLS did not let
              the coach read the athlete's row, their detail page is closed to
              them too, and the button would lead to a dead end. */}
          {alert.athlete && (
            <Button
              size="sm"
              onClick={() => onOpenAthlete(alert.athlete_id)}
              className="gap-1 rounded-full bg-primary-container text-on-primary-container hover:bg-primary-container/80"
            >
              Vedi atleta
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
