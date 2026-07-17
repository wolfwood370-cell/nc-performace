// =============================================================================
// src/features/nutrition/components/NutritionDetails.tsx
// Collapsible "Come l'ho calcolato" — hand-rolled toggle (athlete-app
// convention: no shadcn Collapsible on this surface), aria-expanded wired.
// =============================================================================

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NUTRITION_COPY } from "../copy";
import type { ReleaseView } from "../types";

/** 72.3 → "72,3" (Italian decimal comma; input already 1-decimal rounded). */
function formatWeight(weightKg: number): string {
  return String(weightKg).replace(".", ",");
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="font-display text-sm font-semibold text-on-surface tabular-nums">{value}</dd>
    </div>
  );
}

export function NutritionDetails({ details }: { details: ReleaseView["details"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label={NUTRITION_COPY.detailsToggle}
      className={cn("rounded-3xl", "bg-white/70 backdrop-blur-xl border border-[#c0c7d0]/30")}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-4 rounded-3xl",
          "transition-transform active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-container/40",
        )}
      >
        <span className="font-display text-sm font-semibold text-on-surface">
          {NUTRITION_COPY.detailsToggle}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-on-surface-variant transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open && (
        <dl className="px-5 pb-5 flex flex-col gap-2.5">
          <DetailRow
            label={NUTRITION_COPY.detailsExpenditure}
            value={`${details.expenditureKcal} ${NUTRITION_COPY.kcalUnit}`}
          />
          <DetailRow label={NUTRITION_COPY.detailsConfidence} value={`${details.confidencePct}%`} />
          <DetailRow
            label={NUTRITION_COPY.detailsLoggedDays}
            value={NUTRITION_COPY.detailsDaysValue(details.loggedDays, details.totalDays)}
          />
          <DetailRow
            label={NUTRITION_COPY.detailsWeight}
            value={`${formatWeight(details.weightKg)} kg`}
          />
        </dl>
      )}
    </section>
  );
}
