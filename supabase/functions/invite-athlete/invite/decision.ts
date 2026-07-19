// =============================================================================
// supabase/functions/invite-athlete/invite/decision.ts
// =============================================================================
// Pure decision for the already-exists branch of invite-athlete: given the
// existing profile facts (null = auth user without a profile row) and the
// inviting coach's id, returns the action the edge function must take.
// Deterministic, no I/O — magiclink generation, profile writes and the Resend
// send all stay in index.ts.
// =============================================================================

export interface ExistingProfileFacts {
  role: string | null;
  coach_id: string | null;
  onboarding_completed: boolean | null;
}

export type AlreadyExistsAction =
  | "create-and-resend" // no profile row: create linked to this coach + resend
  | "attach-and-resend" // unassigned athlete, never activated: attach + resend
  | "attach-no-resend" // unassigned athlete, already onboarded: attach, no email
  | "resend-pending" // this coach's athlete, never activated: resend only
  | "no-resend-active" // this coach's athlete, onboarded: nothing to send
  | "conflict"; // other coach or non-athlete role: 409, no email

export function decideAlreadyExists(input: {
  profile: ExistingProfileFacts | null;
  coachId: string;
}): AlreadyExistsAction {
  const { profile, coachId } = input;

  if (profile === null) return "create-and-resend";
  if (profile.role !== "athlete") return "conflict";

  // Active-account guard on every branch: only an explicit true blocks the
  // re-send — false and NULL (column never written) both mean "never
  // activated". No coach-triggered sign-in links to operational accounts.
  const onboarded = profile.onboarding_completed === true;

  if (!profile.coach_id) {
    return onboarded ? "attach-no-resend" : "attach-and-resend";
  }
  if (profile.coach_id === coachId) {
    return onboarded ? "no-resend-active" : "resend-pending";
  }
  return "conflict";
}
