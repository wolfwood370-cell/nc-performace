// =============================================================================
// src/features/nutrition/components/NutritionStateCard.tsx
// Generic state surface (loading / error / empty / pause) — presentational
// twin of AthleteTraining's private StateCard, kept local to the feature.
// No clinical detail ever renders here (art. 9): generic copy only.
// =============================================================================

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NutritionStateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-3xl p-8",
        "bg-white/70 backdrop-blur-xl border border-[#c0c7d0]/30",
        "flex flex-col items-center justify-center text-center gap-3",
        "min-h-[200px]",
      )}
    >
      <div className="h-12 w-12 rounded-full bg-brand-container/10 flex items-center justify-center">
        {icon}
      </div>
      <p className="font-display text-base font-semibold text-on-surface">{title}</p>
      <p className="text-sm text-on-surface-variant max-w-[280px]">{body}</p>
      {children}
    </section>
  );
}
