// Unit pins for the athlete review-notification helpers. The insert shape and
// the update filters are asserted against LITERALS (not the exported
// constants): the strings are a contract with the athlete UI and the DB row —
// a mutated constant must fail here (lesson: pinned CONSENT_VERSION).

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { clearAthleteReview, notifyAthleteReview } from "./notifications.ts";

interface CannedResult {
  data?: unknown;
  error?: { code: string } | null;
}

interface RecordedWrite {
  table: string;
  op: "insert" | "update";
  values: unknown;
  filters: Record<string, unknown>;
}

/** Chainable/thenable stub: each from() consumes the next canned result.
 * select() chains are recorded in `lookups` (filters filled by later eq()
 * calls via shared reference) so guard-lookup filters can be pinned too. */
function fakeAdmin(queue: CannedResult[]) {
  const writes: RecordedWrite[] = [];
  const lookups: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const res = queue.shift() ?? { data: [], error: null };
      const write: RecordedWrite = { table, op: "insert", values: undefined, filters: {} };
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => {
          lookups.push({ table, filters: write.filters });
          return builder;
        },
        limit: () => builder,
        eq: (col: string, val: unknown) => {
          write.filters[col] = val;
          return builder;
        },
        insert: (values: unknown) => {
          write.op = "insert";
          write.values = values;
          writes.push(write);
          return builder;
        },
        update: (values: unknown) => {
          write.op = "update";
          write.values = values;
          writes.push(write);
          return builder;
        },
        then: (resolve: (r: CannedResult) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(
            resolve,
            reject,
          ),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, writes, lookups };
}

Deno.test("notify: nessuna non-letta → 1 insert con la shape letterale del contratto", async () => {
  const { client, writes } = fakeAdmin([
    { data: [], error: null }, // guard lookup: no unread row
    { error: null }, // insert ok
  ]);
  await notifyAthleteReview(client, "ath-1");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].table, "notifications");
  assertEquals(writes[0].op, "insert");
  assertEquals(writes[0].values, {
    user_id: "ath-1",
    sender_id: null,
    type: "nutrition_review",
    message:
      "Il tuo obiettivo nutrizionale è in revisione con il tuo coach. Riceverai presto un aggiornamento.",
    link_url: "/athlete/nutrition",
    read: false,
  });
});

Deno.test("notify: la guardia trova una non-letta → 0 insert (niente spam)", async () => {
  const { client, writes, lookups } = fakeAdmin([{ data: [{ id: "n1" }], error: null }]);
  await notifyAthleteReview(client, "ath-1");
  assertEquals(writes.length, 0);
  // The guard's discriminant is load-bearing: user_id (no cross-athlete
  // suppression), literal type, and read=false (a row already marked read by
  // the clean-release clear must NOT keep suppressing future pauses).
  assertEquals(lookups, [
    {
      table: "notifications",
      filters: { user_id: "ath-1", type: "nutrition_review", read: false },
    },
  ]);
});

Deno.test("notify: lookup in errore → si procede con l'insert (doppione < pausa persa)", async () => {
  const { client, writes } = fakeAdmin([
    { data: null, error: { code: "XX000" } }, // guard lookup fails
    { error: null },
  ]);
  await notifyAthleteReview(client, "ath-1");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].op, "insert");
});

Deno.test("notify: insert in errore → best-effort, nessun throw", async () => {
  const { client, writes } = fakeAdmin([
    { data: [], error: null },
    { error: { code: "23505" } },
  ]);
  await notifyAthleteReview(client, "ath-1"); // must not reject
  assertEquals(writes.length, 1);
});

Deno.test("clear: update read=true con i filtri esatti (idempotente sui read=false)", async () => {
  const { client, writes } = fakeAdmin([{ error: null }]);
  await clearAthleteReview(client, "ath-9");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].table, "notifications");
  assertEquals(writes[0].op, "update");
  assertEquals(writes[0].values, { read: true });
  assertEquals(writes[0].filters, {
    user_id: "ath-9",
    type: "nutrition_review",
    read: false,
  });
});

Deno.test("clear: update in errore → best-effort, nessun throw", async () => {
  const { client, writes } = fakeAdmin([{ error: { code: "XX000" } }]);
  await clearAthleteReview(client, "ath-9"); // must not reject
  assert(writes.length === 1);
});
