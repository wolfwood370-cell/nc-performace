// =============================================================================
// src/features/nutrition/AthleteNutrition.tsx
// "La tua nutrizione" — athlete, autonomous mode, READ-ONLY.
// Latest nutrition release: daily target + macros + strategy + plain-Italian
// explanation derived from the engine flags. Renders as a child of
// AthleteLayout (bottom nav preserved). ZERO writes to the nutrition domain.
// State precedence lives in deriveScreenState (pure, fixture-tested).
// =============================================================================

import type { ReactNode } from "react";
import { Clock, Hourglass, Salad, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { NUTRITION_COPY } from "./copy";
import { describeRelease, deriveScreenState } from "./describeRelease";
import { useLatestNutritionRelease } from "./useLatestNutritionRelease";
import { NutritionBanners } from "./components/NutritionBanners";
import { NutritionDetails } from "./components/NutritionDetails";
import { NutritionHero } from "./components/NutritionHero";
import { NutritionStateCard } from "./components/NutritionStateCard";
import type { ParsedRelease } from "./types";

const stateIconClass = "h-6 w-6 text-brand-container";

function PageHeader() {
  return (
    <header className="pt-2 pb-1">
      <span className="font-display text-xs font-semibold tracking-widest uppercase text-brand-container">
        {NUTRITION_COPY.pageEyebrow}
      </span>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-on-surface">
        {NUTRITION_COPY.pageTitle}
      </h1>
    </header>
  );
}

/** Normal render: hero + conditional banners + collapsible details. */
function ReleaseContent({ parsed }: { parsed: ParsedRelease }) {
  const view = describeRelease(parsed.document, parsed.safety, {
    coldStart: parsed.document.cold_start,
    fallbackMode: parsed.document.fallback_mode,
    inReview: false,
  });
  return (
    <>
      <NutritionHero view={view} />
      <NutritionBanners banners={view.banners} />
      <NutritionDetails details={view.details} />
    </>
  );
}

/** Safety pause: neutral card first (zero clinical detail); the last target,
 *  if readable, is demoted below — muted, badged "In revisione", with an
 *  explicit do-not-follow note. Banners/details stay hidden on purpose. */
function PauseContent({ lastRelease }: { lastRelease: ParsedRelease | null }) {
  const demoted = lastRelease
    ? describeRelease(lastRelease.document, lastRelease.safety, {
        coldStart: lastRelease.document.cold_start,
        fallbackMode: lastRelease.document.fallback_mode,
        inReview: true,
      })
    : null;
  return (
    <>
      <NutritionStateCard
        icon={<ShieldCheck className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title={NUTRITION_COPY.pauseTitle}
        body={NUTRITION_COPY.pauseBody}
      />
      {demoted && (
        <div>
          <p className="text-xs text-on-surface-variant mb-2">
            {NUTRITION_COPY.pauseLastTargetNote}
          </p>
          <NutritionHero view={demoted} muted />
        </div>
      )}
    </>
  );
}

function AthleteNutrition() {
  const { data, isLoading, isError, refetch } = useLatestNutritionRelease();

  let content: ReactNode;
  if (isLoading) {
    content = (
      <NutritionStateCard
        icon={<Hourglass className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title={NUTRITION_COPY.loadingTitle}
        body={NUTRITION_COPY.loadingBody}
      />
    );
  } else if (isError) {
    // A failed query must never masquerade as a real state (no fake numbers).
    content = (
      <NutritionStateCard
        icon={<TriangleAlert className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
        title={NUTRITION_COPY.errorTitle}
        body={NUTRITION_COPY.errorBody}
      >
        <button
          type="button"
          onClick={() => {
            void refetch();
          }}
          className={cn(
            "mt-2 px-6 py-3 rounded-full",
            "bg-brand-container text-white",
            "font-display text-sm font-bold uppercase tracking-widest",
            "transition-all duration-200 active:scale-[0.98] hover:brightness-110",
          )}
        >
          {NUTRITION_COPY.errorRetry}
        </button>
      </NutritionStateCard>
    );
  } else {
    const state = deriveScreenState({
      release: data?.release ?? null,
      unreadReviewNoticeAt: data?.unreadReviewNoticeAt ?? null,
    });
    switch (state.kind) {
      case "safety-pause":
        content = <PauseContent lastRelease={state.lastRelease} />;
        break;
      case "empty":
        content = (
          <NutritionStateCard
            icon={<Salad className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
            title={NUTRITION_COPY.emptyTitle}
            body={NUTRITION_COPY.emptyBody}
          />
        );
        break;
      case "unreadable":
        content = (
          <NutritionStateCard
            icon={<Clock className={stateIconClass} strokeWidth={1.75} aria-hidden="true" />}
            title={NUTRITION_COPY.unreadableTitle}
            body={NUTRITION_COPY.unreadableBody}
          />
        );
        break;
      case "release":
        content = <ReleaseContent parsed={state.parsed} />;
        break;
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      <PageHeader />
      {content}
    </div>
  );
}

export default AthleteNutrition;
