import { Sparkles, AlertTriangle } from "lucide-react";
import { useAiQuota } from "@/hooks/useAiQuota";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AiQuotaBadgeProps {
  className?: string;
}

/**
 * Compact pill showing the coach's daily AI message usage (used/limit).
 * User-scoped (own `ai_usage_tracking` row) and empty-safe via `useAiQuota`
 * (no row yet → 0/20, matching the DB column default). Turns amber when the
 * remaining quota gets low and red once the daily limit is reached.
 */
export function AiQuotaBadge({ className }: AiQuotaBadgeProps) {
  const { data, isLoading } = useAiQuota();

  if (isLoading) {
    return <Skeleton className={cn("h-7 w-[4.5rem] rounded-full", className)} />;
  }

  const used = data?.message_count ?? 0;
  const limit = data?.daily_limit ?? 20;
  const remaining = Math.max(limit - used, 0);
  const atLimit = used >= limit;
  // Warn when the last ~20% of the daily quota remains (at least the final message).
  const nearLimit = !atLimit && remaining <= Math.max(1, Math.ceil(limit * 0.2));

  const tone = atLimit
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : nearLimit
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-border bg-muted/50 text-muted-foreground";

  const Icon = atLimit || nearLimit ? AlertTriangle : Sparkles;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
        tone,
        className,
      )}
      title={`Messaggi AI usati oggi: ${used} su ${limit}`}
      aria-label={`Quota AI giornaliera: ${used} messaggi su ${limit} usati`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {used}/{limit}
      </span>
    </div>
  );
}
