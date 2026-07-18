// Wiring pins for the athlete review notification inside processAthlete: the
// notify lives in respondGate (hold-only, after the coach alert stood), the
// clear lives on the released path (before the fail-loud audit). Tabular fake
// client: canned per-table FIFO responses consumed at from() time (the call
// order is deterministic), every insert/update recorded in order with its
// filters. The PURE engine runs for real — no engine mocks (fixtures mirror
// _shared/nutrition/assemblePlan.test.ts).

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { addDays } from "../../_shared/nutrition/dailySeries.ts";
import { testConfig } from "../../_shared/nutrition/nutritionConfig.fixture.ts";
import { processAthlete } from "./processAthlete.ts";
import type { AthleteRow } from "./processAthlete.ts";

const TODAY = "2026-07-17";
const CONFIG_VERSION = "nicolo_nutrition@v-test";

// Small config for hand-checkable engine runs (same as assemblePlan.test.ts).
const smallCfg = testConfig({
  expenditure_window_days: 7,
  weight_trend_half_life_days: 1,
  min_trend_span_days: 6,
  min_history_days_full_confidence: 7,
});

// coach_id set on purpose: the ?? SAFETY_NET_COACH_ID fallback must never
// evaluate Deno.env in tests.
const ATHLETE: AthleteRow = { id: "ath-1", coach_id: "coach-1", full_name: "Anna" };

const CONSENT_GRANTED = {
  data: [{ consent_type: "nutrition_advice", granted: true, created_at: "2026-07-01T10:00:00Z" }],
};

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

function fakeAdmin(canned: Record<string, CannedResult[]>) {
  const writes: RecordedWrite[] = [];
  const lookups: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const fromCalls: Record<string, number> = {};
  const client = {
    from(table: string) {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      const res = canned[table]?.shift() ?? { data: [], error: null };
      const write: RecordedWrite = { table, op: "insert", values: undefined, filters: {} };
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => {
          lookups.push({ table, filters: write.filters });
          return builder;
        },
        limit: () => builder,
        order: () => builder,
        gte: () => builder,
        lte: () => builder,
        lt: () => builder,
        not: () => builder,
        maybeSingle: () => builder,
        single: () => builder,
        eq: (col: string, val: unknown) => {
          write.filters[col] = val;
          return builder;
        },
        gt: (col: string, val: unknown) => {
          write.filters[`gt:${col}`] = val;
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
  return { client: client as unknown as SupabaseClient, writes, lookups, fromCalls };
}

function log(daysAgo: number, calories: number) {
  return { date: addDays(TODAY, -daysAgo), calories };
}

function weight(daysAgo: number, kg: number, bf: number | null = null) {
  return { date: addDays(TODAY, -daysAgo), weight_kg: kg, body_fat_percentage: bf };
}

const run = (client: SupabaseClient) =>
  processAthlete(client, smallCfg, CONFIG_VERSION, TODAY, ATHLETE);

Deno.test(
  "gate safety_capture: coach alert PRIMA, poi 1 notifica atleta con shape pinnata",
  async () => {
    const { client, writes, lookups } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: true } }],
      // Anchor for the release-aware guard (dedicated lookup on this branch:
      // the gate fires before the engine fetches).
      nutrition_releases: [{ data: { released_at: `${addDays(TODAY, -7)}T08:00:00Z` } }],
      coach_alerts: [{ data: [] }, { error: null }], // dedupe lookup, insert
      notifications: [{ data: [] }, { error: null }], // guard lookup, insert
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    assertEquals(result, { status: "gate", reason: "safety_capture" });
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["coach_alerts:insert", "notifications:insert", "audit_log:insert"],
    );
    // Threading pin: the fetched released_at must reach the guard predicate.
    const guardLookup = lookups.filter((l) => l.table === "notifications")[0];
    assertEquals(guardLookup.filters["gt:created_at"], `${addDays(TODAY, -7)}T08:00:00Z`);
    assertEquals(writes[1].values, {
      user_id: "ath-1",
      sender_id: null,
      type: "nutrition_review",
      message:
        "Il tuo obiettivo nutrizionale è in revisione con il tuo coach. Riceverai presto un aggiornamento.",
      link_url: "/athlete/nutrition",
      read: false,
    });
  },
);

Deno.test("2ª run ancora in blocco: guardia trova la non-letta → 0 nuove notifiche", async () => {
  const { client, writes } = fakeAdmin({
    consents: [CONSENT_GRANTED],
    daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: true } }],
    nutrition_releases: [{ data: null }], // no release yet → guard floor
    coach_alerts: [{ data: [{ id: "a1" }] }], // live alert → dedupe, no insert
    notifications: [{ data: [{ id: "n1" }] }], // unread pause → guard, no insert
    audit_log: [{ error: null }],
  });
  const result = await run(client);
  assertEquals(result, { status: "gate", reason: "safety_capture" });
  assertEquals(
    writes.map((w) => `${w.table}:${w.op}`),
    ["audit_log:insert"], // at most ONE unread per athlete, no spam across runs
  );
});

Deno.test(
  "gate consent: NESSUNA notifica atleta e nessun coach alert (stato normale)",
  async () => {
    const { client, writes, fromCalls } = fakeAdmin({
      consents: [{ data: [] }], // no ledger row → not granted
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    assertEquals(result, { status: "gate", reason: "consent" });
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["audit_log:insert"],
    );
    assertEquals(fromCalls["notifications"], undefined); // never even looked up
    assertEquals(fromCalls["nutrition_releases"], undefined); // no anchor lookup either
  },
);

Deno.test("gate anomalous_adjustment (escalation motore): notifica atleta emessa", async () => {
  const { client, writes, lookups } = fakeAdmin({
    consents: [CONSENT_GRANTED],
    daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
    // Unknown strategy in the active plan → engine escalation (assemblePlan pin).
    nutrition_plans: [{ data: [{ daily_calories: 2000, strategy_type: "recomp" }] }],
    nutrition_releases: [{ data: [] }],
    nutrition_logs: [{ data: [] }, { data: [] }],
    body_measurements: [{ data: [weight(1, 80)] }, { data: [] }, { data: [weight(1, 80)] }],
    athlete_cycle_settings: [{ data: null }],
    coach_alerts: [{ data: [] }, { data: [] }, { error: null }], // referral lookup, dedupe, insert
    notifications: [{ data: [] }, { error: null }],
    audit_log: [{ error: null }],
  });
  const result = await run(client);
  assertEquals(result, { status: "gate", reason: "anomalous_adjustment" });
  assertEquals(
    writes.map((w) => `${w.table}:${w.op}`),
    ["coach_alerts:insert", "notifications:insert", "audit_log:insert"],
  );
  // Empty release chain → null anchor → COALESCE floor, pinned end-to-end.
  const guardLookup = lookups.filter((l) => l.table === "notifications")[0];
  assertEquals(guardLookup.filters["gt:created_at"], "1970-01-01T00:00:00Z");
});

Deno.test(
  "rilascio pulito: le non-lette passano a read=true DOPO l'insert, PRIMA dell'audit",
  async () => {
    // Adaptive fixture from assemblePlan.test.ts (7 logged days, stable weight):
    // real engine → released, cold_start false (no nutrition_plans write).
    const { client, writes } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [{ daily_calories: 2600, strategy_type: "maintain" }] }],
      nutrition_releases: [
        {
          data: [
            {
              id: "rel-7",
              released_at: `${addDays(TODAY, -7)}T08:00:00Z`,
              nutrition_document: {
                daily_calories: 2600,
                expenditure_estimate: 2600,
                strategy: "maintain",
              },
            },
          ],
        },
        { data: { id: "rel-new" }, error: null }, // insert…select("id").single()
      ],
      nutrition_logs: [
        { data: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)) },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      body_measurements: [
        { data: [weight(7, 80), weight(1, 79.8)] },
        { data: [] },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }], // lifecycle referral lookup only
      notifications: [{ error: null }], // the clear update
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    if (result.status !== "released") throw new Error(`atteso released, ottenuto ${result.status}`);
    assertEquals(result.release_id, "rel-new");
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["nutrition_releases:insert", "notifications:update", "audit_log:insert"],
    );
    assertEquals(writes[1].values, { read: true });
    assertEquals(writes[1].filters, { user_id: "ath-1", type: "nutrition_review", read: false });
  },
);

Deno.test(
  "confine no_baseline_data: la non-letta preesistente NON si tocca (pausa persiste)",
  async () => {
    // Intended behavior: an outcome that is neither a blocking gate nor a clean
    // release must leave the pause as-is — never re-propose a stale target.
    const { client, writes, fromCalls } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [] }],
      nutrition_releases: [{ data: [] }],
      nutrition_logs: [
        { data: [1, 2, 3].map((d) => log(d, 2000)) },
        { data: [{ date: addDays(TODAY, -3) }] },
      ],
      body_measurements: [{ data: [] }, { data: [] }, { data: [] }], // no weight ever
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }],
      notifications: [{ data: [{ id: "n-old" }] }], // preexisting unread: must stay untouched
    });
    const result = await run(client);
    assertEquals(result, { status: "no_baseline_data" });
    assertEquals(writes.length, 0);
    assertEquals(fromCalls["notifications"], undefined); // neither read nor written
    assert(fromCalls["audit_log"] === undefined); // sanity: no gate audit either
  },
);

Deno.test(
  "cold start resta un rilascio: nutrition_plans + release + clear della pausa",
  async () => {
    // First target ever (no plan, no chain, one weigh-in): still a clean
    // release — the clear must run here too (task: cold start included).
    const { client, writes } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [] }, { error: null }], // fetch, cold-start insert
      nutrition_releases: [{ data: [] }, { data: { id: "rel-first" }, error: null }],
      nutrition_logs: [{ data: [] }, { data: [] }],
      body_measurements: [{ data: [weight(1, 80)] }, { data: [] }, { data: [weight(1, 80)] }],
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }],
      notifications: [{ error: null }], // the clear update
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    if (result.status !== "released") throw new Error(`atteso released, ottenuto ${result.status}`);
    assertEquals(result.cold_start, true);
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      [
        "nutrition_plans:insert",
        "nutrition_releases:insert",
        "notifications:update",
        "audit_log:insert",
      ],
    );
    assertEquals(writes[2].values, { read: true });
  },
);

Deno.test(
  "gate unintended_weight_loss (ramo gated del motore): notifica atleta emessa",
  async () => {
    // Adaptive fixture with -0.92 kg/week on maintain → engine outcome "gated"
    // (assemblePlan pin): the gated dispatch must escalate AND notify too.
    const { client, writes, lookups } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [{ daily_calories: 2600, strategy_type: "maintain" }] }],
      nutrition_releases: [
        {
          data: [
            {
              id: "rel-7",
              released_at: `${addDays(TODAY, -7)}T08:00:00Z`,
              nutrition_document: {
                daily_calories: 2600,
                expenditure_estimate: 2600,
                strategy: "maintain",
              },
            },
          ],
        },
      ],
      nutrition_logs: [
        { data: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)) },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      body_measurements: [
        { data: [weight(7, 80), weight(1, 79.2)] },
        { data: [] },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }, { data: [] }, { error: null }], // referral fetch, dedupe, insert
      notifications: [{ data: [] }, { error: null }],
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    assertEquals(result, { status: "gate", reason: "unintended_weight_loss" });
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["coach_alerts:insert", "notifications:insert", "audit_log:insert"],
    );
    // Threading pin (gated branch): the anchor comes from the fetched chain.
    const guardLookup = lookups.filter((l) => l.table === "notifications")[0];
    assertEquals(guardLookup.filters["gt:created_at"], `${addDays(TODAY, -7)}T08:00:00Z`);
  },
);

Deno.test(
  "gate low_energy_availability (ramo gated del motore): notifica atleta emessa",
  async () => {
    // LEA fixture from assemblePlan.test.ts: bf 25 in window, 2000 kcal →
    // (2000-300)/60 = 28.3 < 30 → gated. Fourth and last non-consent reason.
    const { client, writes } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [{ daily_calories: 2050, strategy_type: "maintain" }] }],
      nutrition_releases: [
        {
          data: [
            {
              id: "rel-7",
              released_at: `${addDays(TODAY, -7)}T08:00:00Z`,
              nutrition_document: {
                daily_calories: 2050,
                expenditure_estimate: 2000,
                strategy: "maintain",
              },
            },
          ],
        },
      ],
      nutrition_logs: [
        { data: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)) },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      body_measurements: [
        { data: [weight(7, 80), weight(4, 80, 25), weight(1, 80)] },
        { data: [] },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }, { data: [] }, { error: null }],
      notifications: [{ data: [] }, { error: null }],
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    assertEquals(result, { status: "gate", reason: "low_energy_availability" });
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["coach_alerts:insert", "notifications:insert", "audit_log:insert"],
    );
  },
);

Deno.test(
  "conflict 23505 sul release: NESSUNA clear — la pausa non si spegne senza nuovo target",
  async () => {
    // The clear must run only AFTER a SUCCESSFUL release insert: on the losing
    // side of the chain race the concurrent winner does its own clear.
    const { client, writes, fromCalls } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [{ daily_calories: 2600, strategy_type: "maintain" }] }],
      nutrition_releases: [
        {
          data: [
            {
              id: "rel-7",
              released_at: `${addDays(TODAY, -7)}T08:00:00Z`,
              nutrition_document: {
                daily_calories: 2600,
                expenditure_estimate: 2600,
                strategy: "maintain",
              },
            },
          ],
        },
        { data: null, error: { code: "23505" } }, // insert loses the race
      ],
      nutrition_logs: [
        { data: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)) },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      body_measurements: [
        { data: [weight(7, 80), weight(1, 79.8)] },
        { data: [] },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      athlete_cycle_settings: [{ data: null }],
      coach_alerts: [{ data: [] }],
      // NO notifications queue on purpose: the table must never be touched.
    });
    const result = await run(client);
    assertEquals(result, { status: "conflict" });
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      ["nutrition_releases:insert"],
    );
    assertEquals(fromCalls["notifications"], undefined);
  },
);

Deno.test(
  "escalation coach fallita: status error e NESSUNA notifica di pausa",
  async () => {
    // Invariant: notify only AFTER raiseAlert stood — a pause telling the
    // athlete "your coach is reviewing" must never exist without the alert.
    const { client, fromCalls } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: true } }],
      nutrition_releases: [{ data: null }], // anchor lookup on the safety branch
      coach_alerts: [{ data: [] }, { error: { code: "XX000" } }], // lookup ok, insert fails
      // NO notifications queue on purpose: the table must never be touched.
    });
    const result = await run(client);
    assertEquals(result, { status: "error", error: "escalation_failed" });
    assertEquals(fromCalls["notifications"], undefined);
    assertEquals(fromCalls["audit_log"], undefined); // pre-existing behavior, pinned
  },
);

Deno.test(
  "hold-only: rilascio con lifecycle referral → clear e coach alert, MAI notifica di pausa",
  async () => {
    // Fixture from assemblePlan.test.ts (assente_3m + cut): released with
    // lifecycleReferralDue=true. raiseAlert fires on the RELEASE path here —
    // a notify wired inside raiseAlert (instead of respondGate) would insert
    // a pause on a clean release: this pin kills that mutation.
    const { client, writes } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: false } }],
      nutrition_plans: [{ data: [{ daily_calories: 2400, strategy_type: "cut" }] }],
      nutrition_releases: [
        {
          data: [
            {
              id: "rel-7",
              released_at: `${addDays(TODAY, -7)}T08:00:00Z`,
              nutrition_document: {
                daily_calories: 2400,
                expenditure_estimate: 2500,
                strategy: "cut",
              },
            },
          ],
        },
        { data: { id: "rel-new" }, error: null },
      ],
      nutrition_logs: [
        { data: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2500)) },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      body_measurements: [
        { data: [weight(7, 80), weight(1, 80)] },
        { data: [] },
        { data: [{ date: addDays(TODAY, -7) }] },
      ],
      athlete_cycle_settings: [{ data: { cycle_status: "assente_3m" } }],
      coach_alerts: [{ data: [] }, { data: [] }, { error: null }], // referral fetch, dedupe, insert
      notifications: [{ error: null }], // ONLY the clear update — no insert canned
      audit_log: [{ error: null }],
    });
    const result = await run(client);
    if (result.status !== "released") throw new Error(`atteso released, ottenuto ${result.status}`);
    assertEquals(
      writes.map((w) => `${w.table}:${w.op}`),
      [
        "nutrition_releases:insert",
        "notifications:update",
        "coach_alerts:insert",
        "audit_log:insert",
      ],
    );
  },
);
