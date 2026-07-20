// =============================================================================
// src/types/__tests__/profile.test.ts
// =============================================================================
// Pins for the single archived-athlete criterion (isArchived) and its
// companion reader (getArchivedAt). The criterion must stay strictly
// `archived === true`: truthy-but-not-boolean values mean NOT archived
// (the flag is only ever written by the archive_athlete RPC as jsonb true).
// =============================================================================
import { describe, expect, it } from "vitest";

import { getArchivedAt, isArchived } from "@/types/profile";

describe("isArchived", () => {
  it("returns true for the exact RPC-written shape", () => {
    expect(isArchived({ archived: true })).toBe(true);
    expect(isArchived({ archived: true, archived_at: "2026-07-20T07:03:40+00:00" })).toBe(true);
  });

  it("returns false when the flag is false or absent", () => {
    expect(isArchived({ archived: false })).toBe(false);
    expect(isArchived({})).toBe(false);
    expect(isArchived({ training_status: "active" })).toBe(false);
  });

  it("returns false for null/undefined/non-object settings", () => {
    expect(isArchived(null)).toBe(false);
    expect(isArchived(undefined)).toBe(false);
    expect(isArchived("archived")).toBe(false);
    expect(isArchived(42)).toBe(false);
    expect(isArchived([])).toBe(false);
  });

  it("rejects truthy non-boolean flags (strict === true criterion)", () => {
    expect(isArchived({ archived: "true" })).toBe(false);
    expect(isArchived({ archived: 1 })).toBe(false);
    expect(isArchived({ archived: {} })).toBe(false);
  });

  it("ignores the legacy training_status enum value 'archived'", () => {
    // Distinct semantics: the enum lives in settings.training_status and is
    // editable from the settings form; the boolean flag is RPC-only.
    expect(isArchived({ training_status: "archived" })).toBe(false);
    expect(isArchived({ training_status: "archived", archived: true })).toBe(true);
  });
});

describe("getArchivedAt", () => {
  it("returns the ISO string when present", () => {
    expect(getArchivedAt({ archived: true, archived_at: "2026-07-20T07:03:40+00:00" })).toBe(
      "2026-07-20T07:03:40+00:00",
    );
  });

  it("returns null when absent, null, malformed, or settings is nullish", () => {
    expect(getArchivedAt({ archived: true })).toBeNull();
    expect(getArchivedAt({ archived_at: null })).toBeNull();
    expect(getArchivedAt({ archived_at: 42 })).toBeNull();
    expect(getArchivedAt(null)).toBeNull();
    expect(getArchivedAt(undefined)).toBeNull();
  });
});
