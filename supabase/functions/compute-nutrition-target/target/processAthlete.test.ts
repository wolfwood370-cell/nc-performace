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
  const fromCalls: Record<string, number> = {};
  const client = {
    from(table: string) {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      const res = canned[table]?.shift() ?? { data: [], error: null };
      const write: RecordedWrite = { table, op: "insert", values: undefined, filters: {} };
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => builder,
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
  return { client: client as unknown as SupabaseClient, writes, fromCalls };
}

function log(daysAgo: number, calories: number) {
  return { date: addDays(TODAY, -daysAgo), calories };
}

function weight(daysAgo: number, kg: number) {
  return { date: addDays(TODAY, -daysAgo), weight_kg: kg, body_fat_percentage: null };
}

const run = (client: SupabaseClient) =>
  processAthlete(client, smallCfg, CONFIG_VERSION, TODAY, ATHLETE);

Deno.test(
  "gate safety_capture: coach alert PRIMA, poi 1 notifica atleta con shape pinnata",
  async () => {
    const { client, writes } = fakeAdmin({
      consents: [CONSENT_GRANTED],
      daily_readiness: [{ data: { date: addDays(TODAY, -1), has_pain: true } }],
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
  },
);

Deno.test("gate anomalous_adjustment (escalation motore): notifica atleta emessa", async () => {
  const { client, writes } = fakeAdmin({
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
