import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, CalendarRange } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useCoachTrainingBlocks } from "@/hooks/useCoachTrainingBlocks";

const FOCUS_LABEL: Record<string, string> = {
  strength: "Forza",
  hypertrophy: "Ipertrofia",
  endurance: "Resistenza",
  power: "Potenza",
  recovery: "Recupero",
  peaking: "Peaking",
  transition: "Transizione",
};

function fmt(date: Date): string {
  return format(date, "dd MMM yyyy", { locale: it });
}

/**
 * Roster-wide read-only timeline of every training phase ("block") owned by the
 * coach (useCoachTrainingBlocks → training_phases joined to the athlete name).
 * Not athlete-scoped: complements the per-athlete PeriodizationTab. Empty-safe:
 * shows an empty state on a fresh backend (0 phases).
 */
export function TrainingBlocksTimeline() {
  const { blocks, isLoading } = useCoachTrainingBlocks();

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Periodizzazione roster
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fasi di allenamento di tutti gli atleti</p>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Layers className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessun blocco di allenamento</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Le fasi create nella tab Periodizzazione degli atleti appariranno qui
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{b.athleteName ?? "Atleta"}</p>
                    <Badge variant="secondary" className="shrink-0 text-2xs">
                      {FOCUS_LABEL[b.focusType] ?? b.focusType}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{b.name}</p>
                </div>
                <p className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <CalendarRange className="h-3 w-3" />
                  {fmt(b.startDate)} → {fmt(b.endDate)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
