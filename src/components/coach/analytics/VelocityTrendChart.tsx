import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/ui/chart";
import { Zap, Gauge, Dumbbell } from "lucide-react";
import { useAthleteVbtData, useAthleteVbtExercises } from "@/hooks/useAthleteVbtData";

interface VelocityTrendChartProps {
  athleteId: string | undefined;
}

export function VelocityTrendChart({ athleteId }: VelocityTrendChartProps) {
  const [selectedExercise, setSelectedExercise] = useState("");
  const { data: exercises = [], isLoading: exLoading } = useAthleteVbtExercises(athleteId);
  const { data: vbtData = [], isLoading: dataLoading } = useAthleteVbtData(
    athleteId,
    selectedExercise,
  );

  // Auto-select first exercise
  useMemo(() => {
    if (exercises.length > 0 && !selectedExercise) {
      setSelectedExercise(exercises[0]);
    }
  }, [exercises, selectedExercise]);

  const isLoading = exLoading || dataLoading;

  // KPIs
  const kpis = useMemo(() => {
    if (vbtData.length === 0) return { avgVelocity: 0, peakVelocity: 0, avgPower: 0 };
    const avgV = vbtData.reduce((s, d) => s + d.meanVelocity, 0) / vbtData.length;
    const peakV = Math.max(...vbtData.map((d) => d.peakVelocity));
    const powerPoints = vbtData.filter((d) => d.powerWatts !== null);
    const avgP =
      powerPoints.length > 0
        ? powerPoints.reduce((s, d) => s + (d.powerWatts ?? 0), 0) / powerPoints.length
        : 0;
    return {
      avgVelocity: Math.round(avgV * 1000) / 1000,
      peakVelocity: Math.round(peakV * 1000) / 1000,
      avgPower: Math.round(avgP),
    };
  }, [vbtData]);

  // Y domain
  const yDomain = useMemo(() => {
    if (vbtData.length === 0) return [0, 1.5];
    const maxV = Math.max(...vbtData.map((d) => d.meanVelocity), 1.2);
    return [0, Math.ceil(maxV * 10) / 10 + 0.1];
  }, [vbtData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (exercises.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-1">Nessun Dato VBT</h3>
        <p className="text-sm text-muted-foreground">
          L'atleta non ha ancora registrato sessioni con analisi della velocità.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Velocità Media</p>
                <p className="text-3xl font-bold tabular-nums">
                  {kpis.avgVelocity}{" "}
                  <span className="text-base font-normal text-muted-foreground">m/s</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-chart-velocity/10 flex items-center justify-center">
                <Gauge className="h-6 w-6 text-chart-velocity" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Picco Velocità</p>
                <p className="text-3xl font-bold tabular-nums">
                  {kpis.peakVelocity}{" "}
                  <span className="text-base font-normal text-muted-foreground">m/s</span>
                </p>
              </div>
              {/* chart-velocity like the tile beside it: peak velocity is still a
                  velocity metric, and success/10 emits nothing (complete-colour
                  var) — the row must not read [tinted, mute, tinted]. */}
              <div className="h-12 w-12 rounded-xl bg-chart-velocity/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-chart-velocity" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Potenza Media</p>
                <p className="text-3xl font-bold tabular-nums">
                  {kpis.avgPower}{" "}
                  <span className="text-base font-normal text-muted-foreground">W</span>
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-chart-power/10 flex items-center justify-center">
                <Dumbbell className="h-6 w-6 text-chart-power" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Trend Velocità</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Velocità media concentrica per sessione
                </p>
              </div>
            </div>
            <Select value={selectedExercise} onValueChange={setSelectedExercise}>
              <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm">
                <SelectValue placeholder="Seleziona esercizio" />
              </SelectTrigger>
              <SelectContent>
                {exercises.map((ex) => (
                  <SelectItem key={ex} value={ex}>
                    {ex}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-sm bg-success/30" />
              <span className="text-muted-foreground">&gt; 1.0 m/s — Velocità / Potenza</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-sm bg-destructive/30" />
              <span className="text-muted-foreground">&lt; 0.5 m/s — Forza Max / Grinding</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {vbtData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Zap className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nessun dato VBT per questo esercizio</p>
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vbtData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  {/* Velocity zones */}
                  <ReferenceArea
                    y1={1.0}
                    y2={yDomain[1]}
                    fill="var(--success)"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea y1={0} y2={0.5} fill="var(--destructive)" fillOpacity={0.08} />
                  <ReferenceLine
                    y={1.0}
                    stroke="var(--success)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />
                  <ReferenceLine
                    y={0.5}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                  />

                  <XAxis
                    dataKey="dateFormatted"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={yDomain}
                    tickFormatter={(v) => `${v}`}
                    unit=" m/s"
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg space-y-1 text-sm">
                          <p className="font-medium">{d.exerciseName}</p>
                          <p className="text-muted-foreground">
                            Velocità Media:{" "}
                            <span className="font-semibold text-foreground">
                              {d.meanVelocity} m/s
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            Picco:{" "}
                            <span className="font-semibold text-foreground">
                              {d.peakVelocity} m/s
                            </span>
                          </p>
                          {d.weightKg > 0 && (
                            <p className="text-muted-foreground">
                              Carico:{" "}
                              <span className="font-semibold text-foreground">{d.weightKg} kg</span>
                            </p>
                          )}
                          {d.estimated1RM > 0 && (
                            <p className="text-muted-foreground">
                              1RM Stimato:{" "}
                              <span className="font-semibold text-foreground">
                                {d.estimated1RM} kg
                              </span>
                            </p>
                          )}
                          {d.powerWatts && (
                            <p className="text-muted-foreground">
                              Potenza:{" "}
                              <span className="font-semibold text-foreground">
                                {d.powerWatts} W
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="meanVelocity"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={{ fill: "var(--primary)", r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: "var(--primary)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
