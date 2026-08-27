import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAthleteVolumeIntensity } from "@/hooks/useAthleteAnalytics";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Activity } from "lucide-react";

interface VolumeIntensityChartProps {
  athleteId: string | undefined;
}

export function VolumeIntensityChart({ athleteId }: VolumeIntensityChartProps) {
  const { data, isLoading } = useAthleteVolumeIntensity(athleteId);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.length > 0;

  // Calculate averages. avgRpe can be null per point (nobody declared an
  // effort for that session): the mean runs over the DECLARED points only,
  // and with none it reads "—" — absence never becomes a number.
  const avgTonnage = hasData
    ? Math.round(data.reduce((sum, d) => sum + d.totalTonnage, 0) / data.length)
    : 0;
  const rpeDeclared = hasData ? data.flatMap((d) => (d.avgRpe != null ? [d.avgRpe] : [])) : [];
  const avgRpe =
    rpeDeclared.length > 0
      ? (rpeDeclared.reduce((sum, v) => sum + v, 0) / rpeDeclared.length).toFixed(1)
      : "—";

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-chart-volume/20 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-chart-volume" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Volume vs Intensità</CardTitle>
              <p className="text-xs text-muted-foreground">
                Tonnellaggio (barre) vs RPE Medio (linea)
              </p>
            </div>
          </div>
          {hasData && (
            <div className="flex gap-2 text-3xs">
              <span className="px-2 py-0.5 rounded bg-muted">
                Avg: {(avgTonnage / 1000).toFixed(1)}t
              </span>
              <span className="px-2 py-0.5 rounded bg-muted">RPE: {avgRpe}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Nessun dato di allenamento disponibile</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 10 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="tonnage"
                tick={{ fontSize: 10 }}
                tickLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}t`}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="rpe"
                orientation="right"
                domain={[5, 10]}
                tick={{ fontSize: 10 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(value: number | null, name: string) => [
                  name === "totalTonnage" ? `${((value ?? 0) / 1000).toFixed(1)}t` : (value ?? "—"),
                  name === "totalTonnage" ? "Tonnellaggio" : "RPE Medio",
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: "10px" }}
                formatter={(value) => (value === "totalTonnage" ? "Tonnellaggio" : "RPE Medio")}
              />
              <Bar
                yAxisId="tonnage"
                dataKey="totalTonnage"
                fill="hsl(var(--chart-volume))"
                opacity={0.7}
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="rpe"
                type="monotone"
                dataKey="avgRpe"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--destructive))", r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
