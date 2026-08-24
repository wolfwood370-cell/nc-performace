/**
 * The load lens card (C-09). Shows the recent-vs-habitual load ratio as a
 * DESCRIPTION — band words, caveat, acute/chronic means — or the absence
 * with its reason and the real numbers. Every word comes from the acwr
 * module (single owner); this card applies no thresholds and wears no
 * alarm colours: a description is not a verdict.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAthleteAcwrData } from "@/hooks/useAthleteAcwrData";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { ACWR_ACUTE_DAYS, ACWR_BAND_LABELS, ACWR_CAVEAT, acwrAbsenceText } from "@/lib/math/acwr";
import { ACWR_BASELINE_DAYS } from "@/lib/math/constants";

interface AcwrGaugeProps {
  athleteId: string | undefined;
}

export function AcwrGauge({ athleteId }: AcwrGaugeProps) {
  const { data, isLoading } = useAthleteAcwrData(athleteId);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[120px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Carico recente vs abituale</CardTitle>
            <p className="text-xs text-muted-foreground">
              Media giornaliera degli ultimi {ACWR_ACUTE_DAYS} giorni rispetto agli ultimi{" "}
              {ACWR_BASELINE_DAYS} — sRPE × durata
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Separate literal-equality guards: the discriminant's else-side
            does not narrow under this repo's strict:false config. */}
        {(!data || data.available === false) && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {data && data.available === false ? acwrAbsenceText(data) : "Dati non disponibili"}
            </p>
          </div>
        )}
        {data && data.available === true && (
          <div className="space-y-4">
            {/* Ratio + band description */}
            <div className="flex flex-col items-center gap-1 pt-2">
              <div className="text-3xl font-bold tabular-nums text-foreground">
                {data.ratio.toFixed(2)}
              </div>
              <div className="text-sm text-foreground">{ACWR_BAND_LABELS[data.band]}</div>
              <p className="text-xs text-muted-foreground">{ACWR_CAVEAT}</p>
            </div>

            {/* Load breakdown */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold">{data.acuteLoad}</div>
                <div className="text-3xs text-muted-foreground uppercase tracking-wide">
                  Recente (media {ACWR_ACUTE_DAYS}gg)
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{data.chronicLoad}</div>
                <div className="text-3xs text-muted-foreground uppercase tracking-wide">
                  Abituale (media {ACWR_BASELINE_DAYS}gg)
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
