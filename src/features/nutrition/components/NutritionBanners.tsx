// =============================================================================
// src/features/nutrition/components/NutritionBanners.tsx
// Conditional explanation banners (plain Italian, resolved in describeRelease).
// One neutral visual style on purpose: these inform, they never alarm.
// =============================================================================

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Banner } from "../types";

export function NutritionBanners({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;
  return (
    <section aria-label="Note sul tuo obiettivo" className="flex flex-col gap-3">
      {banners.map((banner) => (
        <div
          key={banner.kind}
          className={cn(
            "rounded-2xl px-4 py-3",
            "bg-white/70 backdrop-blur-xl border border-[#c0c7d0]/30",
            "flex items-start gap-3",
          )}
        >
          <Info
            className="h-4 w-4 mt-0.5 shrink-0 text-brand-container"
            strokeWidth={2}
            aria-hidden="true"
          />
          <p className="text-sm text-on-surface">{banner.text}</p>
        </div>
      ))}
    </section>
  );
}
