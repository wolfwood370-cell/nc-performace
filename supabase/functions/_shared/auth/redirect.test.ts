// supabase/functions/_shared/auth/redirect.test.ts
// Pins for the anti open-redirect guard: path/query preserved on allowed
// hosts, exact-hostname matching (no suffix match), scheme rules, and total
// behaviour on garbage input. Hosts are injected — no Deno.env.

import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import { isAllowedRedirectUrl } from "./redirect.ts";
import { DEFAULT_ALLOWED_HOSTS } from "../origins.ts";

const HOSTS = DEFAULT_ALLOWED_HOSTS;

Deno.test("ammette /attiva sui domini di progetto, con path e query", () => {
  for (const host of HOSTS) {
    assertEquals(isAllowedRedirectUrl(`https://${host}/attiva`, HOSTS), true);
    assertEquals(isAllowedRedirectUrl(`https://${host}/attiva?next=%2Fathlete`, HOSTS), true);
  }
});

Deno.test("ammette localhost http (parita' dev) su qualsiasi porta", () => {
  assertEquals(isAllowedRedirectUrl("http://localhost:8080/attiva", HOSTS), true);
  assertEquals(isAllowedRedirectUrl("http://127.0.0.1:5173/attiva", HOSTS), true);
});

Deno.test("host esatto: nessun match per suffisso ne' per sottodominio", () => {
  assertFalse(isAllowedRedirectUrl("https://evil.vercel.app/attiva", HOSTS));
  assertFalse(isAllowedRedirectUrl("https://nc-performace-mu.vercel.app.evil.test/", HOSTS));
  assertFalse(isAllowedRedirectUrl("https://evil.nc-performace-mu.vercel.app/", HOSTS));
});

Deno.test("dominio arbitrario rifiutato anche se l'host lecito compare altrove", () => {
  assertFalse(isAllowedRedirectUrl("https://evil.test/attiva", HOSTS));
  // Userinfo trick: l'host reale e' evil.test, non il dominio di progetto.
  assertFalse(isAllowedRedirectUrl("https://nc-performace-mu.vercel.app@evil.test/attiva", HOSTS));
  assertFalse(isAllowedRedirectUrl("https://evil.test/?x=nc-performace-mu.vercel.app", HOSTS));
});

Deno.test("http non-localhost rifiutato (https obbligatorio fuori dal dev)", () => {
  assertFalse(isAllowedRedirectUrl("http://nc-performace-mu.vercel.app/attiva", HOSTS));
});

Deno.test("schemi con origin opaca rifiutati", () => {
  assertFalse(isAllowedRedirectUrl("javascript:alert(1)", HOSTS));
  assertFalse(isAllowedRedirectUrl("data:text/html,<script>alert(1)</script>", HOSTS));
  assertFalse(isAllowedRedirectUrl("file:///etc/passwd", HOSTS));
});

Deno.test("input malformato → false, mai un throw", () => {
  for (const bad of ["", "   ", "not a url", "//nc-performace-mu.vercel.app/attiva", "/attiva"]) {
    assertFalse(isAllowedRedirectUrl(bad, HOSTS));
  }
});

Deno.test("host in maiuscolo normalizzato dall'URL e ammesso", () => {
  assertEquals(isAllowedRedirectUrl("https://NC-PERFORMACE-MU.VERCEL.APP/attiva", HOSTS), true);
});

Deno.test("lista vuota → nessun host https ammesso, localhost resta ammesso", () => {
  assertFalse(isAllowedRedirectUrl("https://nc-performace-mu.vercel.app/attiva", []));
  assertEquals(isAllowedRedirectUrl("http://localhost:8080/attiva", []), true);
});
