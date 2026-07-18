// supabase/functions/_shared/apiKeys.ts
// Single read-point for the new Supabase API keys (publishable/secret) that
// Supabase auto-injects as JSON objects {name -> key}. Fail-fast by design:
// a missing/ambiguous env THROWS — callers turn it into a clean 500 via the
// request-level try/catch. NEVER fall back to the legacy anon/service-role
// envs: those keys get disabled in Phase C, a silent fallback would run on a
// dead key. (Wording avoids the legacy env names on purpose: the migration
// acceptance grep must return zero matches, comments included.)

/**
 * Picks one API key from the raw JSON env value. Selection: the key named
 * `default` wins; without it a SINGLE remaining key is accepted (its NAME is
 * logged, never its value); anything else throws listing the NAMES only.
 * Only non-empty string values count as candidate keys.
 */
export function pickKey(raw: string | undefined, envName: string): string {
  if (!raw) {
    throw new Error(`${envName} mancante: creare le nuove API key nel Dashboard`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never echo `raw` back: it contains key material.
    throw new Error(`${envName} non è un JSON valido`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${envName} non è un oggetto {nome → chiave}`);
  }
  const entries = Object.entries(parsed as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );
  const defaultEntry = entries.find(([name]) => name === "default");
  if (defaultEntry) return defaultEntry[1];
  if (entries.length === 1) {
    console.warn(
      `[apiKeys] ${envName}: chiave 'default' assente, uso l'unica chiave '${entries[0][0]}'`,
    );
    return entries[0][1];
  }
  if (entries.length === 0) {
    throw new Error(`${envName}: nessuna chiave presente`);
  }
  const names = entries.map(([name]) => name).join(", ");
  throw new Error(`${envName}: nessuna chiave 'default'; presenti: ${names}`);
}

/** User-context key (same low privileges as the legacy anon key). */
export function publishableKey(): string {
  return pickKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "SUPABASE_PUBLISHABLE_KEYS");
}

/** Admin key (RLS bypass — replaces the legacy service role key). */
export function secretKey(): string {
  return pickKey(Deno.env.get("SUPABASE_SECRET_KEYS"), "SUPABASE_SECRET_KEYS");
}

/** Constant-time string comparison (leaks length only) for auth secrets. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
