// =============================================================================
// src/lib/billing/__tests__/access.test.ts
// =============================================================================
// Truth table for hasActiveAccess. The predicate decides whether a paid feature
// shows up at all, so both of its doors are pinned here: the coached one (billed
// off-platform, no paid-for date exists) and the access_until one (the instant
// written by resolveAccessUntil: subscription period end, prepaid term or
// manual grant, whichever is furthest). `now` is injected: every case compares
// against the same frozen instant, never the wall clock.
// =============================================================================
import { describe, expect, it } from "vitest";

import { hasActiveAccess } from "@/lib/billing/access";

/** Frozen decision instant — the clock is never consulted. */
const NOW = new Date("2026-07-26T12:00:00Z");
const FUTURE = "2026-08-01T00:00:00Z";
const PAST = "2026-07-01T00:00:00Z";

describe("hasActiveAccess — coached branch", () => {
  it("grants access to a coached athlete with NO access_until at all", () => {
    // The load-bearing case: the coach bills this athlete outside the platform,
    // so requiring a paid-for date would lock out every coached client.
    expect(hasActiveAccess({ coaching_mode: "coached", access_until: null }, NOW)).toBe(true);
  });

  it("grants access to a coached athlete whatever access_until says", () => {
    for (const until of [null, undefined, PAST, FUTURE, ""]) {
      expect(hasActiveAccess({ coaching_mode: "coached", access_until: until }, NOW)).toBe(true);
    }
  });
});

describe("hasActiveAccess — access_until branch", () => {
  it("grants access while access_until is strictly in the future", () => {
    expect(hasActiveAccess({ coaching_mode: "autonomous", access_until: FUTURE }, NOW)).toBe(true);
    // Postgres/PostgREST spells the same instant with an offset, not a Z.
    expect(
      hasActiveAccess(
        { coaching_mode: "autonomous", access_until: "2026-08-01T00:00:00+00:00" },
        NOW,
      ),
    ).toBe(true);
  });

  it("denies once access_until is past", () => {
    expect(hasActiveAccess({ coaching_mode: "autonomous", access_until: PAST }, NOW)).toBe(false);
  });

  it("denies at the exact expiry instant (strict comparison)", () => {
    // access_until === now is EXPIRED: kills a loose >= comparison.
    expect(
      hasActiveAccess({ coaching_mode: "autonomous", access_until: "2026-07-26T12:00:00Z" }, NOW),
    ).toBe(false);
    // Same instant in the offset spelling: still expired.
    expect(
      hasActiveAccess(
        { coaching_mode: "autonomous", access_until: "2026-07-26T12:00:00+00:00" },
        NOW,
      ),
    ).toBe(false);
  });

  it("denies a null, absent or unparsable access_until", () => {
    expect(hasActiveAccess({ coaching_mode: "autonomous", access_until: null }, NOW)).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "autonomous" }, NOW)).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "autonomous", access_until: "domani" }, NOW)).toBe(
      false,
    );
    expect(hasActiveAccess({ coaching_mode: "autonomous", access_until: "" }, NOW)).toBe(false);
  });
});

describe("hasActiveAccess — fail-closed", () => {
  it("denies a null/undefined profile", () => {
    expect(hasActiveAccess(null, NOW)).toBe(false);
    expect(hasActiveAccess(undefined, NOW)).toBe(false);
  });

  it("denies an empty profile and one with a null coaching_mode", () => {
    // coaching_mode is NULL for legacy invite-token signups: no coached
    // shortcut, so those athletes fall back to the access_until rule.
    expect(hasActiveAccess({}, NOW)).toBe(false);
    expect(hasActiveAccess({ coaching_mode: null, access_until: null }, NOW)).toBe(false);
    expect(hasActiveAccess({ coaching_mode: null, access_until: FUTURE }, NOW)).toBe(true);
  });

  it("does not accept a near-miss coaching_mode value", () => {
    // Kills a loose check such as startsWith or a case-insensitive compare.
    expect(hasActiveAccess({ coaching_mode: "Coached", access_until: null }, NOW)).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "coach", access_until: null }, NOW)).toBe(false);
  });

  it("no longer reads subscription_status: the pre-flip legacy case flips to denied", () => {
    // BEHAVIOUR CHANGE, declared. Before 2026-07-26 this exact profile was
    // granted access (subscription branch of the old truth table). The rule now
    // reads ONLY access_until, so an 'active' status cache with no paid-for
    // date is denied. Verified live on 2026-07-26: the DB holds no profile in
    // this state (2 profiles total), so the flip has no victims. Intermediate
    // const: an inline literal would trip the excess-property check.
    const legacyProfile = { coaching_mode: null as string | null, subscription_status: "active" };
    expect(hasActiveAccess(legacyProfile, NOW)).toBe(false);
  });
});
