import { describe, expect, it } from "vitest";
import { describeLoginLinkError } from "../loginLinkError";

describe("describeLoginLinkError", () => {
  it("429 dice di ASPETTARE, non «riprova piu' tardi» generico", () => {
    const message = describeLoginLinkError(429);
    expect(message).toMatch(/attendi/i);
    expect(message).toMatch(/minut/i);
  });

  it("400 indica l'indirizzo, non un guasto del server", () => {
    expect(describeLoginLinkError(400)).toMatch(/email non valido/i);
  });

  it("guasti server → messaggio generico, mai dettagli interni", () => {
    for (const status of [500, 502, 503]) {
      const message = describeLoginLinkError(status);
      expect(message).toMatch(/riprova/i);
      expect(message).not.toMatch(/resend|supabase|generateLink|token/i);
    }
  });

  it("nessuna risposta → problema di rete, non di account", () => {
    expect(describeLoginLinkError(null)).toMatch(/connessione/i);
  });

  // Anti-enumerazione anche negli errori: nessun messaggio puo' suggerire se
  // l'indirizzo abbia o non abbia un account.
  it("nessun messaggio rivela l'esistenza dell'account", () => {
    for (const status of [null, 400, 429, 500, 502]) {
      expect(describeLoginLinkError(status)).not.toMatch(
        /non registrat|non esiste|sconosciut|nessun account|utente non trovato/i,
      );
    }
  });
});
