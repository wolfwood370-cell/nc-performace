import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAthleteAcwrData } from "@/hooks/useAthleteAcwrData";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

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
          <Skeleton className="h-[180px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const ratio = data?.ratio ?? 0;
  const status = data?.status ?? "insufficient-data";
  const acuteLoad = data?.acuteLoad ?? 0;
  const chronicLoad = data?.chronicLoad ?? 0;

  // Calculate gauge position (0-100%)
  const getGaugePosition = (ratio: number) => {
    if (ratio <= 0) return 0;
    if (ratio >= 2) return 100;
    return (ratio / 2) * 100;
  };

  const gaugePosition = getGaugePosition(ratio);

  const getStatusConfig = () => {
    switch (status) {
      case "optimal":
        return {
          icon: CheckCircle,
          color: "text-success",
          bg: "bg-success/10",
          label: "Zona Ottimale",
        };
      case "warning":
        return {
          icon: AlertTriangle,
          color: "text-warning",
          bg: "bg-warning/10",
          label: "Zona Attenzione",
        };
      case "high-risk":
        return {
          icon: AlertTriangle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          label: "Alto Rischio",
        };
      default:
        return {
          icon: Activity,
          color: "text-muted-foreground",
          bg: "bg-muted",
          label: "Dati Insufficienti",
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", config.bg)}>
            <StatusIcon className={cn("h-4 w-4", config.color)} />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Gestione Carico</CardTitle>
            <p className="text-xs text-muted-foreground">Rapporto Carico Acuto:Cronico</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status === "insufficient-data" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Dati di allenamento insufficienti</p>
            <p className="text-xs text-muted-foreground mt-1">Servono almeno 2 settimane di log</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Gauge visualization */}
            <div className="relative h-6 rounded-full overflow-hidden bg-muted">
              {/* Zone backgrounds */}
              {/* `opacity-30` instead of `/30`: success/warning/destructive are
                  complete-colour vars, so the alpha modifier emits no rule at
                  all — the whole scale must light up, not one step of it. The
                  stripes are empty divs: opacity has no children to fade. */}
              <div className="absolute inset-0 flex">
                <div className="w-[40%] bg-chart-acwr-low opacity-30" />
                <div className="w-[25%] bg-success opacity-30" />
                <div className="w-[10%] bg-warning opacity-30" />
                <div className="w-[25%] bg-destructive opacity-30" />
              </div>

              {/* Needle indicator */}
              <div
                className="absolute top-0 h-full w-1 bg-foreground rounded-full transition-all duration-500"
                style={{ left: `calc(${gaugePosition}% - 2px)` }}
              />
            </div>

            {/* Zone labels */}
            <div className="flex justify-between text-3xs text-muted-foreground px-1">
              <span>0</span>
              <span>0.8</span>
              <span>1.3</span>
              <span>1.5</span>
              <span>2.0+</span>
            </div>

            {/* Current value display */}
            <div className="flex items-center justify-center gap-6 pt-2">
              <div className="text-center">
                <div className={cn("text-3xl font-bold tabular-nums", config.color)}>
                  {ratio?.toFixed(2) ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">{config.label}</div>
              </div>
            </div>

            {/* Load breakdown */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold">{acuteLoad}</div>
                <div className="text-3xs text-muted-foreground uppercase tracking-wide">
                  Acuto (media 7gg)
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{chronicLoad}</div>
                <div className="text-3xs text-muted-foreground uppercase tracking-wide">
                  Cronico (media 28gg)
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
