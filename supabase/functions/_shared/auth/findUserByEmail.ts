// =============================================================================
// supabase/functions/_shared/auth/findUserByEmail.ts
// =============================================================================
// READ-ONLY lookup of an auth user by email address.
//
// WHY a full scan instead of a targeted call: `GoTrueAdminApi` exposes
// `getUserById` but NO `getUserByEmail`, and `public.profiles` has no email
// column — so `listUsers` is the only side-effect-free way to answer
// "does this address have an account?".
//
// WHY side-effect-free matters: the obvious alternative (calling
// `generateLink` and reading the error) ROTATES the target's `recovery_token`
// — magiclink and recovery share that slot in GoTrue — which would let an
// unauthenticated caller invalidate anyone's pending password reset. That was
// a confirmed major on `invite-athlete` (fix `b41f3f4`); this module exists so
// the safe pattern is imported, not re-derived.
//
// ⚠ COST: O(number of users) per call — one request per 1000 users. Fine at
// the current scale (one coach + roster) and consistent with the existing
// lookup in `invite-athlete/index.ts`. When the user base grows past a few
// thousand, replace this with a targeted lookup (an `auth.users` mirror or an
// email column on `profiles` fed by `handle_new_user`) rather than raising the
// page cap.
//
// Pure except for the injected reader: pass `supabaseAdmin.auth.admin.listUsers`
// at the call site, a fake in tests — no Deno.env, no network here.
// =============================================================================

/** Minimal shape of an admin-listed auth user: only what callers need. */
export interface ListedUser {
  id: string;
  email?: string | null;
}

/**
 * One page of `auth.admin.listUsers`. The real client always sets `nextPage`
 * (initialised to null, filled from the `Link` header), so the natural end of
 * the scan is `nextPage === null`. It stays optional here for injected fakes.
 */
export interface ListedUsersPage {
  users?: ListedUser[] | null;
  nextPage?: number | null;
}

export type ListUsers = (params: {
  page: number;
  perPage: number;
}) => Promise<{ data: ListedUsersPage | null; error: { message?: string } | null }>;

export const LOOKUP_PER_PAGE = 1000;
/**
 * Hard bound on the scan. Also the guard against a known auth-js quirk: its
 * `Link`-header parser keeps only the FIRST digit of the page number
 * (`substring(0, 1)`), so past page 9 `nextPage` can point backwards and the
 * cursor-driven loop would spin. The cap turns that into a clean failure.
 */
export const MAX_LOOKUP_PAGES = 200;

export type FindUserByEmailResult =
  | { ok: true; user: ListedUser | null }
  | { ok: false; error: string };

/**
 * Fail-CLOSED by design. Three distinct outcomes, never collapsed:
 *   - `{ ok: true,  user }`  → the address has an account
 *   - `{ ok: true,  null }`  → the scan completed and found nothing
 *   - `{ ok: false, error }` → the scan could not complete (API error or page
 *     cap hit). Callers must NOT read this as "no account": doing so would
 *     silently drop a real user's login email.
 */
export async function findUserByEmail(
  listUsers: ListUsers,
  email: string,
): Promise<FindUserByEmailResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: true, user: null };

  let page: number | null = 1;
  let scanned = 0;

  while (page !== null) {
    if (scanned >= MAX_LOOKUP_PAGES) {
      return { ok: false, error: `lookup truncated after ${MAX_LOOKUP_PAGES} pages` };
    }

    const { data, error } = await listUsers({ page, perPage: LOOKUP_PER_PAGE });
    if (error) {
      return { ok: false, error: error.message ?? "listUsers failed" };
    }
    scanned++;

    const match = data?.users?.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return { ok: true, user: match };

    // Trust the API cursor when present (robust to server-side perPage
    // clamping); otherwise stop on a short page. A non-positive cursor ends
    // the scan rather than restarting it.
    const next = data?.nextPage;
    if (next !== undefined) {
      page = typeof next === "number" && next > 0 ? next : null;
    } else {
      page = (data?.users?.length ?? 0) < LOOKUP_PER_PAGE ? null : page + 1;
    }
  }

  return { ok: true, user: null };
}
