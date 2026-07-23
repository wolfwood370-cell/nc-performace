import { describe, expect, it } from "vitest";
import {
  isCompleteOtp,
  LOGIN_OTP_TYPE,
  normalizeOtpInput,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
} from "../otp";

describe("contratto del codice OTP", () => {
  // Pin LETTERALE, non derivato: 'email' e' il tipo che la documentazione
  // Supabase mostra per i codici di signInWithOtp ed e' stato RIFIUTATO dal
  // server nello smoke della 1a. Se qualcuno "sistema" questo valore, deve
  // rompersi un test, non il login in produzione.
  it("il tipo di verifica e' magiclink, non email", () => {
    expect(LOGIN_OTP_TYPE).toBe("magiclink");
  });

  // La lunghezza e' configurazione GoTrue (6-10), non una costante nostra:
  // questo progetto emette 8 cifre. Un maxLength=6 troncherebbe il codice.
  it("accetta l'intero intervallo GoTrue, 6-10 cifre", () => {
    expect(OTP_MIN_LENGTH).toBe(6);
    expect(OTP_MAX_LENGTH).toBe(10);
  });
});

describe("normalizeOtpInput", () => {
  it("tiene solo le cifre", () => {
    expect(normalizeOtpInput("93391701")).toBe("93391701");
    expect(normalizeOtpInput("9339 1701")).toBe("93391701");
    expect(normalizeOtpInput("9339-1701")).toBe("93391701");
    expect(normalizeOtpInput(" 933\n917\t01 ")).toBe("93391701");
  });

  it("regge lo spazio non separabile che arriva dai client di posta", () => {
    expect(normalizeOtpInput("9339 1701")).toBe("93391701");
  });

  it("tronca oltre il massimo, mai sotto", () => {
    expect(normalizeOtpInput("12345678901234")).toBe("1234567890");
    expect(normalizeOtpInput("123456")).toBe("123456");
  });

  it("input senza cifre → stringa vuota, mai un throw", () => {
    expect(normalizeOtpInput("")).toBe("");
    expect(normalizeOtpInput("abc-def")).toBe("");
  });
});

describe("isCompleteOtp", () => {
  it("vero da 6 a 10 cifre", () => {
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("93391701")).toBe(true);
    expect(isCompleteOtp("1234567890")).toBe(true);
  });

  it("falso sotto il minimo", () => {
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("")).toBe(false);
  });

  it("valuta le CIFRE, non i caratteri battuti", () => {
    // 8 cifre con separatori resta un codice completo.
    expect(isCompleteOtp("9339 1701")).toBe(true);
    // 5 cifre con rumore resta incompleto.
    expect(isCompleteOtp("9-3-3-9-1")).toBe(false);
  });
});
