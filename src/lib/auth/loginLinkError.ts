// =============================================================================
// src/lib/auth/loginLinkError.ts
// =============================================================================
// User-facing message for a failed `request-login-link` call.
//
// Status-based, not message-based: the edge function answers with generic
// bodies on purpose (anti-enumeration), so there is no useful string to match
// — the same pattern `InviteAthleteDialog` already uses for its invoke errors.
//
// The 429 deserves its own words: "riprova più tardi" on a rate limit sends the
// user in circles, and knowing to wait is not a hint about whether the account
// exists — the limit trips for any address.
// =============================================================================

/** `null` when the failure never reached the function (network/relay). */
export function describeLoginLinkError(status: number | null): string {
  if (status === null) return "Connessione non riuscita. Controlla la rete e riprova.";
  if (status === 429) return "Troppe richieste. Attendi qualche minuto prima di riprovare.";
  if (status === 400) return "Indirizzo email non valido.";
  return "Non è stato possibile inviare l'email. Riprova tra qualche minuto.";
}
