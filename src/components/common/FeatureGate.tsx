import { type ReactNode } from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFeatureAccess, type Feature } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeatureGateProps {
  feature: Feature;
  /**
   * For numeric-limit features (e.g. `max_active_programs`): the current usage
   * count. When provided, the gate locks once `current >= limit`. Omit for
   * boolean-access features (e.g. `video_feedback`), which lock on `!canAccess`.
   */
  current?: number;
  /** Content shown when the tier grants access. */
  children: ReactNode;
  /** Custom locked UI. When omitted, a default upgrade prompt is rendered. */
  fallback?: ReactNode;
  className?: string;
}

const FEATURE_LABELS: Record<Feature, string> = {
  video_feedback: "Video feedback",
  ai_vision_daily: "Analisi AI delle foto",
  ai_chat_daily: "Copilot AI",
  max_active_programs: "Programmi attivi",
};

/**
 * Feature-level gate complementary to the route-level `SubscriptionGuard`.
 * Renders `children` when the coach's tier grants access, otherwise an upgrade
 * prompt (or a custom `fallback`). Reads the tier policy from `useFeatureAccess`
 * — with a fresh backend every profile is `free`, so premium features lock by
 * design until the coach upgrades.
 */
export function FeatureGate({ feature, current, children, fallback, className }: FeatureGateProps) {
  const { canAccess, getLimit } = useFeatureAccess();

  // `current` applies only to numeric-limit features (limit > 0). Boolean
  // features report getLimit() === 0, so they fall back to the access check and
  // never mis-lock on `current >= 0` if `current` is passed by mistake.
  const numericLimit = getLimit(feature);
  const locked =
    current !== undefined && numericLimit > 0 ? current >= numericLimit : !canAccess(feature);

  if (!locked) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return <UpgradePrompt feature={feature} className={className} />;
}

function UpgradePrompt({ feature, className }: { feature: Feature; className?: string }) {
  const navigate = useNavigate();

  return (
    <div
      role="region"
      aria-label="Funzione premium bloccata"
      className={cn(
        "flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface-container-low p-6 text-center",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {FEATURE_LABELS[feature]} è una funzione premium
        </p>
        <p className="text-xs text-muted-foreground">
          Passa a un piano superiore per sbloccare questa funzionalità.
        </p>
      </div>
      <Button size="sm" className="rounded-full" onClick={() => navigate("/coach/business")}>
        Vedi i piani
      </Button>
    </div>
  );
}
