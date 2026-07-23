import { describe, expect, it } from "vitest";
import { describeActivation, parseAuthCallback, type AuthCallbackParams } from "../authCallback";

/** Frammento reale di un magic link riuscito (flusso implicit). */
const OK_HASH =
  "#access_token=eyJhbGci.abc&expires_at=1784000000&expires_in=3600" +
  "&refresh_token=xyz123&token_type=bearer&type=magiclink";

/** Frammento reale di un link scaduto o gia' usato. */
const EXPIRED_HASH =
  "#error=access_denied&error_code=otp_expired" +
  "&error_description=Email+link+is+invalid+or+has+expired";

const empty = (): AuthCallbackParams => parseAuthCallback("", "");

describe("parseAuthCallback", () => {
  it("riconosce i token del flusso implicit nel fragment", () => {
    const params = parseAuthCallback(OK_HASH, "");
    expect(params.hasTokens).toBe(true);
    expect(params.error).toBeNull();
    expect(params.errorCode).toBeNull();
  });

  it("legge errore, codice e descrizione decodificata dal fragment", () => {
    const params = parseAuthCallback(EXPIRED_HASH, "");
    expect(params.hasTokens).toBe(false);
    expect(params.error).toBe("access_denied");
    expect(params.errorCode).toBe("otp_expired");
    // '+' decodificato: la descrizione deve essere leggibile, non URL-encoded.
    expect(params.errorDescription).toBe("Email link is invalid or has expired");
  });

  // Quale dei due porti l'errore dipende dal flusso: leggerne uno solo e' il
  // modo in cui la pagina resta muta proprio nel caso che deve spiegare.
  it("legge l'errore anche dalla query string", () => {
    const params = parseAuthCallback("", "?error=access_denied&error_code=otp_expired");
    expect(params.error).toBe("access_denied");
    expect(params.errorCode).toBe("otp_expired");
  });

  it("legge il code PKCE dalla query", () => {
    expect(parseAuthCallback("", "?code=abc-123").code).toBe("abc-123");
  });

  it("tollera il prefisso # / ? assente o presente", () => {
    expect(parseAuthCallback(OK_HASH.slice(1), "").hasTokens).toBe(true);
    expect(parseAuthCallback("", "code=abc").code).toBe("abc");
  });

  it("input vuoto o spazzatura → tutto nullo, mai un throw", () => {
    expect(empty()).toEqual({
      hasTokens: false,
      code: null,
      error: null,
      errorCode: null,
      errorDescription: null,
    });
    expect(parseAuthCallback("#", "?").hasTokens).toBe(false);
    expect(parseAuthCallback("#&&=&", "?=&").error).toBeNull();
  });

  it("valore vuoto non conta come presente", () => {
    expect(parseAuthCallback("#access_token=", "").hasTokens).toBe(false);
    expect(parseAuthCallback("", "?code=").code).toBeNull();
  });
});

describe("describeActivation", () => {
  it("sessione presente → ready", () => {
    expect(describeActivation({ params: empty(), hasSession: true, settled: false })).toBe("ready");
  });

  // Chi e' gia' dentro va lasciato passare, non redarguito per un link vecchio.
  it("la sessione vince su un errore stantio nel fragment", () => {
    expect(
      describeActivation({
        params: parseAuthCallback(EXPIRED_HASH, ""),
        hasSession: true,
        settled: true,
      }),
    ).toBe("ready");
  });

  it("otp_expired → expired", () => {
    expect(
      describeActivation({
        params: parseAuthCallback(EXPIRED_HASH, ""),
        hasSession: false,
        settled: false,
      }),
    ).toBe("expired");
  });

  it("expired riconosciuto anche dalla sola descrizione", () => {
    expect(
      describeActivation({
        params: parseAuthCallback("#error_description=Token+has+expired", ""),
        hasSession: false,
        settled: false,
      }),
    ).toBe("expired");
  });

  it("errore senza scadenza → denied", () => {
    expect(
      describeActivation({
        params: parseAuthCallback("#error=access_denied&error_code=validation_failed", ""),
        hasSession: false,
        settled: false,
      }),
    ).toBe("denied");
  });

  // L'errore e' definitivo: aspettare su di esso e' ciò che produceva la
  // schermata muta che questa fetta elimina.
  it("l'errore non aspetta il settled", () => {
    const params = parseAuthCallback(EXPIRED_HASH, "");
    expect(describeActivation({ params, hasSession: false, settled: false })).toBe("expired");
    expect(describeActivation({ params, hasSession: false, settled: true })).toBe("expired");
  });

  it("token presenti e nulla ancora deciso → pending", () => {
    expect(
      describeActivation({
        params: parseAuthCallback(OK_HASH, ""),
        hasSession: false,
        settled: false,
      }),
    ).toBe("pending");
  });

  it("nessun token e non ancora settled → pending, non invalid", () => {
    expect(describeActivation({ params: empty(), hasSession: false, settled: false })).toBe(
      "pending",
    );
  });

  it("token c'erano ma la sessione non e' nata → denied", () => {
    expect(
      describeActivation({
        params: parseAuthCallback(OK_HASH, ""),
        hasSession: false,
        settled: true,
      }),
    ).toBe("denied");
    expect(
      describeActivation({
        params: parseAuthCallback("", "?code=abc"),
        hasSession: false,
        settled: true,
      }),
    ).toBe("denied");
  });

  it("pagina aperta a mano, nessuna credenziale → invalid", () => {
    expect(describeActivation({ params: empty(), hasSession: false, settled: true })).toBe(
      "invalid",
    );
  });
});
