import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAthleteMetabolicData } from "@/hooks/useAthleteAnalytics";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, Flame } from "lucide-react";

interface MetabolicChartProps {
  athleteId: string | undefined;
}

export function MetabolicChart({ athleteId }: MetabolicChartProps) {
  const { data, isLoading } = useAthleteMetabolicData(athleteId);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.some((d) => d.bodyWeight || d.caloriesLogged);
  const caloriesTarget = data?.[0]?.caloriesTarget ?? 2500;

  // Calculate weight range for better visualization
  const weights = data?.filter((d) => d.bodyWeight).map((d) => d.bodyWeight as number) ?? [];
  const minWeight = weights.length > 0 ? Math.min(...weights) - 1 : 80;
  const maxWeight = weights.length > 0 ? Math.max(...weights) + 1 : 90;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Risposta Metabolica</CardTitle>
            <p className="text-xs text-muted-foreground">Peso vs Aderenza Calorica (30 giorni)</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Flame className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nessun dato metabolico disponibile</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 11 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="weight"
                orientation="left"
                domain={[minWeight, maxWeight]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                label={{ value: "kg", angle: -90, position: "insideLeft", fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="calories"
                orientation="right"
                domain={[1800, 3200]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                label={{ value: "kcal", angle: 90, position: "insideRight", fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend />
              <ReferenceLine
                yAxisId="calories"
                y={caloriesTarget}
                stroke="var(--destructive)"
                strokeDasharray="5 5"
                label={{ value: `Target: ${caloriesTarget}`, position: "right", fontSize: 10 }}
              />
              <Bar
                yAxisId="calories"
                dataKey="caloriesLogged"
                fill="var(--primary)"
                opacity={0.6}
                name="Calorie Registrate"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="bodyWeight"
                stroke="hsl(var(--chart-weight))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--chart-weight))", r: 3 }}
                connectNulls
                name="Peso Corporeo (kg)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
