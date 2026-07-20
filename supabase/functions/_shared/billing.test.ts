// supabase/functions/_shared/billing.test.ts
// Every function in billing.ts is pure (values in, values out): each branch is
// testable without the Stripe SDK, without Deno.env and without a clock. The
// payloads below are hand-built minimal shapes — the point is precisely that the
// extractors must survive a payload we did not anticipate, so several of them are
// OBVIOUSLY malformed on purpose.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  effectiveBillingStatus,
  mapBillingStatusToProfile,
  mapBillingStatusToRow,
  nextProfileTier,
  periodEndIso,
  priceIdFromSubscription,
  resolveAccountState,
  subscriptionIdFromInvoice,
  tierForPlan,
  type ProfileSubscriptionStatus,
  type RowSubscriptionStatus,
} from "./billing.ts";

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

/** The eight statuses Stripe can actually send, plus the label we synthesise. */
const ALL_STATUSES = [
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
  "canceling",
] as const;

const PROFILE_ENUM: ProfileSubscriptionStatus[] = [
  "active",
  "past_due",
  "canceled",
  "trial",
  "none",
];
const ROW_ENUM: RowSubscriptionStatus[] = [
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "canceling",
];

// ------------------------------------------------------- effectiveBillingStatus

Deno.test("effectiveBillingStatus: active + cancel_at_period_end → canceling", () => {
  assertEquals(effectiveBillingStatus("active", true), "canceling");
});

Deno.test("effectiveBillingStatus: active senza disdetta → active", () => {
  assertEquals(effectiveBillingStatus("active", false), "active");
});

Deno.test("effectiveBillingStatus: solo active diventa canceling, mai gli altri stati", () => {
  // Pin: la disdetta programmata ha senso solo su un abbonamento in corso.
  for (const status of ["past_due", "trialing", "unpaid", "paused", "canceled"]) {
    assertEquals(effectiveBillingStatus(status, true), status, status);
  }
});

Deno.test("effectiveBillingStatus: flag non booleano → nessuna promozione a canceling", () => {
  // Kills a truthy check: "true" e 1 non sono il flag di Stripe.
  assertEquals(effectiveBillingStatus("active", "true"), "active");
  assertEquals(effectiveBillingStatus("active", 1), "active");
  assertEquals(effectiveBillingStatus("active", undefined), "active");
});

Deno.test("effectiveBillingStatus: status non stringa → stringa vuota (default chiuso)", () => {
  assertEquals(effectiveBillingStatus(null, false), "");
  assertEquals(effectiveBillingStatus(undefined, true), "");
  assertEquals(effectiveBillingStatus(42, false), "");
});

// --------------------------------------------------- mapBillingStatusToProfile

Deno.test("mapBillingStatusToProfile: active → active", () => {
  assertEquals(mapBillingStatusToProfile("active"), "active");
});

Deno.test("mapBillingStatusToProfile: canceling → active (paga fino a fine periodo)", () => {
  assertEquals(mapBillingStatusToProfile("canceling"), "active");
});

Deno.test("mapBillingStatusToProfile: trialing → trial", () => {
  assertEquals(mapBillingStatusToProfile("trialing"), "trial");
});

Deno.test("mapBillingStatusToProfile: past_due → past_due", () => {
  assertEquals(mapBillingStatusToProfile("past_due"), "past_due");
});

Deno.test("mapBillingStatusToProfile: unpaid → past_due (recuperabile, non terminale)", () => {
  assertEquals(mapBillingStatusToProfile("unpaid"), "past_due");
});

Deno.test("mapBillingStatusToProfile: canceled → canceled", () => {
  assertEquals(mapBillingStatusToProfile("canceled"), "canceled");
});

Deno.test("mapBillingStatusToProfile: incomplete → none (mai partito)", () => {
  assertEquals(mapBillingStatusToProfile("incomplete"), "none");
});

Deno.test("mapBillingStatusToProfile: incomplete_expired → canceled (terminale)", () => {
  assertEquals(mapBillingStatusToProfile("incomplete_expired"), "canceled");
});

Deno.test("mapBillingStatusToProfile: paused → none", () => {
  assertEquals(mapBillingStatusToProfile("paused"), "none");
});

Deno.test("mapBillingStatusToProfile: stato ignoto/null/non-stringa → none (fail-closed)", () => {
  // Kills any pass-through default: uno stato Stripe nuovo non deve MAI dare accesso.
  for (const bad of ["stato_finto_nuovo", "", null, undefined, 7, {}, []]) {
    assertEquals(mapBillingStatusToProfile(bad), "none", String(bad));
  }
});

Deno.test("mapBillingStatusToProfile: NESSUN ramo esce dall'enum di profiles", () => {
  // Il difetto storico: 'canceling'/'incomplete' scritti su una colonna che non li
  // ammette, con l'errore di supabase-js ignorato e la scrittura persa in silenzio.
  for (const status of [...ALL_STATUSES, "boh", "", null, undefined, 0]) {
    assert(
      PROFILE_ENUM.includes(mapBillingStatusToProfile(status)),
      `valore fuori enum per ${String(status)}`,
    );
  }
});

// ------------------------------------------------------- mapBillingStatusToRow

Deno.test("mapBillingStatusToRow: active → active", () => {
  assertEquals(mapBillingStatusToRow("active"), "active");
});

Deno.test("mapBillingStatusToRow: trialing → active (l'enum riga NON ha 'trial')", () => {
  // Pin del disallineamento fra i due enum: la sfumatura trial vive solo sul profilo.
  assertEquals(mapBillingStatusToRow("trialing"), "active");
});

Deno.test("mapBillingStatusToRow: canceling → canceling", () => {
  assertEquals(mapBillingStatusToRow("canceling"), "canceling");
});

Deno.test("mapBillingStatusToRow: past_due e unpaid → past_due", () => {
  assertEquals(mapBillingStatusToRow("past_due"), "past_due");
  assertEquals(mapBillingStatusToRow("unpaid"), "past_due");
});

Deno.test("mapBillingStatusToRow: canceled e incomplete_expired → canceled", () => {
  assertEquals(mapBillingStatusToRow("canceled"), "canceled");
  assertEquals(mapBillingStatusToRow("incomplete_expired"), "canceled");
});

Deno.test("mapBillingStatusToRow: incomplete e paused → incomplete", () => {
  assertEquals(mapBillingStatusToRow("incomplete"), "incomplete");
  assertEquals(mapBillingStatusToRow("paused"), "incomplete");
});

Deno.test("mapBillingStatusToRow: stato ignoto → incomplete, mai active", () => {
  for (const bad of ["stato_finto_nuovo", "", null, undefined, 7]) {
    assertEquals(mapBillingStatusToRow(bad), "incomplete", String(bad));
  }
});

Deno.test("mapBillingStatusToRow: NESSUN ramo esce dall'enum billing_sub_status", () => {
  for (const status of [...ALL_STATUSES, "boh", "", null, undefined, 0]) {
    assert(
      ROW_ENUM.includes(mapBillingStatusToRow(status)),
      `valore fuori enum per ${String(status)}`,
    );
  }
});

Deno.test("le due mappe non collassano: trialing dà trial sul profilo e active sulla riga", () => {
  assertEquals(mapBillingStatusToProfile("trialing"), "trial");
  assertEquals(mapBillingStatusToRow("trialing"), "active");
  assertEquals(mapBillingStatusToProfile("incomplete"), "none");
  assertEquals(mapBillingStatusToRow("incomplete"), "incomplete");
});

// ------------------------------------------------------------------ tierForPlan

Deno.test("tierForPlan: colonna 'premium' → premium, senza warn", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(tierForPlan({ tier: "premium" }), "premium");
  });
  assertEquals(warns.length, 0);
});

Deno.test("tierForPlan: colonna 'monthly' → monthly, senza warn", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(tierForPlan({ tier: "monthly" }), "monthly");
  });
  assertEquals(warns.length, 0);
});

Deno.test("tierForPlan: il NOME del piano non è mai una fonte di tier", () => {
  // Kills the historical bug: tier derivato da plan.name.toLowerCase().
  assertEquals(tierForPlan({ name: "Premium", tier: "monthly" }), "monthly");
  const warns = withCapturedWarn(() => {
    assertEquals(tierForPlan({ name: "premium" }), "monthly");
  });
  assertEquals(warns.length, 1);
});

Deno.test("tierForPlan: tier assente/null/fuori dominio → monthly con UN warn", () => {
  for (const plan of [{}, { tier: null }, { tier: "PREMIUM" }, { tier: "pro" }, { tier: 3 }]) {
    const warns = withCapturedWarn(() => {
      assertEquals(tierForPlan(plan), "monthly", JSON.stringify(plan));
    });
    assertEquals(warns.length, 1, JSON.stringify(plan));
  }
});

Deno.test("tierForPlan: piano null/non-oggetto → monthly, mai un throw", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(tierForPlan(null), "monthly");
    assertEquals(tierForPlan(undefined), "monthly");
    assertEquals(tierForPlan("premium"), "monthly");
  });
  assertEquals(warns.length, 3);
});

Deno.test("tierForPlan: il warn NON contiene il nome del piano (contenuto utente)", () => {
  const warns = withCapturedWarn(() => {
    tierForPlan({ name: "Piano-Finto-Di-Mario", id: "id-finto-1" });
  });
  assertEquals(warns.length, 1);
  assertFalse(warns[0].includes("Piano-Finto-Di-Mario"), "il warn non deve citare il nome");
  assertFalse(warns[0].includes("id-finto-1"), "il warn non deve citare l'id");
});

// --------------------------------------------------------------- nextProfileTier

Deno.test("nextProfileTier: premium + piano monthly → resta premium, con warn", () => {
  // Il cuore della guardia: la UI coach non scrive ancora billing_plans.tier, quindi
  // ogni piano nasce 'monthly' — anche uno chiamato "Premium".
  const warns = withCapturedWarn(() => {
    assertEquals(nextProfileTier("premium", "monthly"), "premium");
  });
  assertEquals(warns.length, 1);
});

Deno.test("nextProfileTier: monthly + piano premium → premium (la promozione passa)", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(nextProfileTier("monthly", "premium"), "premium");
  });
  assertEquals(warns.length, 0);
});

Deno.test("nextProfileTier: tier assente sul profilo → vince il piano", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(nextProfileTier(null, "monthly"), "monthly");
    assertEquals(nextProfileTier(undefined, "premium"), "premium");
  });
  assertEquals(warns.length, 0);
});

Deno.test("nextProfileTier: stesso tier → nessun warn", () => {
  const warns = withCapturedWarn(() => {
    assertEquals(nextProfileTier("premium", "premium"), "premium");
    assertEquals(nextProfileTier("monthly", "monthly"), "monthly");
  });
  assertEquals(warns.length, 0);
});

// ------------------------------------------------------ subscriptionIdFromInvoice

Deno.test("subscriptionIdFromInvoice: forma Basil con id stringa → id", () => {
  const invoice = {
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: { subscription: "sub_finta_1", metadata: null },
    },
  };
  assertEquals(subscriptionIdFromInvoice(invoice), "sub_finta_1");
});

Deno.test("subscriptionIdFromInvoice: forma Basil con oggetto espanso → .id", () => {
  const invoice = {
    parent: { subscription_details: { subscription: { id: "sub_finta_2", object: "subscription" } } },
  };
  assertEquals(subscriptionIdFromInvoice(invoice), "sub_finta_2");
});

Deno.test("subscriptionIdFromInvoice: forma legacy (API vecchia sull'endpoint) → id", () => {
  // La forma la decide l'API version dell'ENDPOINT, non l'SDK importato.
  assertEquals(subscriptionIdFromInvoice({ subscription: "sub_finta_3" }), "sub_finta_3");
  assertEquals(subscriptionIdFromInvoice({ subscription: { id: "sub_finta_4" } }), "sub_finta_4");
});

Deno.test("subscriptionIdFromInvoice: Basil ha la precedenza sulla legacy", () => {
  const invoice = {
    subscription: "sub_finta_legacy",
    parent: { subscription_details: { subscription: "sub_finta_basil" } },
  };
  assertEquals(subscriptionIdFromInvoice(invoice), "sub_finta_basil");
});

Deno.test("subscriptionIdFromInvoice: parent presente ma non di tipo subscription → null", () => {
  // parent NON è un union discriminante usabile: subscription_details è nullable
  // per conto suo, quindi il narrowing va fatto sul CAMPO, non su parent.type.
  const invoice = {
    parent: { type: "quote_details", quote_details: { quote: "qt_finto" }, subscription_details: null },
  };
  assertEquals(subscriptionIdFromInvoice(invoice), null);
});

Deno.test("subscriptionIdFromInvoice: parent null / campi assenti → null", () => {
  assertEquals(subscriptionIdFromInvoice({ parent: null }), null);
  assertEquals(subscriptionIdFromInvoice({}), null);
});

Deno.test("subscriptionIdFromInvoice: payload degenere → null, mai un throw", () => {
  for (const bad of [null, undefined, "sub_finta", 42, [], { parent: "x" }]) {
    assertEquals(subscriptionIdFromInvoice(bad), null, String(bad));
  }
});

Deno.test("subscriptionIdFromInvoice: id vuoto → null (non una stringa vuota)", () => {
  assertEquals(subscriptionIdFromInvoice({ subscription: "" }), null);
  assertEquals(subscriptionIdFromInvoice({ subscription: { id: "" } }), null);
});

// ------------------------------------------------------------------ periodEndIso

Deno.test("periodEndIso: singolo item Basil → ISO di quel timestamp", () => {
  const sub = { items: { data: [{ current_period_end: 1767225600 }] } };
  assertEquals(periodEndIso(sub), new Date(1767225600 * 1000).toISOString());
});

Deno.test("periodEndIso: più item → vince il MASSIMO (l'abbonamento serve fino all'ultimo)", () => {
  const sub = {
    items: {
      data: [
        { current_period_end: 1767225600 },
        { current_period_end: 1769904000 },
        { current_period_end: 1764547200 },
      ],
    },
  };
  assertEquals(periodEndIso(sub), new Date(1769904000 * 1000).toISOString());
});

Deno.test("periodEndIso: forma legacy top-level → ISO", () => {
  assertEquals(
    periodEndIso({ current_period_end: 1767225600 }),
    new Date(1767225600 * 1000).toISOString(),
  );
});

Deno.test("periodEndIso: items vuoti o non-array → fallback sulla legacy", () => {
  assertEquals(
    periodEndIso({ items: { data: [] }, current_period_end: 1767225600 }),
    new Date(1767225600 * 1000).toISOString(),
  );
  assertEquals(
    periodEndIso({ items: { data: "non-un-array" }, current_period_end: 1767225600 }),
    new Date(1767225600 * 1000).toISOString(),
  );
});

Deno.test("periodEndIso: item con valore non usabile viene saltato, non azzera il massimo", () => {
  const sub = {
    items: {
      data: [
        { current_period_end: Number.NaN },
        { current_period_end: "1767225600" },
        { current_period_end: 1767225600 },
        { current_period_end: -5 },
      ],
    },
  };
  assertEquals(periodEndIso(sub), new Date(1767225600 * 1000).toISOString());
});

Deno.test("periodEndIso: nessun valore usabile → null (mai Invalid Date, mai 1970)", () => {
  // Kills `new Date(x*1000).toISOString()` senza guardia: darebbe throw o 1970-01-01.
  for (
    const bad of [
      null,
      undefined,
      {},
      { current_period_end: null },
      { current_period_end: 0 },
      { current_period_end: -1 },
      { current_period_end: Number.NaN },
      { current_period_end: Number.POSITIVE_INFINITY },
      { current_period_end: 1e15 },
      { items: { data: [{}] } },
    ]
  ) {
    assertEquals(periodEndIso(bad), null, JSON.stringify(bad ?? null));
  }
});

// ---------------------------------------------------------- priceIdFromSubscription

Deno.test("priceIdFromSubscription: item singolo con price stringa → id", () => {
  assertEquals(
    priceIdFromSubscription({ items: { data: [{ price: "price_finto_1" }] } }),
    "price_finto_1",
  );
});

Deno.test("priceIdFromSubscription: item singolo con price espanso → .id", () => {
  assertEquals(
    priceIdFromSubscription({ items: { data: [{ price: { id: "price_finto_2" } }] } }),
    "price_finto_2",
  );
});

Deno.test("priceIdFromSubscription: più di un item → null (fail-closed)", () => {
  // Con più price non esiste UN piano: meglio nessun tier che un tier a caso.
  const sub = { items: { data: [{ price: "price_finto_1" }, { price: "price_finto_2" }] } };
  assertEquals(priceIdFromSubscription(sub), null);
});

Deno.test("priceIdFromSubscription: items assenti/vuoti/degeneri → null", () => {
  for (const bad of [null, undefined, {}, { items: {} }, { items: { data: [] } }, { items: { data: [{}] } }]) {
    assertEquals(priceIdFromSubscription(bad), null, JSON.stringify(bad ?? null));
  }
});

// ------------------------------------------------------------ resolveAccountState

Deno.test("resolveAccountState: nessuna riga → null", () => {
  assertEquals(resolveAccountState([]), null);
  assertEquals(resolveAccountState(null), null);
  assertEquals(resolveAccountState("righe"), null);
});

Deno.test("resolveAccountState: riga unica → quella riga, normalizzata", () => {
  const state = resolveAccountState([
    { status: "active", plan_id: "plan-finto-1", current_period_end: "2026-08-20T00:00:00.000Z" },
  ]);
  assertEquals(state, {
    status: "active",
    planId: "plan-finto-1",
    periodEnd: "2026-08-20T00:00:00.000Z",
  });
});

Deno.test("resolveAccountState: active vince su canceled, in qualsiasi ordine", () => {
  // Il caso cambio-piano: la deleted del vecchio abbonamento non deve spegnere il nuovo.
  const vecchio = { status: "canceled", plan_id: "plan-finto-vecchio", current_period_end: null };
  const nuovo = {
    status: "active",
    plan_id: "plan-finto-nuovo",
    current_period_end: "2026-09-20T00:00:00.000Z",
  };
  assertEquals(resolveAccountState([vecchio, nuovo])?.planId, "plan-finto-nuovo");
  assertEquals(resolveAccountState([nuovo, vecchio])?.planId, "plan-finto-nuovo");
});

Deno.test("resolveAccountState: precedenza active > canceling > past_due > incomplete > canceled", () => {
  const rows = [
    { status: "canceled", plan_id: "p-canceled" },
    { status: "incomplete", plan_id: "p-incomplete" },
    { status: "past_due", plan_id: "p-past-due" },
    { status: "canceling", plan_id: "p-canceling" },
    { status: "active", plan_id: "p-active" },
  ];
  assertEquals(resolveAccountState(rows)?.planId, "p-active");
  assertEquals(resolveAccountState(rows.slice(0, 4))?.planId, "p-canceling");
  assertEquals(resolveAccountState(rows.slice(0, 3))?.planId, "p-past-due");
  assertEquals(resolveAccountState(rows.slice(0, 2))?.planId, "p-incomplete");
  assertEquals(resolveAccountState(rows.slice(0, 1))?.planId, "p-canceled");
});

Deno.test("resolveAccountState: a parità di stato vince la scadenza più lontana", () => {
  const rows = [
    { status: "active", plan_id: "p-vicino", current_period_end: "2026-08-01T00:00:00.000Z" },
    { status: "active", plan_id: "p-lontano", current_period_end: "2026-12-01T00:00:00.000Z" },
  ];
  assertEquals(resolveAccountState(rows)?.planId, "p-lontano");
  assertEquals(resolveAccountState([...rows].reverse())?.planId, "p-lontano");
});

Deno.test("resolveAccountState: a parità di stato una riga senza scadenza non batte una con scadenza", () => {
  const rows = [
    { status: "active", plan_id: "p-senza-data", current_period_end: null },
    { status: "active", plan_id: "p-con-data", current_period_end: "2026-12-01T00:00:00.000Z" },
  ];
  assertEquals(resolveAccountState(rows)?.planId, "p-con-data");
  assertEquals(resolveAccountState([...rows].reverse())?.planId, "p-con-data");
});

Deno.test("resolveAccountState: stato ignoto sulla riga → incomplete, non guadagna accesso", () => {
  const state = resolveAccountState([{ status: "stato_finto", plan_id: "p-finto" }]);
  assertEquals(state?.status, "incomplete");
});

Deno.test("resolveAccountState: trialing sulla riga → active (coerente con mapBillingStatusToRow)", () => {
  assertEquals(resolveAccountState([{ status: "trialing", plan_id: "p-trial" }])?.status, "active");
});

Deno.test("resolveAccountState: plan_id e scadenza non-stringa → null, mai valori sporchi", () => {
  const state = resolveAccountState([{ status: "active", plan_id: 42, current_period_end: 1767225600 }]);
  assertEquals(state, { status: "active", planId: null, periodEnd: null });
});

Deno.test("resolveAccountState: lo stato risolto resta dentro l'enum riga", () => {
  const rows = ALL_STATUSES.map((status, i) => ({ status, plan_id: `p-${i}` }));
  const state = resolveAccountState(rows);
  assert(state !== null);
  assert(ROW_ENUM.includes(state.status), "valore fuori enum");
});
