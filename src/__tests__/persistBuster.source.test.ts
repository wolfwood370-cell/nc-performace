// =============================================================================
// Source pin for the persisted-cache buster (slice update-safe, addendum
// 2026-08-26). Measured hole: `buster` removed from persistOptions failed no
// test and tsc stayed green — yet it is the ONLY defense of the 31 derived
// queries not (yet) moved to `select` (ULTIMO-RITORNO §9.2): a future slice
// touching main.tsx could drop the belt in silence.
//
// The pin reads the SOURCES (fs, not runtime — importing main.tsx would boot
// the whole app): the same mechanical pattern as the sessionRpe "casa unica"
// test. If a refactor renames these anchors on purpose, move the belt AND
// this pin together.
// =============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relFromSrc: string): string =>
  readFileSync(fileURLToPath(new URL(relFromSrc, import.meta.url)), "utf8");

describe("la cintura del buster è agganciata — pin sui sorgenti", () => {
  it("main.tsx passa buster: __BUILD_ID__ al persist della cache", () => {
    const main = read("../main.tsx");
    expect(
      /buster:\s*__BUILD_ID__/.test(main),
      "src/main.tsx non passa più `buster: __BUILD_ID__` in persistOptions: senza, la cache " +
        "IndexedDB del build precedente sopravvive al deploy e reidrata forme vecchie nei " +
        "componenti nuovi (difetto del 25/08) — è l'unica difesa delle query derivate non " +
        "ancora portate a select",
    ).toBe(true);
  });

  it("vite.config.ts inietta __BUILD_ID__ via define", () => {
    const cfg = read("../../vite.config.ts");
    expect(
      /__BUILD_ID__:\s*JSON\.stringify\(buildId\)/.test(cfg),
      "vite.config.ts non inietta più __BUILD_ID__ via define: il buster di main.tsx " +
        "resterebbe un identificatore non risolto (build rosso) o, peggio, una costante",
    ).toBe(true);
  });

  it("l'identità viene dal COMMIT, non dall'orologio (stessi asset a codice invariato)", () => {
    const cfg = read("../../vite.config.ts");
    expect(
      /VERCEL_GIT_COMMIT_SHA/.test(cfg) && /rev-parse/.test(cfg),
      "vite.config.ts non risolve più l'identità dal commit (VERCEL_GIT_COMMIT_SHA / " +
        "git rev-parse): un id per-build (orologio, random) fa cambiare nome a 124/143 " +
        "asset a ogni redeploy dello stesso codice (misurato 2026-08-26)",
    ).toBe(true);
    expect(
      /Date\.now\(\)/.test(cfg),
      "vite.config.ts è tornato all'orologio (Date.now()): il buster deve cambiare quando " +
        "cambia il codice e NON cambiare quando non cambia",
    ).toBe(false);
  });
});
