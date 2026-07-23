// ============================================
// SUPABASE ERROR → ITALIAN USER MESSAGE MAPPER
// Intercepts common Auth/DB errors and returns
// friendly Italian messages for the end user.
// ============================================

// ORDER IS PART OF THE CONTRACT: the first match wins, so the specific
// passwordless entries must stay ABOVE the generic auth ones. Moving them
// below would silently hand an expired sign-in code the wrong message
// ("Sessione scaduta") — pinned by errorMapping.test.ts.
const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  // Passwordless sign-in — real GoTrue strings, verified against the live
  // responses (both the API message and the `error_code` of the redirect).
  {
    pattern: /otp[_ ]expired|email link is invalid or has expired|token has expired or is invalid/i,
    message: "Codice o link non più valido. Richiedi un nuovo accesso.",
  },
  {
    pattern: /signups? not allowed|signup is disabled|signup_disabled/i,
    message: "Le registrazioni sono chiuse: si entra su invito del coach.",
  },
  {
    pattern: /for security purposes.*(after|second)/i,
    message: "Troppi tentativi ravvicinati. Attendi qualche istante e riprova.",
  },

  // Auth errors
  { pattern: /invalid login credentials/i, message: "Credenziali non valide. Riprova." },
  {
    pattern: /email not confirmed/i,
    message: "Email non confermata. Controlla la tua casella di posta.",
  },
  { pattern: /user already registered/i, message: "Utente già registrato con questa email." },
  {
    pattern: /password should be at least/i,
    message: "La password deve contenere almeno 6 caratteri.",
  },
  {
    pattern: /email rate limit exceeded/i,
    message: "Troppe richieste. Riprova tra qualche minuto.",
  },
  { pattern: /rate limit/i, message: "Troppe richieste. Attendi qualche secondo." },
  {
    pattern: /token.*(expired|invalid)/i,
    message: "Sessione scaduta. Effettua nuovamente l'accesso.",
  },
  { pattern: /jwt expired/i, message: "Sessione scaduta. Effettua nuovamente l'accesso." },
  {
    pattern: /refresh_token_not_found/i,
    message: "Sessione non trovata. Effettua nuovamente l'accesso.",
  },
  { pattern: /user not found/i, message: "Utente non trovato." },
  { pattern: /email.*required/i, message: "L'indirizzo email è obbligatorio." },
  { pattern: /password.*required/i, message: "La password è obbligatoria." },
  { pattern: /unable to validate email/i, message: "Indirizzo email non valido." },
  {
    pattern: /new password should be different/i,
    message: "La nuova password deve essere diversa da quella attuale.",
  },

  // DB / RLS errors
  { pattern: /row-level security/i, message: "Non hai i permessi per questa operazione." },
  { pattern: /permission denied/i, message: "Accesso negato. Permessi insufficienti." },
  { pattern: /violates.*unique.*constraint/i, message: "Questo elemento esiste già." },
  {
    pattern: /violates.*foreign.*key/i,
    message: "Operazione non consentita: riferimento non valido.",
  },
  { pattern: /violates.*not-null/i, message: "Alcuni campi obbligatori non sono compilati." },
  { pattern: /duplicate key/i, message: "Questo elemento esiste già nel sistema." },

  // Network errors
  { pattern: /fetch.*failed/i, message: "Errore di connessione. Verifica la rete e riprova." },
  { pattern: /network.*error/i, message: "Errore di rete. Controlla la connessione." },
  { pattern: /timeout/i, message: "La richiesta ha impiegato troppo tempo. Riprova." },

  // Storage errors
  { pattern: /payload too large/i, message: "File troppo grande. Dimensione massima superata." },
  { pattern: /bucket not found/i, message: "Errore di archiviazione. Contatta il supporto." },
];

/**
 * Maps a raw Supabase/API error message to a friendly Italian message.
 * Falls back to a generic message if no match is found.
 */
export function mapSupabaseError(error: unknown): string {
  let message: string;
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    message = (error as { message: string }).message;
  } else {
    message = String(error);
  }

  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(message)) {
      return entry.message;
    }
  }

  // Generic fallback
  return "Si è verificato un errore. Riprova più tardi.";
}
