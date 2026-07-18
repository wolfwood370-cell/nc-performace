// supabase/functions/_shared/apiKeys.test.ts
// pickKey is pure (raw string in, key out): every branch is testable without
// Deno.env. All key values below are OBVIOUSLY FAKE placeholders — the
// anti-leak pins assert that values never reach warn/error messages.

import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1";
import { pickKey, timingSafeEqualStr } from "./apiKeys.ts";

/** Captures console.warn output for the duration of `fn`. */
function withCapturedWarn(fn: () => void): string[] {
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warns;
}

Deno.test("pickKey: 'default' presente → ritorna il suo valore (senza warn)", () => {
  const raw = JSON.stringify({ default: "chiave-finta-default", altra: "chiave-finta-altra" });
  let result = "";
  const warns = withCapturedWarn(() => {
    result = pickKey(raw, "ENV_TEST");
  });
  assertEquals(result, "chiave-finta-default");
  assertEquals(warns.length, 0);
});

Deno.test("pickKey: 'default' vince anche quando NON è la prima entry", () => {
  // Kills the first-entry mutation: with insertion order {legacy, default},
  // picking entries[0] instead of the 'default' entry must fail this pin.
  const raw = JSON.stringify({ legacy: "chiave-finta-legacy", default: "chiave-finta-default" });
  assertEquals(pickKey(raw, "ENV_TEST"), "chiave-finta-default");
});

Deno.test(
  "pickKey: 'default' assente con UNA sola chiave → usa quella e logga solo il NOME",
  () => {
    const raw = JSON.stringify({ prod: "valore-finto-prod" });
    let result = "";
    const warns = withCapturedWarn(() => {
      result = pickKey(raw, "ENV_TEST");
    });
    assertEquals(result, "valore-finto-prod");
    assertEquals(warns.length, 1);
    assert(warns[0].includes("'prod'"), "il warn deve citare il NOME della chiave");
    assert(warns[0].includes("ENV_TEST"), "il warn deve citare la env");
    assertFalse(warns[0].includes("valore-finto-prod"), "il warn NON deve mai contenere il valore");
  },
);

Deno.test(
  "pickKey: 'default' assente con più chiavi → errore che elenca i NOMI, mai i valori",
  () => {
    const raw = JSON.stringify({ prima: "valore-finto-1", seconda: "valore-finto-2" });
    const err = assertThrows(() => pickKey(raw, "ENV_TEST"), Error);
    assert(err.message.includes("prima"), "il messaggio deve elencare il nome 'prima'");
    assert(err.message.includes("seconda"), "il messaggio deve elencare il nome 'seconda'");
    assertFalse(err.message.includes("valore-finto-1"), "mai il valore nel messaggio");
    assertFalse(err.message.includes("valore-finto-2"), "mai il valore nel messaggio");
  },
);

Deno.test("pickKey: env mancante → errore col nome della env", () => {
  const err = assertThrows(() => pickKey(undefined, "SUPABASE_SECRET_KEYS_TEST"), Error);
  assert(err.message.includes("SUPABASE_SECRET_KEYS_TEST"));
  assert(err.message.includes("mancante"));
});

Deno.test("pickKey: JSON invalido → errore senza eco del contenuto grezzo", () => {
  const err = assertThrows(() => pickKey("sb-raw-finto-non-json", "ENV_TEST"), Error);
  assert(err.message.includes("ENV_TEST"));
  assertFalse(
    err.message.includes("sb-raw-finto-non-json"),
    "il raw non deve finire nel messaggio",
  );
});

Deno.test("pickKey: oggetto vuoto → errore 'nessuna chiave presente'", () => {
  const err = assertThrows(() => pickKey("{}", "ENV_TEST"), Error);
  assert(err.message.includes("nessuna chiave presente"));
});

Deno.test("pickKey: JSON valido ma non-oggetto (array/stringa) → errore", () => {
  assertThrows(() => pickKey('["chiave-finta"]', "ENV_TEST"), Error);
  assertThrows(() => pickKey('"chiave-finta"', "ENV_TEST"), Error);
});

Deno.test("pickKey: 'default' vuoto degrada — con un'altra sola chiave valida usa quella", () => {
  const raw = JSON.stringify({ default: "", unica: "valore-finto-unica" });
  let result = "";
  const warns = withCapturedWarn(() => {
    result = pickKey(raw, "ENV_TEST");
  });
  assertEquals(result, "valore-finto-unica");
  assertEquals(warns.length, 1);
});

Deno.test("pickKey: valori non-stringa ignorati come candidati", () => {
  const raw = JSON.stringify({ default: 42, unica: "valore-finto-ok" });
  let result = "";
  withCapturedWarn(() => {
    result = pickKey(raw, "ENV_TEST");
  });
  assertEquals(result, "valore-finto-ok");
});

Deno.test("timingSafeEqualStr: stringhe uguali → true", () => {
  assert(timingSafeEqualStr("segreto-finto-abc", "segreto-finto-abc"));
});

Deno.test("timingSafeEqualStr: stessa lunghezza ma diverse → false", () => {
  assertFalse(timingSafeEqualStr("segreto-finto-abc", "segreto-finto-abd"));
});

Deno.test("timingSafeEqualStr: lunghezze diverse → false", () => {
  assertFalse(timingSafeEqualStr("segreto-finto", "segreto-finto-lungo"));
});

Deno.test("timingSafeEqualStr: entrambe vuote → true", () => {
  assert(timingSafeEqualStr("", ""));
});
