// supabase/functions/_shared/auth/findUserByEmail.test.ts
// Pins for the read-only lookup: pagination (cursor and short-page fallback),
// case/space normalisation on BOTH sides, the three distinct outcomes, and the
// fail-closed behaviours (API error, page cap, backwards cursor). The lister is
// injected, so no Deno.env and no network.

import { assertEquals } from "jsr:@std/assert@1";
import {
  findUserByEmail,
  LOOKUP_PER_PAGE,
  MAX_LOOKUP_PAGES,
  type ListedUser,
  type ListedUsersPage,
  type ListUsers,
} from "./findUserByEmail.ts";

interface Call {
  page: number;
  perPage: number;
}

/** Fake lister over a fixed script of pages; records every call. */
function listerFrom(pages: Record<number, ListedUsersPage>, calls: Call[]): ListUsers {
  return (params) => {
    calls.push(params);
    return Promise.resolve({ data: pages[params.page] ?? { users: [], nextPage: null }, error: null });
  };
}

const user = (id: string, email: string | null): ListedUser => ({ id, email });

Deno.test("trova l'utente sulla prima pagina", async () => {
  const calls: Call[] = [];
  const lister = listerFrom(
    { 1: { users: [user("u1", "a@test.it"), user("u2", "b@test.it")], nextPage: null } },
    calls,
  );

  const result = await findUserByEmail(lister, "b@test.it");

  assertEquals(result, { ok: true, user: { id: "u2", email: "b@test.it" } });
  assertEquals(calls, [{ page: 1, perPage: LOOKUP_PER_PAGE }]);
});

Deno.test("normalizza maiuscole e spazi su entrambi i lati del confronto", async () => {
  const calls: Call[] = [];
  const lister = listerFrom({ 1: { users: [user("u1", "Mario.Rossi@Test.IT")], nextPage: null } }, calls);

  const result = await findUserByEmail(lister, "  MARIO.ROSSI@test.it  ");

  assertEquals(result.ok, true);
  assertEquals(result.ok && result.user?.id, "u1");
});

Deno.test("segue il cursore nextPage fino alla pagina che contiene l'utente", async () => {
  const calls: Call[] = [];
  const lister = listerFrom(
    {
      1: { users: [user("u1", "a@test.it")], nextPage: 2 },
      2: { users: [user("u2", "b@test.it")], nextPage: 3 },
      3: { users: [user("u3", "c@test.it")], nextPage: null },
    },
    calls,
  );

  const result = await findUserByEmail(lister, "c@test.it");

  assertEquals(result.ok && result.user?.id, "u3");
  assertEquals(
    calls.map((c) => c.page),
    [1, 2, 3],
  );
});

Deno.test("scan completo senza match → ok con user null (NON un errore)", async () => {
  const calls: Call[] = [];
  const lister = listerFrom(
    {
      1: { users: [user("u1", "a@test.it")], nextPage: 2 },
      2: { users: [user("u2", "b@test.it")], nextPage: null },
    },
    calls,
  );

  assertEquals(await findUserByEmail(lister, "mai.vista@test.it"), { ok: true, user: null });
  assertEquals(calls.length, 2);
});

Deno.test("errore del lister → fail-closed con il messaggio, scan interrotto", async () => {
  const calls: Call[] = [];
  const lister: ListUsers = (params) => {
    calls.push(params);
    return Promise.resolve({ data: { users: [] }, error: { message: "boom" } });
  };

  assertEquals(await findUserByEmail(lister, "a@test.it"), { ok: false, error: "boom" });
  assertEquals(calls.length, 1);
});

Deno.test("errore senza message → messaggio di fallback, mai ok:true", async () => {
  const lister: ListUsers = () => Promise.resolve({ data: null, error: {} });

  assertEquals(await findUserByEmail(lister, "a@test.it"), {
    ok: false,
    error: "listUsers failed",
  });
});

Deno.test("cursore che cicla → cap raggiunto, fail-closed dopo esattamente MAX pagine", async () => {
  const calls: Call[] = [];
  // Riproduce il difetto noto del parser Link di auth-js: oltre pagina 9 il
  // cursore puo' tornare indietro. Senza cap il loop girerebbe all'infinito.
  const lister: ListUsers = (params) => {
    calls.push(params);
    return Promise.resolve({ data: { users: [user("u1", "altro@test.it")], nextPage: 1 }, error: null });
  };

  const result = await findUserByEmail(lister, "a@test.it");

  assertEquals(result, {
    ok: false,
    error: `lookup truncated after ${MAX_LOOKUP_PAGES} pages`,
  });
  assertEquals(calls.length, MAX_LOOKUP_PAGES);
});

Deno.test("cursore non positivo (0) chiude lo scan invece di ripartire da capo", async () => {
  const calls: Call[] = [];
  const lister = listerFrom({ 1: { users: [user("u1", "a@test.it")], nextPage: 0 } }, calls);

  assertEquals(await findUserByEmail(lister, "cercata@test.it"), { ok: true, user: null });
  assertEquals(calls.length, 1);
});

Deno.test("senza cursore: pagina piena → avanza, pagina corta → si ferma", async () => {
  const calls: Call[] = [];
  const full = Array.from({ length: LOOKUP_PER_PAGE }, (_, i) => user(`u${i}`, `u${i}@test.it`));
  const lister: ListUsers = (params) => {
    calls.push(params);
    // Nessun campo nextPage: fallback sulla lunghezza della pagina.
    return Promise.resolve({
      data: params.page === 1 ? { users: full } : { users: [user("last", "last@test.it")] },
      error: null,
    });
  };

  assertEquals(await findUserByEmail(lister, "last@test.it"), {
    ok: true,
    user: { id: "last", email: "last@test.it" },
  });
  assertEquals(
    calls.map((c) => c.page),
    [1, 2],
  );
});

Deno.test("email vuota → nessuna chiamata al lister", async () => {
  const calls: Call[] = [];
  const lister = listerFrom({ 1: { users: [user("u1", "a@test.it")], nextPage: null } }, calls);

  assertEquals(await findUserByEmail(lister, "   "), { ok: true, user: null });
  assertEquals(calls.length, 0);
});

Deno.test("utenti senza email nella pagina non rompono il confronto", async () => {
  const calls: Call[] = [];
  const lister = listerFrom(
    { 1: { users: [user("u0", null), user("u1", "a@test.it")], nextPage: null } },
    calls,
  );

  assertEquals(await findUserByEmail(lister, "a@test.it"), {
    ok: true,
    user: { id: "u1", email: "a@test.it" },
  });
});
