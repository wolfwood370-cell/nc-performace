// =============================================================================
// src/features/nutrition/components/NutritionHero.tsx
// Hero card: daily kcal target + strategy pill + badges + macro grams.
// Stateless — receives the resolved ReleaseView from describeRelease.
// `muted` demotes the card during a safety pause (never shown as valid).
// =============================================================================

import { cn } from "@/lib/utils";
import { NUTRITION_COPY } from "../copy";
import type { Badge, ReleaseView } from "../types";

function BadgePill({ badge }: { badge: Badge }) {
  return (
    <span
      className={cn(
        "font-sans text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded-full",
        badge.kind === "in-revisione"
          ? "text-amber-700 bg-amber-500/10"
          : "text-brand-container bg-brand-container/10",
      )}
    >
      {badge.label}
    </span>
  );
}

function MacroTile({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="rounded-2xl bg-surface-variant/30 px-3 py-2.5 text-center">
      <p className="font-sans text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant">
        {label}
      </p>
      <p className="font-display text-lg font-bold text-on-surface tabular-nums">{grams} g</p>
    </div>
  );
}

export function NutritionHero({ view, muted = false }: { view: ReleaseView; muted?: boolean }) {
  return (
    <section
      aria-label="Obiettivo nutrizionale del giorno"
      className={cn(
        "relative overflow-hidden",
        "rounded-3xl p-6",
        "bg-white/70 backdrop-blur-xl",
        "border border-[#c0c7d0]/30",
        "border-l-4 border-l-brand-container",
        "shadow-[0_10px_30px_rgba(80,118,142,0.05)]",
        muted && "opacity-60",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-container/8 to-transparent"
      />
      <div className="relative z-10 flex flex-col gap-4">
        {(view.headline.strategyLabel !== null || view.badges.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {view.headline.strategyLabel !== null && (
              <span className="font-sans text-[10px] font-semibold tracking-widest uppercase text-white bg-brand-container px-2.5 py-1 rounded-full">
                {view.headline.strategyLabel}
              </span>
            )}
            {view.badges.map((badge) => (
              <BadgePill key={badge.kind} badge={badge} />
            ))}
          </div>
        )}

        <div>
          <p className="font-sans text-xs font-semibold text-on-surface-variant">
            {NUTRITION_COPY.heroKicker}
          </p>
          <p className="font-display text-5xl font-bold tracking-tight text-on-surface tabular-nums">
            {view.headline.kcal}
            <span className="ml-2 font-display text-lg font-semibold text-on-surface-variant">
              {NUTRITION_COPY.kcalUnit}
            </span>
          </p>
          <p className="mt-1 font-sans text-xs text-on-surface-variant">
            {view.headline.dateLabel}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MacroTile label={NUTRITION_COPY.macroProtein} grams={view.macros.proteinG} />
          <MacroTile label={NUTRITION_COPY.macroCarbs} grams={view.macros.carbsG} />
          <MacroTile label={NUTRITION_COPY.macroFats} grams={view.macros.fatsG} />
        </div>
      </div>
    </section>
  );
}
