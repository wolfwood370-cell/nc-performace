// =============================================================================
// src/features/nutrition/describeRelease.ts
// PURE view-model logic for the nutrition screen: same input ⇒ same output,
// no Date.now / random / network. The only date operation compares two ISO
// strings that BOTH arrive as input. Every user string comes from copy.ts,
// so technical spy names can never leak into the athlete-facing copy.
// =============================================================================

import { NUTRITION_COPY, STRATEGY_LABELS } from "./copy";
import { parseRelease } from "./parseRelease";
import type {
  Badge,
  Banner,
  NutritionDocument,
  NutritionReleaseDbRow,
  ReleaseView,
  SafetyContextView,
  ScreenState,
} from "./types";

/** Shared contract with the engine's gate fast-follow: the athlete-side
 *  pause channel is a `notifications` row with THIS exact type. */
export const NUTRITION_REVIEW_NOTIFICATION_TYPE = "nutrition_review";

export interface DeriveScreenStateInput {
  release: NutritionReleaseDbRow | null;
  /** created_at of the most recent UNREAD 'nutrition_review' notification. */
  unreadReviewNoticeAt: string | null;
}

export function deriveScreenState(input: DeriveScreenStateInput): ScreenState {
  const { release, unreadReviewNoticeAt } = input;
  const parsed = release ? parseRelease(release) : null;

  // Safety pause: ONLY the real engine signal. An unread notice OLDER than
  // the latest release means the engine re-released after the review, so the
  // release wins. Release AGE alone is NEVER a pause (Nick 2026-07-17:
  // weekly scheduling not armed yet — an age heuristic would lie).
  if (unreadReviewNoticeAt !== null) {
    const noticeIsNewer =
      release === null || Date.parse(unreadReviewNoticeAt) > Date.parse(release.released_at);
    if (noticeIsNewer) return { kind: "safety-pause", lastRelease: parsed };
  }

  if (release === null) return { kind: "empty" };
  if (parsed === null) return { kind: "unreadable" };
  return { kind: "release", parsed };
}

/** "YYYY-MM-DD" → "DD/MM/YYYY"; anything else passes through untouched. */
export function formatItalianDate(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return isoDay;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface DescribeFlags {
  coldStart: boolean;
  fallbackMode: boolean;
  /** True when rendered under a safety pause: the target is demoted and
   *  labelled, never proposed as valid. */
  inReview: boolean;
}

export function describeRelease(
  document: NutritionDocument,
  safety: SafetyContextView,
  flags: DescribeFlags,
): ReleaseView {
  const badges: Badge[] = [];
  if (flags.inReview) badges.push({ kind: "in-revisione", label: NUTRITION_COPY.pauseBadge });
  if (flags.coldStart) badges.push({ kind: "calibrazione", label: NUTRITION_COPY.coldStartBadge });

  // Stable banner order: calibration → data quality → guardrails → advice.
  const banners: Banner[] = [];
  if (flags.coldStart) {
    banners.push({ kind: "calibrazione", text: NUTRITION_COPY.coldStartBanner });
  }
  if (flags.fallbackMode) {
    banners.push({ kind: "solo-peso", text: NUTRITION_COPY.bannerFallback });
  }
  if (safety.capped_by.includes("macro_floor")) {
    banners.push({ kind: "minimo-sicurezza", text: NUTRITION_COPY.bannerMacroFloor });
  }
  // daily_cap and weekly_pct_cap collapse into ONE "gradual" banner on purpose.
  if (safety.capped_by.includes("daily_cap") || safety.capped_by.includes("weekly_pct_cap")) {
    banners.push({ kind: "graduale", text: NUTRITION_COPY.bannerGradual });
  }
  if (safety.capped_by.includes("lifecycle_cap")) {
    banners.push({ kind: "graduale-fase", text: NUTRITION_COPY.bannerLifecycle });
  }
  if (document.diet_break_suggested) {
    banners.push({
      kind: "pausa-dieta",
      text:
        safety.deficit_streak_weeks >= 1
          ? NUTRITION_COPY.bannerDietBreak(safety.deficit_streak_weeks)
          : NUTRITION_COPY.bannerDietBreakGeneric,
    });
  }
  if (safety.lifecycle_referral_due) {
    banners.push({ kind: "specialista", text: NUTRITION_COPY.bannerReferral });
  }

  return {
    headline: {
      kcal: Math.round(document.daily_calories),
      strategyLabel: STRATEGY_LABELS[document.strategy] ?? null,
      dateLabel: NUTRITION_COPY.updatedOn(formatItalianDate(document.computed_for_date)),
    },
    macros: {
      proteinG: Math.round(document.protein_g),
      carbsG: Math.round(document.carbs_g),
      fatsG: Math.round(document.fats_g),
    },
    badges,
    banners,
    details: {
      expenditureKcal: Math.round(document.expenditure_estimate),
      confidencePct: Math.round(document.confidence * 100),
      loggedDays: document.logged_days,
      totalDays: document.logged_days + document.imputed_days,
      weightKg: Math.round(document.weight_kg_at_release * 10) / 10,
    },
  };
}
