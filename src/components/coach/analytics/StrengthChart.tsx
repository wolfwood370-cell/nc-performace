import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAthleteStrengthProgression, useAthleteExerciseList } from "@/hooks/useAthleteAnalytics";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Dumbbell } from "lucide-react";
import { useState } from "react";

interface StrengthChartProps {
  athleteId: string | undefined;
}

export function StrengthChart({ athleteId }: StrengthChartProps) {
  const [selectedExercise, setSelectedExercise] = useState("Back Squat");
  const { data: exercises } = useAthleteExerciseList(athleteId);
  const { data, isLoading } = useAthleteStrengthProgression(athleteId, selectedExercise);

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

  // Calculate trend
  const trend =
    hasData && data.length >= 2 ? data[data.length - 1].estimated1RM - data[0].estimated1RM : 0;

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-chart-3/20 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-chart-3" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Progressione Forza</CardTitle>
              <p className="text-xs text-muted-foreground">1RM Stimato nel tempo</p>
            </div>
          </div>
          {trend !== 0 && (
            <div
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                trend > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              }`}
            >
              {trend > 0 ? "+" : ""}
              {trend.toFixed(1)} kg
            </div>
          )}
        </div>
        <Select value={selectedExercise} onValueChange={setSelectedExercise}>
          <SelectTrigger className="w-full mt-2 h-8 text-xs">
            <SelectValue placeholder="Seleziona esercizio" />
          </SelectTrigger>
          <SelectContent>
            {exercises?.map((exercise) => (
              <SelectItem key={exercise} value={exercise} className="text-xs">
                {exercise}
              </SelectItem>
            ))}
            {(!exercises || exercises.length === 0) && (
              <SelectItem value="Back Squat" className="text-xs">
                Back Squat
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Nessun dato per {selectedExercise}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 10 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                domain={["dataMin - 5", "dataMax + 5"]}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(value: number) => [`${value} kg`, "1RM Stimato"]}
              />
              <Line
                type="monotone"
                dataKey="estimated1RM"
                stroke="var(--chart-intensity)"
                strokeWidth={2}
                dot={{ fill: "var(--chart-intensity)", r: 4 }}
                activeDot={{ r: 6, fill: "var(--chart-intensity)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
