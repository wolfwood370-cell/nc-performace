// =============================================================================
// src/lib/auth/homePath.ts
// =============================================================================
// Where an authenticated user belongs, decided from the profile alone.
//
// PURE and import-free on purpose: `vitest.config.ts` runs in `environment:
// "node"`, so anything that reaches the Supabase client would blow up at
// import time. The I/O half lives in `resolveHomePath.ts` next door.
//
// WHY it reads `onboarding_completed`: the previous inline version in Auth.tsx
// sent every athlete to `/athlete`, where `ProtectedAthleteRoute` bounced the
// ones without onboarding to `/onboarding`. Correct outcome, two redirects and
// a flash of the wrong shell — and exactly the athlete who has just landed
// from an invite link sees it.
// =============================================================================

export type ProfileRole = "coach" | "athlete";

export interface HomePathInput {
  role: ProfileRole | string | null | undefined;
  onboardingCompleted: boolean | null | undefined;
}

/**
 * Total: any unknown/missing role falls through to `/onboarding`, which is the
 * surface that can ask who the user is. Never returns `/auth` — a user with a
 * session must never be sent back to the login page.
 */
export function pickHomePath({ role, onboardingCompleted }: HomePathInput): string {
  if (role === "coach") return "/coach";
  if (role === "athlete") return onboardingCompleted === true ? "/athlete" : "/onboarding";
  return "/onboarding";
}
