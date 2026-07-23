// =============================================================================
// src/lib/auth/otp.ts
// =============================================================================
// Contract of the one-time code used by the passwordless sign-in.
//
// TYPE — `magiclink`, NOT `email`. Resolved EMPIRICALLY on the 1a smoke
// (2026-07-22): the code minted by `admin.generateLink({ type: 'magiclink' })`
// verifies under the magiclink type; `email` — the type the Supabase docs show
// for `signInWithOtp` codes — was rejected. The literal lives here with its own
// assertion so a "tidy-up" back to `email` fails a test instead of the login.
//
// LENGTH — not a constant of ours: GoTrue issues 6 to 10 digits and the choice
// is a project setting. This project issues 8 today (seen live). Accepting the
// whole range means a dashboard change cannot truncate the input and break
// sign-in, which is exactly what a hard-coded 6 would have done.
// =============================================================================

import type { EmailOtpType } from "@supabase/supabase-js";

export const LOGIN_OTP_TYPE: EmailOtpType = "magiclink";

export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

/**
 * Keeps digits only and never more than the longest code GoTrue can issue.
 * Users paste the code out of an email client, which happily brings spaces,
 * non-breaking spaces and the odd newline along with it.
 */
export function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
}

/** True when the input could be a whole code — the submit gate. */
export function isCompleteOtp(value: string): boolean {
  const digits = normalizeOtpInput(value);
  return digits.length >= OTP_MIN_LENGTH && digits.length <= OTP_MAX_LENGTH;
}
