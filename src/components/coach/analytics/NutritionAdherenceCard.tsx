import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Utensils, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useCoachNutritionAnalytics,
  type NutritionAnalyticsPoint,
} from "@/hooks/useCoachNutritionAnalytics";
import { cn } from "@/lib/utils";

interface NutritionAdherenceCardProps {
  athleteId: string | undefined;
}

/**
 * Coach-side read-only summary of an athlete's nutrition adherence over the last
 * 30 days (target vs logged calories, weight trend). Athlete-scoped, empty-safe:
 * useCoachNutritionAnalytics returns hasData=false on a fresh backend, so the
 * card shows an empty state instead of misleading zeros.
 */
export function NutritionAdherenceCard({ athleteId }: NutritionAdherenceCardProps) {
  const { data: result, isLoading } = useCoachNutritionAnalytics(athleteId);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[180px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const adherence = result?.adherencePct ?? 0;
  const avgDelta = result?.avgDelta ?? 0;
  const weightChange = result?.weightChange ?? null;
  const targetCalories = result?.targetCalories ?? null;
  const points = result?.data ?? [];
  const hasData = result?.hasData ?? false;

  // Distinguish "no meals logged" (adherence not computable) from a real low
  // adherence: an athlete may have only weight data → hasData true but 0 meals,
  // which would otherwise render a misleading "0%" in red.
  const hasLoggedMeals = points.some((p) => p.loggedCalories != null);
  const adherenceTone = !hasLoggedMeals
    ? "text-muted-foreground"
    : adherence >= 80
      ? "text-success"
      : adherence >= 50
        ? "text-warning"
        : "text-destructive";
  const DeltaIcon = avgDelta > 0 ? TrendingUp : avgDelta < 0 ? TrendingDown : Minus;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Utensils className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Aderenza Nutrizionale</CardTitle>
            <p className="text-xs text-muted-foreground">Ultimi 30 giorni</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Utensils className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessun dato nutrizionale registrato</p>
            <p className="mt-1 text-xs text-muted-foreground">
              L'aderenza appare quando l'atleta registra i pasti
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className={cn("text-2xl font-bold tabular-nums", adherenceTone)}>
                  {hasLoggedMeals ? `${adherence}%` : "—"}
                </div>
                <div className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Aderenza target
                </div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-2xl font-bold tabular-nums">
                  {hasLoggedMeals ? (
                    <>
                      <DeltaIcon className="h-4 w-4 text-muted-foreground" />
                      {avgDelta > 0 ? "+" : ""}
                      {avgDelta}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Δ medio kcal/gg
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums">
                  {weightChange != null ? `${weightChange > 0 ? "+" : ""}${weightChange}` : "—"}
                  {weightChange != null && (
                    <span className="ml-0.5 text-sm font-normal text-muted-foreground">kg</span>
                  )}
                </div>
                <div className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Variazione peso
                </div>
              </div>
            </div>

            {/* 30-day logged vs target calories */}
            {!hasLoggedMeals && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nessun pasto registrato in questo periodo
              </p>
            )}
            {hasLoggedMeals && (
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="nutritionLogged" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="dateFormatted"
                      tick={{ fontSize: 9 }}
                      interval={6}
                      tickLine={false}
                      axisLine={false}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
                    {targetCalories != null && (
                      <ReferenceLine
                        y={targetCalories}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as NutritionAnalyticsPoint;
                        return (
                          <div className="rounded-lg border border-border bg-popover p-2 text-xs shadow-lg">
                            <p className="font-medium">{p.dateFormatted}</p>
                            <p className="text-muted-foreground">
                              Loggate: {p.loggedCalories ?? "—"} kcal
                            </p>
                            {targetCalories != null && (
                              <p className="text-muted-foreground">Target: {targetCalories} kcal</p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="loggedCalories"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#nutritionLogged)"
                      connectNulls
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {hasLoggedMeals && targetCalories != null && (
              <p className="text-center text-3xs text-muted-foreground">
                Linea tratteggiata = target {targetCalories} kcal
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
