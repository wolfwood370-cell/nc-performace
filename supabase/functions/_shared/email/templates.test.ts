// supabase/functions/_shared/email/templates.test.ts
// Pins for the pure template module: exact subjects, HTML-escaping of every
// interpolated value (name AND actionLink), href integrity, determinism,
// brand tokens, per-email footer copy. No I/O — see templates.ts header.

import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { escapeHtml, inviteEmail, loginLinkEmail, recoveryEmail } from "./templates.ts";

// Amp-free link so the raw form can be pinned verbatim inside href="...".
const LINK = "https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/verify?token=abc123";
// Link with & separators: valid HTML requires &amp; in attributes and text.
const LINK_AMP = "https://example.test/verify?token=abc&type=invite&redirect_to=https://app.test";
const LINK_AMP_ESCAPED =
  "https://example.test/verify?token=abc&amp;type=invite&amp;redirect_to=https://app.test";

Deno.test("escapeHtml: escapa tutti e cinque i caratteri speciali", () => {
  assertEquals(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

Deno.test("inviteEmail: subject esatto col nome", () => {
  const { subject } = inviteEmail({ firstName: "Marco", actionLink: LINK });
  assertEquals(subject, "Marco, il tuo coach ti ha invitato su NC Performance Hub");
});

Deno.test("recoveryEmail: subject esatto", () => {
  const { subject } = recoveryEmail({ actionLink: LINK });
  assertEquals(subject, "Reimposta la tua password — NC Performance Hub");
});

Deno.test("inviteEmail: markup nel nome escapato nel HTML (niente <script>)", () => {
  const { html } = inviteEmail({
    firstName: "<script>alert(1)</script>",
    actionLink: LINK,
  });
  assertFalse(html.includes("<script>"));
  assertStringIncludes(html, "Ciao &lt;script&gt;alert(1)&lt;/script&gt;,");
});

Deno.test("inviteEmail: apostrofo — raw nel subject (testo puro), escapato nel HTML", () => {
  const { subject, html } = inviteEmail({ firstName: "D'Angelo", actionLink: LINK });
  assertStringIncludes(subject, "D'Angelo, il tuo coach");
  assertStringIncludes(html, "Ciao D&#39;Angelo,");
});

Deno.test("inviteEmail: saluto col nome nel titolo", () => {
  const { html } = inviteEmail({ firstName: "Marco", actionLink: LINK });
  assertStringIncludes(html, ">Ciao Marco,</h1>");
});

Deno.test("href = actionLink esatto quando il link non contiene &", () => {
  for (const html of [
    inviteEmail({ firstName: "Marco", actionLink: LINK }).html,
    recoveryEmail({ actionLink: LINK }).html,
    loginLinkEmail({ actionLink: LINK, code: "123456" }).html,
  ]) {
    assertStringIncludes(html, `href="${LINK}"`);
  }
});

Deno.test("actionLink con &: &amp; in href e nel testo fallback, mai la forma raw", () => {
  for (const html of [
    inviteEmail({ firstName: "Marco", actionLink: LINK_AMP }).html,
    recoveryEmail({ actionLink: LINK_AMP }).html,
    loginLinkEmail({ actionLink: LINK_AMP, code: "123456" }).html,
  ]) {
    assertStringIncludes(html, `href="${LINK_AMP_ESCAPED}"`);
    // Escaped link appears exactly 3 times: CTA href, fallback href, fallback text.
    assertEquals(html.split(LINK_AMP_ESCAPED).length - 1, 3);
    assertFalse(html.includes(LINK_AMP));
  }
});

Deno.test("determinismo: due run stesso input → subject e html byte-identici", () => {
  const a = inviteEmail({ firstName: "Marco", actionLink: LINK });
  const b = inviteEmail({ firstName: "Marco", actionLink: LINK });
  assertEquals(a.subject, b.subject);
  assertEquals(a.html, b.html);
  const c = recoveryEmail({ actionLink: LINK });
  const d = recoveryEmail({ actionLink: LINK });
  assertEquals(c.subject, d.subject);
  assertEquals(c.html, d.html);
});

Deno.test("brand NC: wordmark, navy, accent, lang/charset; niente viola legacy", () => {
  for (const html of [
    inviteEmail({ firstName: "Marco", actionLink: LINK }).html,
    recoveryEmail({ actionLink: LINK }).html,
    loginLinkEmail({ actionLink: LINK, code: "123456" }).html,
  ]) {
    assertStringIncludes(html, "NC TRAINING SYSTEMS");
    assertStringIncludes(html, "#003e62");
    assertStringIncludes(html, "#226fa3");
    assertStringIncludes(html, `<html lang="it">`);
    assertStringIncludes(html, `<meta charset="utf-8">`);
    assertFalse(html.includes("#7c3aed"));
  }
});

Deno.test("footer differenziato: motivo e chiusura propri di ogni email", () => {
  const invite = inviteEmail({ firstName: "Marco", actionLink: LINK }).html;
  const recovery = recoveryEmail({ actionLink: LINK }).html;

  assertStringIncludes(invite, "Ricevi questa email perché un coach ti ha invitato");
  assertStringIncludes(invite, "Se non ti aspettavi questa email, puoi ignorarla.");
  assertFalse(invite.includes("puoi ignorarla in tutta sicurezza"));

  assertStringIncludes(
    recovery,
    "Ricevi questa email perché è stato richiesto un recupero password",
  );
  assertStringIncludes(recovery, "Se non l'hai richiesta tu, puoi ignorarla in tutta sicurezza.");
  assertFalse(recovery.includes("Se non ti aspettavi questa email"));

  const login = loginLinkEmail({ actionLink: LINK, code: "123456" }).html;
  assertStringIncludes(login, "Ricevi questa email perché è stato richiesto un accesso");
  assertStringIncludes(login, "Se non l'hai richiesto tu, puoi ignorarla in tutta sicurezza.");
  assertFalse(login.includes("un recupero password"));
  assertFalse(login.includes("un coach ti ha invitato"));

  // Shared middle line present in all three.
  assertStringIncludes(invite, "NC Training Systems · Performance Hub");
  assertStringIncludes(recovery, "NC Training Systems · Performance Hub");
  assertStringIncludes(login, "NC Training Systems · Performance Hub");
});

Deno.test("recoveryEmail: CTA e nota di scadenza presenti", () => {
  const { html } = recoveryEmail({ actionLink: LINK });
  assertStringIncludes(html, ">Reimposta password</a>");
  assertStringIncludes(html, "il link scade a breve");
});

Deno.test("inviteEmail: CTA «Accetta l'invito» presente", () => {
  const { html } = inviteEmail({ firstName: "Marco", actionLink: LINK });
  assertStringIncludes(html, ">Accetta l'invito</a>");
  assert(html.includes("<strong>NC Performance Hub</strong>"));
});

Deno.test("loginLinkEmail: subject esatto e codice MAI nel subject", () => {
  const { subject } = loginLinkEmail({ actionLink: LINK, code: "482915" });
  assertEquals(subject, "Il tuo accesso a NC Performance Hub");
  assertFalse(subject.includes("482915"));
});

Deno.test("loginLinkEmail: CTA «Accedi» + codice in monospace nel corpo", () => {
  const { html } = loginLinkEmail({ actionLink: LINK, code: "482915" });
  assertStringIncludes(html, ">Accedi</a>");
  assertStringIncludes(html, "Oppure inserisci questo codice nell'app:");
  assertStringIncludes(html, "monospace");
  assertStringIncludes(html, ">482915</span>");
});

// Invariante di fetta: nessuna password viaggia — né come valore né come
// concetto — nell'email di accesso passwordless. Pin non vacuo: fallisce
// se qualcuno reintroduce un campo/menzione password in questo template.
Deno.test("loginLinkEmail: la parola «password» non compare da nessuna parte", () => {
  const { subject, html } = loginLinkEmail({ actionLink: LINK, code: "482915" });
  assertFalse(/password/i.test(subject));
  assertFalse(/password/i.test(html));
});

Deno.test("loginLinkEmail: markup nel codice escapato (niente <script>)", () => {
  const { html } = loginLinkEmail({
    actionLink: LINK,
    code: "<script>alert(1)</script>",
  });
  assertFalse(html.includes("<script>"));
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
});

// La lunghezza del codice e' una impostazione di progetto (GoTrue 6-10 cifre):
// questo progetto ne emette 8, verificato live il 2026-07-22. Il template non
// deve dipendere dal conteggio, ne' troncare.
Deno.test("loginLinkEmail: rende il codice qualunque sia la lunghezza (6, 8, 10)", () => {
  for (const code of ["482915", "93391701", "1234567890"]) {
    const { html } = loginLinkEmail({ actionLink: LINK, code });
    assertStringIncludes(html, `>${code}</span>`);
  }
});

Deno.test("loginLinkEmail: determinismo — due run byte-identici", () => {
  const a = loginLinkEmail({ actionLink: LINK, code: "482915" });
  const b = loginLinkEmail({ actionLink: LINK, code: "482915" });
  assertEquals(a.subject, b.subject);
  assertEquals(a.html, b.html);
});
