import { CoachLayout } from "@/components/coach/CoachLayout";
import { useEffect, useState } from "react";
import { useCoachAthletes } from "@/hooks/useCoachData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MetabolicChart } from "@/components/coach/analytics/MetabolicChart";
import { StrengthChart } from "@/components/coach/analytics/StrengthChart";
import { VolumeIntensityChart } from "@/components/coach/analytics/VolumeIntensityChart";
import { AcwrGauge } from "@/components/coach/analytics/AcwrGauge";
import { TrainingBlocksTimeline } from "@/components/coach/analytics/TrainingBlocksTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { useRealtimeAnalytics } from "@/hooks/useRealtimeAnalytics";

export default function CoachAnalytics() {
  const { data: athletes, isLoading: athletesLoading } = useCoachAthletes();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | undefined>();

  // Live realtime subscription — charts auto-refresh when athlete logs data
  useRealtimeAnalytics(selectedAthleteId);

  // Auto-select first athlete when loaded
  useEffect(() => {
    if (athletes && athletes.length > 0 && !selectedAthleteId) {
      setSelectedAthleteId(athletes[0].id);
    }
  }, [athletes, selectedAthleteId]);

  const selectedAthlete = athletes?.find((a) => a.id === selectedAthleteId);

  return (
    <CoachLayout title="Analisi" subtitle="Approfondimenti e trend di performance">
      <div className="space-y-6 animate-fade-in">
        {/* Athlete Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Atleta:</span>
          </div>
          {athletesLoading ? (
            <Skeleton className="h-10 w-[200px]" />
          ) : athletes && athletes.length > 0 ? (
            <Select value={selectedAthleteId} onValueChange={setSelectedAthleteId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Seleziona atleta">
                  {selectedAthlete && (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={selectedAthlete.avatar_url ?? undefined} />
                        <AvatarFallback className="text-3xs">
                          {selectedAthlete.full_name?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <span>{selectedAthlete.full_name}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {athletes.map((athlete) => (
                  <SelectItem key={athlete.id} value={athlete.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={athlete.avatar_url ?? undefined} />
                        <AvatarFallback className="text-3xs">
                          {athlete.full_name?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <span>{athlete.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun atleta trovato</p>
          )}
        </div>

        {/* Section A: Metabolic Chart (Full Width) */}
        <MetabolicChart athleteId={selectedAthleteId} />

        {/* Section B: Performance Metrics (2 Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StrengthChart athleteId={selectedAthleteId} />
          <VolumeIntensityChart athleteId={selectedAthleteId} />
        </div>

        {/* Section C: Workload Management */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AcwrGauge athleteId={selectedAthleteId} />
          </div>
          {/* Optional: Add more cards here in the future */}
        </div>

        {/* Section D: Roster periodization (coach-wide, not athlete-scoped) */}
        <TrainingBlocksTimeline />
      </div>
    </CoachLayout>
  );
}
