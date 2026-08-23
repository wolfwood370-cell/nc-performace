import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, ShieldAlert, Activity, HeartPulse } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useAthleteHealthProfile,
  getStatusLabel,
  painAnswerLabel,
  type HealthStatus,
  type FmsScore,
  type RecentPainReport,
} from "@/hooks/useAthleteHealthProfile";
import { SORENESS_ZONE_LABELS, t } from "@/utils/translations";
import { cn } from "@/lib/utils";

interface HealthProfileTabProps {
  athleteId: string | undefined;
}

const STATUS_CONFIG: Record<HealthStatus, { tone: string; bg: string; icon: typeof CheckCircle2 }> =
  {
    green: { tone: "text-success", bg: "bg-success/10", icon: CheckCircle2 },
    yellow: { tone: "text-warning", bg: "bg-warning/10", icon: AlertTriangle },
    red: { tone: "text-destructive", bg: "bg-destructive/10", icon: ShieldAlert },
  };

const INJURY_STATUS_LABELS: Record<string, string> = {
  in_rehab: "In riabilitazione",
  monitoring: "In osservazione",
  recovered: "Recuperato",
  chronic: "Cronico",
  active: "Attivo",
};

function fmsScoreTone(status: FmsScore["status"]): string {
  switch (status) {
    case "optimal":
      return "text-success border-success/40";
    case "limited":
      return "text-warning border-warning/40";
    case "dysfunctional":
    case "pain":
      return "text-destructive border-destructive/40";
  }
}

/** Three tones for three states: declared pain, declared "no pain",
 *  unanswered. The neutral tone is deliberate — an unanswered question
 *  is not a green light (CORE §0.8). */
function painAnswerTone(hasPain: boolean | null): string {
  if (hasPain === true) return "text-destructive border-destructive/40";
  if (hasPain === false) return "text-success border-success/40";
  return "text-muted-foreground border-border";
}

/**
 * Coach-side clinical "semaforo" for an athlete: overall readiness status
 * (green/yellow/red) plus the FMS breakdown, active injuries and recent pain
 * that drive it. Read-only analysis layered on FmsScreening (capture). Empty-safe:
 * useAthleteHealthProfile returns a green "Nessuna Restrizione" summary on a fresh
 * backend, and null when no athlete is selected.
 */
export function HealthProfileTab({ athleteId }: HealthProfileTabProps) {
  const { data: profile, isLoading } = useAthleteHealthProfile(athleteId ?? null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <HeartPulse className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nessun profilo salute disponibile</p>
        </CardContent>
      </Card>
    );
  }

  const {
    summary,
    fmsScores,
    fmsTotalScore,
    fmsMaxScore,
    fmsTestDate,
    activeInjuries,
    recentPainReports,
  } = profile;
  const status = STATUS_CONFIG[summary.status];
  const StatusIcon = status.icon;

  // Days that carry at least one zone. Downloaded by the hook since forever
  // (useAthleteHealthProfile selects `soreness_map`), never rendered until now:
  // the semaforo counted the pain days and dropped the zones on the floor.
  const daysWithZones = recentPainReports.filter(
    (r) => Object.keys(r.sorenessMap ?? {}).length > 0,
  );

  // Most recent check-in row (hook orders date DESC). Rendered as a
  // three-state answer: "Non risposto" is a state of its own, never
  // collapsed into "nessun dolore".
  const latestPainAnswer = recentPainReports[0];

  return (
    <div className="space-y-6">
      {/* Semaforo — overall clinical status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
                status.bg,
              )}
            >
              <StatusIcon className={cn("h-7 w-7", status.tone)} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={cn("text-base font-semibold", status.tone)}>{summary.title}</h3>
              <p className="text-sm text-muted-foreground">{summary.description}</p>
              {summary.details.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {summary.details.map((detail, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", status.bg)} />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pain answer of the latest check-in — three states, never two */}
      {latestPainAnswer && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <HeartPulse className="h-4 w-4 text-muted-foreground" />
              Dolore — ultimo check-in
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-xs capitalize text-muted-foreground">
              {formatReportDate(latestPainAnswer.date)}
            </p>
            <Badge
              variant="outline"
              className={cn("shrink-0", painAnswerTone(latestPainAnswer.hasPain))}
            >
              {painAnswerLabel(latestPainAnswer.hasPain)}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Soreness zones from the daily check-in */}
      {daysWithZones.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <HeartPulse className="h-4 w-4 text-muted-foreground" />
              Zone segnalate negli ultimi 7 giorni
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Indicate dall&apos;atleta nel check-in giornaliero. Sono un dato a sé: non
              corrispondono per forza alla risposta sul dolore che muove il semaforo.
            </p>
            {daysWithZones.map((report) => (
              <SorenessDayRow key={report.date} report={report} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* FMS breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Functional Movement Screen
            </CardTitle>
            {fmsTestDate && (
              <span className="text-2xl font-bold tabular-nums">
                {fmsTotalScore}
                <span className="text-sm font-normal text-muted-foreground">/{fmsMaxScore}</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!fmsTestDate ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nessun test FMS eseguito</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Esegui una valutazione FMS per popolare questa sezione
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {fmsScores.map((s) => {
                const bilateral = s.leftScore !== null && s.rightScore !== null;
                return (
                  <div
                    key={s.testKey}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.testName}</p>
                      <p className="text-xs text-muted-foreground">{s.bodyArea}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {bilateral && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          Sx {s.leftScore} · Dx {s.rightScore}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("gap-1 tabular-nums", fmsScoreTone(s.status))}
                      >
                        {s.minScore}/3 · {getStatusLabel(s.status)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active injuries */}
      {activeInjuries.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Infortuni attivi ({activeInjuries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeInjuries.map((injury) => (
              <div
                key={injury.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{injury.bodyZone}</p>
                  {injury.description && (
                    <p className="truncate text-xs text-muted-foreground">{injury.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {INJURY_STATUS_LABELS[injury.status] ?? injury.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Human date of a check-in row, tolerant of malformed input. Shared by
 *  the pain-answer card and the soreness rows so the two never disagree. */
function formatReportDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? isoDate : format(parsed, "EEEE d MMM", { locale: it });
}

/**
 * One check-in day and the zones it carries.
 *
 * Zone names only, never the value next to them: `soreness_map` has three
 * conflicting contracts today — the check-in writes `mild|moderate|severe`
 * (`DailyCheckin.tsx:280`), the reader casts to `Record<string, number>`
 * (`useAthleteHealthProfile.ts:219`) and `src/types/database.ts:64` declares
 * `0|1|2|3|4|5`. Until that is settled, showing an intensity would mean
 * showing a number whose scale nobody can vouch for. The key is unambiguous;
 * the value is not.
 */
function SorenessDayRow({ report }: { report: RecentPainReport }) {
  const label = formatReportDate(report.date);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs font-medium capitalize text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.keys(report.sorenessMap).map((zone) => (
          <Badge key={zone} variant="outline" className="text-xs font-normal">
            {t(SORENESS_ZONE_LABELS, zone)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
