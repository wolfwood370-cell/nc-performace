import { assertEquals } from "jsr:@std/assert@1";
import { isResourceMissing } from "./stripeErrors.ts";

Deno.test("riconosce SOLO code resource_missing", () => {
  assertEquals(isResourceMissing({ code: "resource_missing" }), true);
  assertEquals(isResourceMissing({ code: "resource_missing", statusCode: 404 }), true);
});

Deno.test("fail-closed: ogni altro errore NON e' 'gia' sparita'", () => {
  assertEquals(isResourceMissing({ code: "card_declined" }), false);
  // A bare 404 without the code must NOT be swallowed: it aborts the deletion.
  assertEquals(isResourceMissing({ statusCode: 404 }), false);
  assertEquals(isResourceMissing(new Error("resource_missing")), false);
  assertEquals(isResourceMissing("resource_missing"), false);
  assertEquals(isResourceMissing(null), false);
  assertEquals(isResourceMissing(undefined), false);
});
