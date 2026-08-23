/**
 * src/pages/coach/athlete-detail/OverviewTab.tsx
 * ---------------------------------------------------------------------------
 * Athlete detail page — Overview tab content.
 *
 * Extracted from `AthleteDetail.tsx` to address audit finding C3
 * (4037-line monolith). This is PR1 of the tab-by-tab refactor.
 *
 * The component is "fat" — receives all derived data (readiness,
 * ACWR, weight trend, compliance, pain status) via props so
 * the parent stays the single source of truth for hook composition.
 * No queries or mutations live here.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Zap, Scale, Target, Heart, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiInsightCard } from "@/components/coach/analytics/AiInsightCard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type AcwrStatus = "insufficient-data" | "optimal" | "warning" | "high-risk";

interface AcwrData {
  status: AcwrStatus;
  ratio: number | null;
  label: string;
  acuteLoad: number;
  chronicLoad: number;
}

interface ReadinessColors {
  stroke: string;
  text: string;
}

interface WeightTrendPoint {
  date: string;
  weight_kg: number | null;
}

interface ComplianceDay {
  day: string;
  status: "completed" | "rest" | "missed" | "future";
  isToday: boolean;
}

interface WeeklyCompliance {
  days: ComplianceDay[];
  /** Share (0-100) of ELAPSED week days with a completed workout — a
   *  days-trained ratio, not adherence to a plan (no plan is consulted). */
  adherence: number;
  completedDays: number;
  pastDays: number;
}

/**
 * Pain status shape used by the parent. Modelled as a single object with
 * optional fields because the parent computes it with a regular object
 * literal — using a strict discriminated union forces narrowing that
 * isn't yet wired upstream. When the parent refactor lands we can
 * tighten this to a proper `{ hasPain: false } | { hasPain: true; ... }`.
 */
interface PainStatus {
  hasPain: boolean;
  location?: string;
  severity?: string;
  description?: string;
  count?: number;
}

export interface OverviewTabProps {
  athleteId: string;
  readinessScore: number | null;
  readinessColors: ReadinessColors;
  acwrLoading: boolean;
  acwrData: AcwrData | null;
  weightTrend: WeightTrendPoint[] | undefined;
  weeklyCompliance: WeeklyCompliance;
  painStatus: PainStatus;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverviewTab({
  athleteId,
  readinessScore,
  readinessColors,
  acwrLoading,
  acwrData,
  weightTrend,
  weeklyCompliance,
  painStatus,
}: OverviewTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Readiness & Load */}
        <Card className="md:col-span-1 lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Readiness & Carico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Circular Gauge for Readiness */}
              <div className="relative flex-shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted/30"
                  />
                  {/* Arc only when a measured score exists: a 0-length arc
                      would claim a measured zero next to the "—" text. */}
                  {readinessScore != null && (
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${readinessScore * 2.64} 264`}
                      className={readinessColors.stroke}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-2xl font-bold tabular-nums", readinessColors.text)}>
                    {readinessScore ?? "—"}
                  </span>
                  <span className="text-3xs text-muted-foreground uppercase tracking-wide">
                    Readiness / 100
                  </span>
                </div>
              </div>

              {/* ACWR Display */}
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ACWR (Acuto:Cronico)</p>
                  {acwrLoading ? (
                    <Skeleton className="h-10 w-20" />
                  ) : acwrData?.status === "insufficient-data" ? (
                    <p className="text-2xl font-bold text-muted-foreground">—</p>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-3xl font-bold tabular-nums",
                          acwrData?.status === "optimal" && "text-success",
                          acwrData?.status === "warning" && "text-warning",
                          acwrData?.status === "high-risk" && "text-destructive",
                        )}
                      >
                        {acwrData?.ratio?.toFixed(2) || "—"}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-3xs",
                          acwrData?.status === "optimal" && "bg-success/10 text-success",
                          acwrData?.status === "warning" && "bg-warning/10 text-warning",
                          acwrData?.status === "high-risk" && "bg-destructive/10 text-destructive",
                        )}
                      >
                        {acwrData?.label || "N/A"}
                      </Badge>
                    </div>
                  )}
                </div>

                {acwrData && acwrData.status !== "insufficient-data" && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      Acuto: <strong className="text-foreground">{acwrData.acuteLoad}</strong>
                    </span>
                    <span>
                      Cronico: <strong className="text-foreground">{acwrData.chronicLoad}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Weight trend. The old "Est. TDEE kcal/day" stat was a
            fabricated measure (fixed age 30, male-only formula, constant
            800 replacing a missing height, hardcoded activity 1.55): the
            product does not measure TDEE — removed, the weight series is
            what is real here. */}
        <Card className="md:col-span-1 lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Peso (30 giorni)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-20">
                {!weightTrend || weightTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    Nessun dato peso
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      weight: {
                        label: "Peso",
                        color: "var(--primary)",
                      },
                    }}
                    className="h-full w-full"
                  >
                    <AreaChart data={weightTrend}>
                      <defs>
                        <linearGradient id="weightGradientOverview" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="weight_kg"
                        stroke="var(--primary)"
                        fill="url(#weightGradientOverview)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </div>
            </div>

            {weightTrend && weightTrend.length > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                <span>
                  30d Min:{" "}
                  <strong className="text-foreground">
                    {Math.min(...weightTrend.map((w) => w.weight_kg!))} kg
                  </strong>
                </span>
                <span>
                  Current:{" "}
                  <strong className="text-foreground">
                    {weightTrend[weightTrend.length - 1].weight_kg} kg
                  </strong>
                </span>
                <span>
                  30d Max:{" "}
                  <strong className="text-foreground">
                    {Math.max(...weightTrend.map((w) => w.weight_kg!))} kg
                  </strong>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Weekly Compliance */}
        <Card className="md:col-span-1 lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Compliance Settimanale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2 mb-4">
              {weeklyCompliance.days.map((day, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <span className="text-3xs text-muted-foreground uppercase font-medium">
                    {day.day.slice(0, 2)}
                  </span>
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      day.status === "completed" && "bg-success text-success-foreground",
                      day.status === "rest" && "bg-muted text-muted-foreground",
                      day.status === "missed" &&
                        "bg-destructive/20 text-destructive border-2 border-destructive/50",
                      day.status === "future" &&
                        "bg-muted/30 text-muted-foreground/50 border border-dashed border-muted-foreground/30",
                      day.isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    {day.status === "completed" && <CheckCircle2 className="h-4 w-4" />}
                    {day.status === "missed" && <XCircle className="h-4 w-4" />}
                    {day.status === "rest" && <span className="text-xs">—</span>}
                    {day.status === "future" && <span className="text-xs">•</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* "Giorni con allenamento", not "Aderenza": the ratio counts
                elapsed calendar days with a completed workout — no plan is
                consulted, so a planned rest day is not a miss and no
                red/green adherence judgment applies to this quantity. */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <span className="text-sm text-muted-foreground">Giorni con allenamento</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-primary"
                    style={{ width: `${weeklyCompliance.adherence}%` }}
                  />
                </div>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {weeklyCompliance.completedDays}/{weeklyCompliance.pastDays}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Pain Status */}
        <Card
          className={cn(
            "md:col-span-1 lg:col-span-2 overflow-hidden transition-colors",
            painStatus.hasPain && "border-destructive/50 bg-destructive/5",
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart
                className={cn("h-4 w-4", painStatus.hasPain ? "text-destructive" : "text-success")}
              />
              Stato Dolore
            </CardTitle>
          </CardHeader>
          <CardContent>
            {painStatus.hasPain ? (
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-destructive text-lg">Problema Attivo Rilevato</p>
                  <p className="text-sm text-muted-foreground">
                    {painStatus.location ?? "—"}:{""}
                    <span className="capitalize font-medium text-foreground">
                      {painStatus.severity ?? "—"}
                    </span>
                  </p>
                  {typeof painStatus.count === "number" && painStatus.count > 1 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +{painStatus.count - 1} altri infortuni attivi
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-success" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-success text-lg">All Clear </p>
                  <p className="text-sm text-muted-foreground">
                    Nessun infortunio o dolore segnalato
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Insight Card */}
      <AiInsightCard athleteId={athleteId} />
    </>
  );
}
