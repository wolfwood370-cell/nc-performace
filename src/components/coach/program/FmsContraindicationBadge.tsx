import { ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFmsAlerts, checkExerciseContraindication } from "@/hooks/useFmsAlerts";

interface FmsContraindicationBadgeProps {
  exerciseName: string;
  athleteId: string | null;
}

/**
 * Inline warning next to a programmed exercise when its name matches an FMS
 * red-flag contraindication for the assigned athlete (useFmsAlerts → fms_tests).
 * Distinct from the biomechanical risk light (fmsRiskEngine / fms_assessments)
 * rendered on the same card. Self-contained: every instance calls useFmsAlerts,
 * but the shared queryKey lets React Query dedupe them into a single request per
 * athlete. Renders nothing when there is no contraindication, athlete, or data.
 */
export function FmsContraindicationBadge({
  exerciseName,
  athleteId,
}: FmsContraindicationBadgeProps) {
  const { data } = useFmsAlerts(athleteId);
  const hit = data ? checkExerciseContraindication(exerciseName, data.flags) : null;
  if (!hit) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-3xs font-bold text-destructive outline-none focus-visible:ring-1 focus-visible:ring-destructive"
            aria-label={`Controindicazione FMS: ${hit.message}`}
          >
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            FMS
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs border-destructive/40 bg-popover text-xs"
        >
          <p className="font-semibold text-destructive">Controindicazione FMS</p>
          <p className="text-foreground">{hit.message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
