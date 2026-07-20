// =============================================================================
// src/lib/billing/__tests__/access.test.ts
// =============================================================================
// Truth table for hasActiveAccess. The predicate decides whether a paid feature
// shows up at all, so both of its doors are pinned here: the coached one (billed
// off-platform, no Stripe subscription exists) and the subscription one.
// =============================================================================
import { describe, expect, it } from "vitest";

import { hasActiveAccess } from "@/lib/billing/access";

describe("hasActiveAccess — coached branch", () => {
  it("grants access to a coached athlete with NO subscription at all", () => {
    // The load-bearing case: the coach bills this athlete outside Stripe, so
    // requiring an active subscription would lock out every coached client.
    expect(hasActiveAccess({ coaching_mode: "coached", subscription_status: "none" })).toBe(true);
  });

  it("grants access to a coached athlete whatever the subscription says", () => {
    for (const status of ["none", "past_due", "canceled", "active", "trial", null]) {
      expect(hasActiveAccess({ coaching_mode: "coached", subscription_status: status })).toBe(true);
    }
  });
});

describe("hasActiveAccess — subscription branch", () => {
  it("grants access to an autonomous athlete who is paying", () => {
    expect(hasActiveAccess({ coaching_mode: "autonomous", subscription_status: "active" })).toBe(
      true,
    );
    expect(hasActiveAccess({ coaching_mode: "autonomous", subscription_status: "trial" })).toBe(
      true,
    );
  });

  it("denies an autonomous athlete who is not paying", () => {
    for (const status of ["none", "past_due", "canceled"]) {
      expect(hasActiveAccess({ coaching_mode: "autonomous", subscription_status: status })).toBe(
        false,
      );
    }
  });

  it("denies an autonomous athlete with an unknown or missing status", () => {
    expect(hasActiveAccess({ coaching_mode: "autonomous", subscription_status: null })).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "autonomous" })).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "autonomous", subscription_status: "attivo" })).toBe(
      false,
    );
  });
});

describe("hasActiveAccess — fail-closed", () => {
  it("denies a null/undefined profile", () => {
    expect(hasActiveAccess(null)).toBe(false);
    expect(hasActiveAccess(undefined)).toBe(false);
  });

  it("denies an empty profile and one with a null coaching_mode", () => {
    // coaching_mode is NULL for legacy invite-token signups: no coached shortcut,
    // so those athletes fall back to the subscription rule.
    expect(hasActiveAccess({})).toBe(false);
    expect(hasActiveAccess({ coaching_mode: null, subscription_status: "none" })).toBe(false);
    expect(hasActiveAccess({ coaching_mode: null, subscription_status: "active" })).toBe(true);
  });

  it("does not accept a near-miss coaching_mode value", () => {
    // Kills a loose check such as startsWith or a case-insensitive compare.
    expect(hasActiveAccess({ coaching_mode: "Coached", subscription_status: "none" })).toBe(false);
    expect(hasActiveAccess({ coaching_mode: "coach", subscription_status: "none" })).toBe(false);
  });
});
