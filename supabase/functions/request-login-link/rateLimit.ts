// =============================================================================
// supabase/functions/request-login-link/rateLimit.ts
// =============================================================================
// Sliding-window counter for the public login-link endpoint.
//
// ⚠ BEST-EFFORT, PER-INSTANCE — dichiarato, non promesso. Edge functions run
// as several short-lived isolates, so this state is neither shared nor
// durable: it raises the cost of hammering a single address from one isolate,
// it does NOT stop a distributed attack. A real limit needs durable storage
// and belongs to the rate-limit slice already named in HANDOFF §0. It is here
// because the alternative was shipping a public "send an email to any address"
// endpoint with nothing at all in front of it (security checklist §5).
//
// Two limits, two reasons:
//   - per email  → mailbombing a specific person (the harm to a real user)
//   - per instance → bounding the O(users) `listUsers` scan and the Resend
//     quota when an attacker rotates addresses
//
// PURE except for the map it owns: `now` is injected, so the tests need no
// clock and no Deno API.
// =============================================================================

export interface RateLimitConfig {
  /** Requests allowed inside one window. */
  maxHits: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Keys kept in memory before the expired ones are swept. */
  maxTrackedKeys?: number;
}

export interface RateLimiter {
  /**
   * Records the hit and returns true when it is within the limit; returns
   * false WITHOUT recording when it is not — otherwise continuous hammering
   * would keep pushing the window forward and the block would never expire.
   */
  allow(key: string, now: number): boolean;
  /** Tracked keys — for the sweep pin in the tests. */
  size(): number;
}

/** Per-address: three login emails per quarter of an hour is plenty. */
export const PER_EMAIL_LIMIT: RateLimitConfig = { maxHits: 3, windowMs: 15 * 60_000 };

/** Per-isolate ceiling across every address. */
export const PER_INSTANCE_LIMIT: RateLimitConfig = { maxHits: 60, windowMs: 15 * 60_000 };

/** Single key used for the instance-wide counter. */
export const INSTANCE_KEY = "__instance__";

const DEFAULT_MAX_TRACKED_KEYS = 5000;

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const { maxHits, windowMs } = config;
  const maxTrackedKeys = config.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const hits = new Map<string, number[]>();

  /** Drops every key whose hits have all fallen out of the window. */
  const sweep = (now: number) => {
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  };

  return {
    allow(key, now) {
      if (hits.size > maxTrackedKeys) sweep(now);

      const live = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (live.length >= maxHits) {
        // Keep the pruned list so the window can still slide out.
        hits.set(key, live);
        return false;
      }

      live.push(now);
      hits.set(key, live);
      return true;
    },
    size() {
      return hits.size;
    },
  };
}
