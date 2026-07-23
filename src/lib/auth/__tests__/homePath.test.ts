import { describe, expect, it } from "vitest";
import { pickHomePath } from "../homePath";

describe("pickHomePath", () => {
  it("manda il coach alla sua home, qualunque sia l'onboarding", () => {
    expect(pickHomePath({ role: "coach", onboardingCompleted: true })).toBe("/coach");
    expect(pickHomePath({ role: "coach", onboardingCompleted: false })).toBe("/coach");
    expect(pickHomePath({ role: "coach", onboardingCompleted: null })).toBe("/coach");
  });

  it("manda l'atleta onboardato all'app atleta", () => {
    expect(pickHomePath({ role: "athlete", onboardingCompleted: true })).toBe("/athlete");
  });

  // Il motivo per cui questo modulo esiste: prima si passava da /athlete e la
  // guardia rimbalzava a /onboarding — due redirect e un lampo della shell
  // sbagliata proprio a chi arriva dal link d'invito.
  it("manda l'atleta NON onboardato direttamente a /onboarding, senza rimbalzo", () => {
    expect(pickHomePath({ role: "athlete", onboardingCompleted: false })).toBe("/onboarding");
    expect(pickHomePath({ role: "athlete", onboardingCompleted: null })).toBe("/onboarding");
    expect(pickHomePath({ role: "athlete", onboardingCompleted: undefined })).toBe("/onboarding");
  });

  it("onboarding_completed e' vero solo se e' esattamente true", () => {
    // Un valore non booleano dal DB non deve valere come «onboardato».
    expect(pickHomePath({ role: "athlete", onboardingCompleted: "true" as never })).toBe(
      "/onboarding",
    );
    expect(pickHomePath({ role: "athlete", onboardingCompleted: 1 as never })).toBe("/onboarding");
  });

  it("ruolo assente o sconosciuto → /onboarding, mai /auth", () => {
    for (const role of [null, undefined, "", "admin", "guest"]) {
      const path = pickHomePath({ role, onboardingCompleted: true });
      expect(path).toBe("/onboarding");
      expect(path).not.toBe("/auth");
    }
  });
});
