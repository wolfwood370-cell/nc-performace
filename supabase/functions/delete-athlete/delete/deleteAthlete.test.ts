// Pins for the deletion ORDER and the fail-closed contract of deleteAthlete.
// Step-recorder fakes (pattern: processAthlete.test.ts): every port call lands in
// `calls` in invocation order, so each test asserts the EXACT sequence — the order
// IS the contract (nothing deleted before the verified Stripe cancel).

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { DeleteDeps, SubscriptionLookup, SubscriptionRow } from "./deleteAthlete.ts";
import { deleteAthlete, scrubFilters, TERMINAL_STRIPE_STATUSES } from "./deleteAthlete.ts";

const ATHLETE = "ath-1";
const COACH = "coach-1";

type DepsOpts = {
  profile?: { found: false } | { found: true; coachId: string | null };
  rows?: SubscriptionRow[];
  /** Per-subscription FIFO of retrieve results; the LAST entry repeats. Unknown id → missing. */
  stripeSubs?: Record<string, SubscriptionLookup[]>;
  cancelThrows?: boolean;
  retrieveThrows?: boolean;
  scrubError?: boolean;
  /** FIFO of per-call scrub counts, default 0. */
  scrubCounts?: number[];
  deleteProfileError?: boolean;
  auth?: { ok: true } | { ok: false; notFound: boolean };
};

function makeDeps(opts: DepsOpts = {}) {
  const calls: string[] = [];
  const scrubbedFilters: Record<string, unknown>[] = [];
  const scrubCounts = [...(opts.scrubCounts ?? [])];
  const subQueues = new Map<string, SubscriptionLookup[]>(
    Object.entries(opts.stripeSubs ?? {}).map(([k, v]) => [k, [...v]]),
  );
  const deps: DeleteDeps = {
    db: {
      fetchProfile: (id) => {
        calls.push(`db:fetchProfile:${id}`);
        return Promise.resolve(opts.profile ?? { found: true, coachId: COACH });
      },
      fetchSubscriptionRows: (id) => {
        calls.push(`db:fetchRows:${id}`);
        return Promise.resolve(opts.rows ?? []);
      },
      scrubStripeEvents: (filter) => {
        calls.push("db:scrub");
        if (opts.scrubError) return Promise.reject(new Error("db_error:scrub"));
        scrubbedFilters.push(filter);
        return Promise.resolve(scrubCounts.shift() ?? 0);
      },
      deleteProfile: (id) => {
        calls.push(`db:deleteProfile:${id}`);
        if (opts.deleteProfileError) return Promise.reject(new Error("db_error:delete"));
        return Promise.resolve();
      },
      deleteAuthUser: (id) => {
        calls.push(`db:deleteAuthUser:${id}`);
        return Promise.resolve(opts.auth ?? { ok: true });
      },
    },
    stripe: {
      retrieveSubscription: (id) => {
        calls.push(`stripe:retrieve:${id}`);
        if (opts.retrieveThrows) return Promise.reject(new Error("stripe down"));
        const q = subQueues.get(id);
        if (!q || q.length === 0) return Promise.resolve({ kind: "missing" });
        return Promise.resolve(q.length === 1 ? q[0] : q.shift()!);
      },
      cancelSubscription: (id) => {
        calls.push(`stripe:cancel:${id}`);
        if (opts.cancelThrows) return Promise.reject(new Error("stripe down"));
        return Promise.resolve();
      },
    },
    log: () => {},
  };
  return { deps, calls, scrubbedFilters };
}

const row = (sub: string | null, cus: string | null): SubscriptionRow => ({
  stripe_subscription_id: sub,
  stripe_customer_id: cus,
});
const found = (status: string): SubscriptionLookup => ({ kind: "found", status });

Deno.test(
  "ordine completo pinnato: retrieve→cancel→retrieve→scrub×3→deleteProfile→deleteAuthUser",
  async () => {
    const { deps, calls, scrubbedFilters } = makeDeps({
      rows: [row("sub_1", "cus_1")],
      stripeSubs: { sub_1: [found("active"), found("canceled")] },
      scrubCounts: [2, 1, 3],
    });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome, { kind: "deleted", subscriptionCanceled: true, stripeEventsScrubbed: 6 });
    assertEquals(calls, [
      "db:fetchProfile:ath-1",
      "db:fetchRows:ath-1",
      "stripe:retrieve:sub_1",
      "stripe:cancel:sub_1",
      "stripe:retrieve:sub_1",
      "db:scrub",
      "db:scrub",
      "db:scrub",
      "db:deleteProfile:ath-1",
      "db:deleteAuthUser:ath-1",
    ]);
    assertEquals(scrubbedFilters, [
      { data: { object: { customer: "cus_1" } } },
      { data: { object: { id: "cus_1" } } },
      { data: { object: { metadata: { athlete_id: "ath-1" } } } },
    ]);
  },
);

Deno.test(
  "autorizzazione self: l'atleta puo' cancellare se stesso anche con coach diverso",
  async () => {
    const { deps } = makeDeps({ profile: { found: true, coachId: "other-coach" } });
    const outcome = await deleteAthlete(deps, ATHLETE, ATHLETE);
    assertEquals(outcome.kind, "deleted");
  },
);

Deno.test(
  "non autorizzato: ne' coach ne' self → not_authorized e NESSUN altro accesso",
  async () => {
    const { deps, calls } = makeDeps({ rows: [row("sub_1", "cus_1")] });
    const outcome = await deleteAthlete(deps, "intruder", ATHLETE);
    assertEquals(outcome, { kind: "not_authorized" });
    assertEquals(calls, ["db:fetchProfile:ath-1"]);
  },
);

Deno.test("idempotente: profilo gia' assente → already_deleted senza toccare nulla", async () => {
  const { deps, calls } = makeDeps({ profile: { found: false } });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "already_deleted" });
  assertEquals(calls, ["db:fetchProfile:ath-1"]);
});

Deno.test("sub gia' canceled: skip del cancel (retry idempotente), il resto procede", async () => {
  const { deps, calls } = makeDeps({
    rows: [row("sub_1", "cus_1")],
    stripeSubs: { sub_1: [found("canceled")] },
  });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "deleted", subscriptionCanceled: false, stripeEventsScrubbed: 0 });
  assertEquals(calls.includes("stripe:cancel:sub_1"), false);
  assertEquals(calls.includes("db:deleteProfile:ath-1"), true);
});

Deno.test("incomplete_expired e' terminale quanto canceled: skip del cancel", async () => {
  const { deps, calls } = makeDeps({
    rows: [row("sub_1", "cus_1")],
    stripeSubs: { sub_1: [found("incomplete_expired")] },
  });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome.kind, "deleted");
  assertEquals(calls.includes("stripe:cancel:sub_1"), false);
});

Deno.test(
  "sub inesistente su Stripe (resource_missing) → skip, la cancellazione procede",
  async () => {
    const { deps, calls } = makeDeps({ rows: [row("sub_gone", "cus_1")] });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome, {
      kind: "deleted",
      subscriptionCanceled: false,
      stripeEventsScrubbed: 0,
    });
    assertEquals(calls.includes("stripe:cancel:sub_gone"), false);
  },
);

Deno.test(
  "cancel non confermato dalla rilettura → stripe_cancel_failed e ZERO cancellazioni",
  async () => {
    const { deps, calls } = makeDeps({
      rows: [row("sub_1", "cus_1")],
      stripeSubs: { sub_1: [found("active"), found("active")] },
    });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome, { kind: "stripe_cancel_failed" });
    assertEquals(
      calls.some((c) => c.startsWith("db:scrub")),
      false,
    );
    assertEquals(
      calls.some((c) => c.startsWith("db:deleteProfile")),
      false,
    );
    assertEquals(
      calls.some((c) => c.startsWith("db:deleteAuthUser")),
      false,
    );
  },
);

Deno.test("cancel che lancia → stripe_cancel_failed, niente scrub ne' delete", async () => {
  const { deps, calls } = makeDeps({
    rows: [row("sub_1", "cus_1")],
    stripeSubs: { sub_1: [found("active")] },
    cancelThrows: true,
  });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "stripe_cancel_failed" });
  assertEquals(calls.some((c) => c.startsWith("db:")) && true, true);
  assertEquals(
    calls.filter((c) => c.startsWith("db:")),
    ["db:fetchProfile:ath-1", "db:fetchRows:ath-1"],
  );
});

Deno.test(
  "retrieve che lancia (es. STRIPE_SECRET_KEY assente) → stripe_cancel_failed fail-closed",
  async () => {
    const { deps, calls } = makeDeps({
      rows: [row("sub_1", "cus_1")],
      retrieveThrows: true,
    });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome, { kind: "stripe_cancel_failed" });
    assertEquals(
      calls.filter((c) => c.startsWith("db:")),
      ["db:fetchProfile:ath-1", "db:fetchRows:ath-1"],
    );
  },
);

Deno.test("scrub fallito → stripe_events_scrub_failed, profilo e utenza INTATTI", async () => {
  const { deps, calls } = makeDeps({
    rows: [row("sub_1", "cus_1")],
    stripeSubs: { sub_1: [found("active"), found("canceled")] },
    scrubError: true,
  });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "stripe_events_scrub_failed" });
  assertEquals(
    calls.some((c) => c.startsWith("db:deleteProfile")),
    false,
  );
  assertEquals(
    calls.some((c) => c.startsWith("db:deleteAuthUser")),
    false,
  );
});

Deno.test(
  "DELETE profiles fallita → throw (500 del chiamante) e deleteAuthUser MAI chiamato",
  async () => {
    const { deps, calls } = makeDeps({ deleteProfileError: true });
    await assertRejects(() => deleteAthlete(deps, COACH, ATHLETE));
    assertEquals(
      calls.some((c) => c.startsWith("db:deleteAuthUser")),
      false,
    );
  },
);

Deno.test(
  "deleteUser fallito (non not-found) → auth_user_deletion_failed coi contatori veri",
  async () => {
    const { deps } = makeDeps({
      rows: [row("sub_1", "cus_1")],
      stripeSubs: { sub_1: [found("active"), found("canceled")] },
      scrubCounts: [1, 0, 2],
      auth: { ok: false, notFound: false },
    });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome, {
      kind: "auth_user_deletion_failed",
      subscriptionCanceled: true,
      stripeEventsScrubbed: 3,
    });
  },
);

Deno.test("deleteUser not-found → successo idempotente (l'utenza era gia' sparita)", async () => {
  const { deps } = makeDeps({ auth: { ok: false, notFound: true } });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "deleted", subscriptionCanceled: false, stripeEventsScrubbed: 0 });
});

Deno.test(
  "dedupe: sub e customer duplicati e NULL → 1 giro per sub distinta, filtri per cus distinto",
  async () => {
    const { deps, calls, scrubbedFilters } = makeDeps({
      rows: [row("sub_1", "cus_1"), row("sub_1", "cus_1"), row(null, null), row("sub_2", "cus_2")],
      stripeSubs: {
        sub_1: [found("active"), found("canceled")],
        sub_2: [found("canceled")],
      },
    });
    const outcome = await deleteAthlete(deps, COACH, ATHLETE);
    assertEquals(outcome.kind, "deleted");
    assertEquals(calls.filter((c) => c === "stripe:cancel:sub_1").length, 1);
    assertEquals(calls.filter((c) => c === "stripe:cancel:sub_2").length, 0);
    assertEquals(scrubbedFilters, [
      { data: { object: { customer: "cus_1" } } },
      { data: { object: { id: "cus_1" } } },
      { data: { object: { customer: "cus_2" } } },
      { data: { object: { id: "cus_2" } } },
      { data: { object: { metadata: { athlete_id: "ath-1" } } } },
    ]);
  },
);

Deno.test("nessuna riga di abbonamento: Stripe MAI toccato, scrub solo su metadata", async () => {
  const { deps, calls, scrubbedFilters } = makeDeps({ rows: [] });
  const outcome = await deleteAthlete(deps, COACH, ATHLETE);
  assertEquals(outcome, { kind: "deleted", subscriptionCanceled: false, stripeEventsScrubbed: 0 });
  assertEquals(
    calls.some((c) => c.startsWith("stripe:")),
    false,
  );
  assertEquals(scrubbedFilters, [{ data: { object: { metadata: { athlete_id: "ath-1" } } } }]);
});

Deno.test("scrubFilters: forma e ordine pinnati letterali", () => {
  assertEquals(scrubFilters(["cus_a"], "ath-9"), [
    { data: { object: { customer: "cus_a" } } },
    { data: { object: { id: "cus_a" } } },
    { data: { object: { metadata: { athlete_id: "ath-9" } } } },
  ]);
});

Deno.test("TERMINAL_STRIPE_STATUSES: esattamente {canceled, incomplete_expired}", () => {
  assertEquals(TERMINAL_STRIPE_STATUSES.size, 2);
  assertEquals(TERMINAL_STRIPE_STATUSES.has("canceled"), true);
  assertEquals(TERMINAL_STRIPE_STATUSES.has("incomplete_expired"), true);
  assertEquals(TERMINAL_STRIPE_STATUSES.has("active"), false);
  assertEquals(TERMINAL_STRIPE_STATUSES.has("past_due"), false);
});
