import { describe, expect, it } from "vitest";
import { mapSupabaseError } from "../errorMapping";

// Le stringhe qui sono quelle REALI di GoTrue, non parafrasi: il mapper le
// incontra cosi'. Se il server cambia i testi, questi test diventano il posto
// in cui accorgersene.
const OTP_EXPIRED_API = "Token has expired or is invalid";
const OTP_EXPIRED_LINK = "Email link is invalid or has expired";
const OTP_EXPIRED_CODE = "otp_expired";
const SIGNUP_DISABLED = "Signups not allowed for this instance";
const RATE_LIMITED = "For security purposes, you can only request this after 51 seconds.";

describe("mapSupabaseError — accesso passwordless", () => {
  it("codice o link scaduto → invito a richiederne uno nuovo", () => {
    for (const raw of [OTP_EXPIRED_API, OTP_EXPIRED_LINK, OTP_EXPIRED_CODE]) {
      expect(mapSupabaseError(raw)).toBe(
        "Codice o link non più valido. Richiedi un nuovo accesso.",
      );
    }
  });

  // L'ORDINE della tabella e' il contratto: la voce generica
  // /token.*(expired|invalid)/ direbbe «Sessione scaduta», che a chi ha appena
  // digitato un codice non spiega nulla. Se qualcuno sposta le voci
  // passwordless sotto le generiche, questo test cade.
  it("la voce specifica vince sulla generica «Sessione scaduta»", () => {
    const message = mapSupabaseError(OTP_EXPIRED_API);
    expect(message).not.toMatch(/sessione scaduta/i);
    expect(message).toMatch(/richiedi un nuovo accesso/i);
  });

  it("registrazioni chiuse → dice che si entra su invito", () => {
    expect(mapSupabaseError(SIGNUP_DISABLED)).toMatch(/invito del coach/i);
    // La forma vecchia («temporaneamente disabilitate») non deve tornare: non
    // e' temporaneo, e' il modello di accesso.
    expect(mapSupabaseError(SIGNUP_DISABLED)).not.toMatch(/temporaneamente/i);
  });

  it("rate limit GoTrue → dire di attendere, non «riprova piu' tardi»", () => {
    expect(mapSupabaseError(RATE_LIMITED)).toMatch(/attendi/i);
  });
});

describe("mapSupabaseError — regressione sulle voci preesistenti", () => {
  it("credenziali password invariate", () => {
    expect(mapSupabaseError("Invalid login credentials")).toBe("Credenziali non valide. Riprova.");
  });

  it("sessione JWT scaduta resta la voce di sessione", () => {
    expect(mapSupabaseError("JWT expired")).toMatch(/sessione scaduta/i);
  });

  it("RLS resta un problema di permessi", () => {
    expect(mapSupabaseError("new row violates row-level security policy")).toMatch(/permessi/i);
  });
});

describe("mapSupabaseError — forme dell'input", () => {
  it("accetta stringa, Error e oggetto con message", () => {
    expect(mapSupabaseError(OTP_EXPIRED_CODE)).toMatch(/richiedi un nuovo accesso/i);
    expect(mapSupabaseError(new Error(OTP_EXPIRED_CODE))).toMatch(/richiedi un nuovo accesso/i);
    expect(mapSupabaseError({ message: OTP_EXPIRED_CODE })).toMatch(/richiedi un nuovo accesso/i);
  });

  it("input non riconosciuto → messaggio generico, mai la stringa cruda", () => {
    const raw = "PGRST202 schema cache miss on function xyz";
    const message = mapSupabaseError(raw);
    expect(message).toBe("Si è verificato un errore. Riprova più tardi.");
    expect(message).not.toContain("PGRST202");
  });

  it("null e undefined non fanno esplodere il mapper", () => {
    expect(mapSupabaseError(null)).toBe("Si è verificato un errore. Riprova più tardi.");
    expect(mapSupabaseError(undefined)).toBe("Si è verificato un errore. Riprova più tardi.");
  });
});
