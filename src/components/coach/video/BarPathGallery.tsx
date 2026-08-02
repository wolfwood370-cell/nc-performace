import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, Play, Zap, Gauge, Ruler } from "lucide-react";
import {
  useAthleteVbtData,
  useAthleteVbtExercises,
  type VbtDataPoint,
} from "@/hooks/useAthleteVbtData";
import { cn } from "@/lib/utils";

interface BarPathGalleryProps {
  athleteId: string | undefined;
}

function VelocityBadge({ velocity }: { velocity: number }) {
  const color =
    velocity >= 1.0
      ? "bg-success/15 text-success border-success/30"
      : velocity >= 0.5
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-destructive/15 text-destructive border-destructive/30";

  return (
    <Badge className={cn("text-xs font-mono tabular-nums border", color)}>
      {velocity.toFixed(2)} m/s
    </Badge>
  );
}

export function BarPathGallery({ athleteId }: BarPathGalleryProps) {
  const [exerciseFilter, setExerciseFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<VbtDataPoint | null>(null);

  const { data: exercises = [], isLoading: exLoading } = useAthleteVbtExercises(athleteId);
  const { data: vbtData = [], isLoading: dataLoading } = useAthleteVbtData(
    athleteId,
    exerciseFilter === "all" ? undefined : exerciseFilter,
  );

  const isLoading = exLoading || dataLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (vbtData.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Video className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-1">Nessuna Registrazione</h3>
        <p className="text-sm text-muted-foreground">
          L'atleta non ha ancora registrato sessioni con analisi traiettoria.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-chart-velocity/10 flex items-center justify-center">
                <Video className="h-5 w-5 text-chart-velocity" />
              </div>
              <div>
                <CardTitle className="text-base">Analisi Traiettoria</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {vbtData.length} registrazion{vbtData.length === 1 ? "e" : "i"} VBT
                </p>
              </div>
            </div>
            <Select value={exerciseFilter} onValueChange={setExerciseFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                <SelectValue placeholder="Tutti gli esercizi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli esercizi</SelectItem>
                {exercises.map((ex) => (
                  <SelectItem key={ex} value={ex}>
                    {ex}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vbtData.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className="group text-left rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Thumbnail placeholder */}
                <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <Play className="h-10 w-10 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />

                  {/* Peak velocity badge */}
                  <div className="absolute top-2 right-2">
                    <VelocityBadge velocity={entry.peakVelocity} />
                  </div>

                  {/* Exercise name overlay */}
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-xs font-medium text-white truncate">{entry.exerciseName}</p>
                    <p className="text-3xs text-white/70">{entry.dateFormatted}</p>
                  </div>
                </div>

                {/* Metrics row */}
                <div className="p-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {entry.meanVelocity} m/s
                  </span>
                  {entry.weightKg > 0 && (
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {entry.weightKg} kg
                    </span>
                  )}
                  {entry.romCm !== null && (
                    <span className="flex items-center gap-1">
                      <Ruler className="h-3 w-3" />
                      {entry.romCm} cm
                    </span>
                  )}
                  {entry.powerWatts !== null && (
                    <span className="ml-auto font-medium text-foreground">
                      {entry.powerWatts} W
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedEntry} onOpenChange={(o) => !o && setSelectedEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {selectedEntry?.exerciseName}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              {/* Placeholder for video */}
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Anteprima video non disponibile</p>
                  <p className="text-xs">Il video è stato analizzato in tempo reale</p>
                </div>
              </div>

              {/* Detailed metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Velocità Media</p>
                  <p className="text-xl font-bold tabular-nums">
                    {selectedEntry.meanVelocity}{" "}
                    <span className="text-sm font-normal text-muted-foreground">m/s</span>
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Picco Velocità</p>
                  <p className="text-xl font-bold tabular-nums">
                    {selectedEntry.peakVelocity}{" "}
                    <span className="text-sm font-normal text-muted-foreground">m/s</span>
                  </p>
                </div>
                {selectedEntry.romCm !== null && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">ROM</p>
                    <p className="text-xl font-bold tabular-nums">
                      {selectedEntry.romCm}{" "}
                      <span className="text-sm font-normal text-muted-foreground">cm</span>
                    </p>
                  </div>
                )}
                {selectedEntry.powerWatts !== null && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Potenza Stimata</p>
                    <p className="text-xl font-bold tabular-nums">
                      {selectedEntry.powerWatts}{" "}
                      <span className="text-sm font-normal text-muted-foreground">W</span>
                    </p>
                  </div>
                )}
                {selectedEntry.weightKg > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Carico</p>
                    <p className="text-xl font-bold tabular-nums">
                      {selectedEntry.weightKg}{" "}
                      <span className="text-sm font-normal text-muted-foreground">kg</span>
                    </p>
                  </div>
                )}
                {selectedEntry.estimated1RM > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">1RM Stimato</p>
                    <p className="text-xl font-bold tabular-nums">
                      {selectedEntry.estimated1RM}{" "}
                      <span className="text-sm font-normal text-muted-foreground">kg</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
