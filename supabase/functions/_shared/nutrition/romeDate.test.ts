import { assertEquals } from "jsr:@std/assert@1";
import { romeDayFromDate } from "./romeDate.ts";

// Il pasto delle 00:30 italiane deve cadere nel giorno ITALIANO: il default
// DB (CURRENT_DATE, UTC) lo metterebbe nel giorno precedente.

Deno.test("estate (UTC+2): le 22:30Z sono gia' il giorno dopo a Roma", () => {
  assertEquals(romeDayFromDate(new Date("2026-07-16T22:30:00Z")), "2026-07-17");
  assertEquals(romeDayFromDate(new Date("2026-07-16T12:00:00Z")), "2026-07-16");
});

Deno.test("inverno (UTC+1): le 23:30Z sono il giorno dopo, le 22:30Z no", () => {
  assertEquals(romeDayFromDate(new Date("2026-01-10T23:30:00Z")), "2026-01-11");
  assertEquals(romeDayFromDate(new Date("2026-01-10T22:30:00Z")), "2026-01-10");
});
