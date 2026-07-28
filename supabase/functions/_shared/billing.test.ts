// supabase/functions/_shared/billing.test.ts
// Every function in billing.ts is pure (values in, values out): each branch is
// testable without the Stripe SDK, without Deno.env and without a clock. The
// payloads below are hand-built minimal shapes — the point is precisely that the
// extractors must survive a payload we did not anticipate, so several of them are
// OBVIOUSLY malformed on purpose.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  ACCESS_GRACE_DAYS,
  effectiveBillingStatus,
  epochSecondsToIso,
  graceDecision,
  grantsAccess,
  mapBillingStatusToProfile,
  mapBillingStatusToRow,
  nextProfileTier,
  periodEndIso,
  prepaidTermEndIso,
  priceIdFromSubscription,
  RENEWAL_BILLING_REASON,
  resolveAccessUntil,
  resolveAccountState,
  stripeCadenceFor,
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

// ----------------------------------------------------------------- grantsAccess

Deno.test("grantsAccess: solo active e trial danno accesso", () => {
  assert(grantsAccess("active"));
  assert(grantsAccess("trial"));
  assertFalse(grantsAccess("past_due"));
  assertFalse(grantsAccess("canceled"));
  assertFalse(grantsAccess("none"));
});

Deno.test("grantsAccess: copre l'intero enum del profilo, senza buchi", () => {
  // Pin di totalita': se domani l'enum cresce, questo test non compila piu'.
  const decisi = PROFILE_ENUM.filter((status) => grantsAccess(status));
  assertEquals(decisi.sort(), ["active", "trial"]);
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
    parent: {
      subscription_details: { subscription: { id: "sub_finta_2", object: "subscription" } },
    },
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
    parent: {
      type: "quote_details",
      quote_details: { quote: "qt_finto" },
      subscription_details: null,
    },
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
  for (const bad of [
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
  ]) {
    assertEquals(periodEndIso(bad), null, JSON.stringify(bad ?? null));
  }
});

// ------------------------------------------------------------ prepaidTermEndIso

const DAY = 86400;
/** 2026-01-01T00:00:00Z, l'ancora usata da tutti i casi qui sotto. */
const CREATED = 1767225600;

Deno.test("prepaidTermEndIso: ancora + termine → istante esatto in ISO", () => {
  assertEquals(
    prepaidTermEndIso({ created: CREATED }, 180),
    new Date((CREATED + 180 * DAY) * 1000).toISOString(),
  );
});

Deno.test("prepaidTermEndIso: e' IDEMPOTENTE — un retry Stripe ricalcola lo stesso istante", () => {
  // Il cuore del contratto (invariante 2 del webhook): l'ancora sta dentro
  // l'evento firmato, quindi la rielaborazione della stessa sessione non puo'
  // regalare un altro termine. Un'implementazione basata su now() farebbe
  // fallire questo test solo per caso, quindi lo si verifica sull'uguaglianza
  // di due chiamate separate sullo STESSO payload.
  const session = { created: CREATED };
  assertEquals(prepaidTermEndIso(session, 90), prepaidTermEndIso(session, 90));
  // ...e due sessioni diverse danno scadenze diverse: non e' una costante.
  assert(prepaidTermEndIso({ created: CREATED + DAY }, 90) !== prepaidTermEndIso(session, 90));
});

Deno.test("prepaidTermEndIso: termini diversi sulla stessa ancora → scadenze ordinate", () => {
  const session = { created: CREATED };
  const t90 = prepaidTermEndIso(session, 90)!;
  const t180 = prepaidTermEndIso(session, 180)!;
  const t365 = prepaidTermEndIso(session, 365)!;
  assert(t90 < t180 && t180 < t365, "le scadenze devono crescere col termine");
});

Deno.test("prepaidTermEndIso: termine assente o fuori dominio → null (fail closed)", () => {
  // NULL e' il caso reale: billing_plans.term_days non e' vincolata a NOT NULL
  // per i one_time (vedi 20260721150100), quindi il piano mal configurato
  // arriva fin qui e DEVE produrre null, mai una data inventata.
  for (const bad of [
    null,
    undefined,
    0,
    -1,
    30.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "180",
    {},
  ]) {
    assertEquals(prepaidTermEndIso({ created: CREATED }, bad), null, JSON.stringify(bad ?? null));
  }
});

Deno.test("prepaidTermEndIso: ancora assente o malformata → null, mai la data di oggi", () => {
  for (const bad of [null, undefined, {}, { created: null }, { created: 0 }, { created: -1 }]) {
    assertEquals(prepaidTermEndIso(bad, 180), null, JSON.stringify(bad ?? null));
  }
  // Ancora fuori scala (millisecondi passati per secondi): la data risultante
  // non e' rappresentabile e va rifiutata, non troncata.
  assertEquals(prepaidTermEndIso({ created: 1e15 }, 180), null);
});

// --------------------------------------------------------------- stripeCadenceFor

Deno.test("stripeCadenceFor: 'block' → ricorrenza {week, 4}, mai mensile", () => {
  // Il pin commerciale della fetta: un blocco e' una RICORRENZA di 4 settimane.
  // Il mutante 'block' -> {month, 1} (il vecchio ripiego) muore qui.
  assertEquals(stripeCadenceFor("block"), {
    kind: "recurring",
    recurring: { interval: "week", interval_count: 4 },
  });
});

Deno.test("stripeCadenceFor: valori storici 'month'/'year' → traduzioni vere", () => {
  // Le righe archiviate vendute a queste cadenze restano rappresentabili.
  assertEquals(stripeCadenceFor("month"), {
    kind: "recurring",
    recurring: { interval: "month", interval_count: 1 },
  });
  assertEquals(stripeCadenceFor("year"), {
    kind: "recurring",
    recurring: { interval: "year", interval_count: 1 },
  });
});

Deno.test("stripeCadenceFor: 'one_time' → kind 'one_time', MAI null", () => {
  // I due esiti "negativi" hanno significati OPPOSTI e non si devono confondere:
  // null = cadenza non supportata (il chiamante risponde 400);
  // {kind:'one_time'} = supportata, pagamento singolo (Checkout mode 'payment').
  // Un'inversione manderebbe in 400 ogni checkout premium: questo pin la uccide.
  assertEquals(stripeCadenceFor("one_time"), { kind: "one_time" });
  assert(stripeCadenceFor("one_time") !== null, "one_time e' supportata, non un 400");
});

Deno.test("stripeCadenceFor: fuori dominio → null, mai il ripiego silenzioso a mensile", () => {
  // 'quarter' e' il valore inventato dell'Acceptance; gli altri coprono
  // maiuscole, sinonimi plausibili e tipi sbagliati. Il vecchio codice mandava
  // TUTTO questo a un prezzo mensile senza errore e senza log.
  for (const bad of [
    "quarter",
    "weekly",
    "monthly",
    "Month",
    "BLOCK",
    "block ",
    "",
    null,
    undefined,
    42,
    {},
    ["block"],
    true,
  ]) {
    assertEquals(stripeCadenceFor(bad), null, JSON.stringify(bad ?? String(bad)));
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
  for (const bad of [
    null,
    undefined,
    {},
    { items: {} },
    { items: { data: [] } },
    { items: { data: [{}] } },
  ]) {
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

Deno.test(
  "resolveAccountState: precedenza active > canceling > past_due > incomplete > canceled",
  () => {
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
  },
);

Deno.test("resolveAccountState: a parità di stato vince la scadenza più lontana", () => {
  const rows = [
    { status: "active", plan_id: "p-vicino", current_period_end: "2026-08-01T00:00:00.000Z" },
    { status: "active", plan_id: "p-lontano", current_period_end: "2026-12-01T00:00:00.000Z" },
  ];
  assertEquals(resolveAccountState(rows)?.planId, "p-lontano");
  assertEquals(resolveAccountState([...rows].reverse())?.planId, "p-lontano");
});

Deno.test(
  "resolveAccountState: a parità di stato una riga senza scadenza non batte una con scadenza",
  () => {
    const rows = [
      { status: "active", plan_id: "p-senza-data", current_period_end: null },
      { status: "active", plan_id: "p-con-data", current_period_end: "2026-12-01T00:00:00.000Z" },
    ];
    assertEquals(resolveAccountState(rows)?.planId, "p-con-data");
    assertEquals(resolveAccountState([...rows].reverse())?.planId, "p-con-data");
  },
);

Deno.test("resolveAccountState: stato ignoto sulla riga → incomplete, non guadagna accesso", () => {
  const state = resolveAccountState([{ status: "stato_finto", plan_id: "p-finto" }]);
  assertEquals(state?.status, "incomplete");
});

Deno.test(
  "resolveAccountState: trialing sulla riga → active (coerente con mapBillingStatusToRow)",
  () => {
    assertEquals(
      resolveAccountState([{ status: "trialing", plan_id: "p-trial" }])?.status,
      "active",
    );
  },
);

Deno.test("resolveAccountState: plan_id e scadenza non-stringa → null, mai valori sporchi", () => {
  const state = resolveAccountState([
    { status: "active", plan_id: 42, current_period_end: 1767225600 },
  ]);
  assertEquals(state, { status: "active", planId: null, periodEnd: null });
});

Deno.test("resolveAccountState: lo stato risolto resta dentro l'enum riga", () => {
  const rows = ALL_STATUSES.map((status, i) => ({ status, plan_id: `p-${i}` }));
  const state = resolveAccountState(rows);
  assert(state !== null);
  assert(ROW_ENUM.includes(state.status), "valore fuori enum");
});

// ------------------------------------------------------------- resolveAccessUntil
// access_until = max(copertura-abbonamento fra le righe che danno accesso,
// ultima-concessione). Il confronto e' per istante, non per stringa, e nessun
// orologio viene consultato: una data passata torna com'e' (fail-closed a valle).

const FUT_1 = "2027-01-31T00:00:00.000Z";
const FUT_2 = "2027-06-30T00:00:00.000Z";
const PAST_1 = "2020-01-01T00:00:00.000Z";

Deno.test("resolveAccessUntil: nessuna riga e nessuna concessione → null", () => {
  assertEquals(resolveAccessUntil([], null), null);
  assertEquals(resolveAccessUntil(null, null), null);
  assertEquals(resolveAccessUntil(undefined, undefined), null);
});

Deno.test("resolveAccessUntil: solo abbonamento active → la sua scadenza", () => {
  assertEquals(resolveAccessUntil([{ status: "active", current_period_end: FUT_1 }], null), FUT_1);
});

Deno.test("resolveAccessUntil: solo concessione manuale, nessuna riga → la concessione", () => {
  assertEquals(resolveAccessUntil([], FUT_1), FUT_1);
});

Deno.test(
  "resolveAccessUntil: il webhook NON puo' cancellare la concessione del coach (tema A)",
  () => {
    // Nessuna riga che dia accesso (past_due), ma c'e' una concessione futura:
    // access_until resta la concessione, non null. E' il difetto che il modello evita.
    assertEquals(
      resolveAccessUntil([{ status: "past_due", current_period_end: null }], FUT_1),
      FUT_1,
    );
  },
);

Deno.test(
  "resolveAccessUntil: prepagato SCADUTO non spegne un canceling ancora pagato (tema C)",
  () => {
    // Riga prepagata 'active' con data PASSATA (status 'active' per sempre) +
    // abbonamento 'canceling' con data FUTURA. resolveAccountState (precedence-first)
    // sceglierebbe l'active passato; qui il max prende la data futura -> accesso salvo.
    const rows = [
      { status: "active", current_period_end: PAST_1 },
      { status: "canceling", current_period_end: FUT_1 },
    ];
    assertEquals(resolveAccessUntil(rows, null), FUT_1);
    assertEquals(resolveAccessUntil([...rows].reverse(), null), FUT_1);
  },
);

Deno.test(
  "resolveAccessUntil: fra piu' coperture vince la piu' lontana (sub vs sub vs grant)",
  () => {
    const rows = [
      { status: "active", current_period_end: FUT_1 },
      { status: "canceling", current_period_end: FUT_2 },
    ];
    assertEquals(resolveAccessUntil(rows, PAST_1), FUT_2);
    // Se la concessione e' la piu' lontana, vince lei.
    assertEquals(
      resolveAccessUntil([{ status: "active", current_period_end: FUT_1 }], FUT_2),
      FUT_2,
    );
  },
);

Deno.test("resolveAccessUntil: le righe che NON danno accesso non contano", () => {
  // past_due, canceled, incomplete: escluse. Con solo queste e nessuna concessione → null.
  const rows = [
    { status: "past_due", current_period_end: FUT_2 },
    { status: "canceled", current_period_end: FUT_2 },
    { status: "incomplete", current_period_end: FUT_2 },
  ];
  assertEquals(resolveAccessUntil(rows, null), null);
});

Deno.test(
  "resolveAccessUntil: unico prepagato scaduto → data passata (fail-closed a valle)",
  () => {
    assertEquals(
      resolveAccessUntil([{ status: "active", current_period_end: PAST_1 }], null),
      PAST_1,
    );
  },
);

Deno.test("resolveAccessUntil: confronto per ISTANTE, non per stringa (Z vs +00:00)", () => {
  // Stesso istante scritto in due forme: non deve sballare l'ordinamento.
  const zForm = "2027-01-31T00:00:00.000Z";
  const offsetForm = "2027-01-31T01:00:00+01:00"; // identico istante
  const rows = [{ status: "active", current_period_end: offsetForm }];
  assertEquals(resolveAccessUntil(rows, zForm), zForm); // normalizzato in Z
});

Deno.test("resolveAccessUntil: date e stati sporchi ignorati, mai un valore inventato", () => {
  const rows = [
    { status: "active", current_period_end: 1767225600 }, // numero, non stringa
    { status: "active", current_period_end: "non-una-data" },
    { status: "stato_finto", current_period_end: FUT_2 }, // stato ignoto → escluso
  ];
  assertEquals(resolveAccessUntil(rows, "spazzatura"), null);
});

Deno.test("resolveAccessUntil: normalizza l'output in ISO canonico (Z)", () => {
  const out = resolveAccessUntil([{ status: "active", current_period_end: FUT_1 }], null);
  assertEquals(out, new Date(FUT_1).toISOString());
});

// ------------------------------------------------------------ epochSecondsToIso
// Ora esportata (fetta grazia-4a): il webhook la usa per la finestra di dedupe
// dell'avviso. Conversione, non regola — ma da export va pinnata direttamente.

Deno.test("epochSecondsToIso: epoch valido → ISO esatto", () => {
  assertEquals(epochSecondsToIso(CREATED), new Date(CREATED * 1000).toISOString());
});

Deno.test("epochSecondsToIso: fuori dominio → null, mai Invalid Date né 1970", () => {
  for (const bad of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1e15,
    "1767225600",
    null,
    undefined,
    {},
  ]) {
    assertEquals(epochSecondsToIso(bad), null, String(bad));
  }
});

// ----------------------------------------------------- costanti della grazia
// Pin LETTERALI (lezione CONSENT_VERSION): una costante-contratto mutata deve
// far fallire la suite, non sopravvivere attraverso i fixture.

Deno.test("ACCESS_GRACE_DAYS: 14, pinnato letteralmente", () => {
  assertEquals(ACCESS_GRACE_DAYS, 14);
});

Deno.test("RENEWAL_BILLING_REASON: 'subscription_cycle', pinnato letteralmente", () => {
  assertEquals(RENEWAL_BILLING_REASON, "subscription_cycle");
});

// ----------------------------------------------------------------- graceDecision
// I fixture usano i LETTERALI (mai le costanti): così il mutante che cambia la
// costante diverge dai fixture e muore, invece di co-mutare con loro.

/** Fine finestra attesa per una fattura emessa a CREATED. */
const GRACE_END = new Date((CREATED + 14 * DAY) * 1000).toISOString();
/** Un istante DOPO la fine finestra (stale dal lato stretto del confine). */
const AFTER_GRACE_END = new Date((CREATED + 14 * DAY) * 1000 + 1000).toISOString();

Deno.test(
  "graceDecision: rinnovo fallito, nessun episodio aperto → grant con istante ESATTO (created + 14gg)",
  () => {
    const decision = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status: "past_due", grace_until: null, current_period_end: null },
    );
    assertEquals(decision, { grant: true, until: GRACE_END });
  },
);

Deno.test(
  "graceDecision: deterministica sullo stesso evento, ancorata alla fattura (mai all'orologio)",
  () => {
    const invoice = { created: CREATED, billing_reason: "subscription_cycle" };
    const row = { status: "past_due", grace_until: null, current_period_end: null };
    assertEquals(graceDecision(invoice, row), graceDecision(invoice, row));
    // Fatture emesse in istanti diversi → finestre diverse: non è una costante.
    const a = graceDecision(invoice, row);
    const b = graceDecision({ created: CREATED + DAY, billing_reason: "subscription_cycle" }, row);
    if (!a.grant || !b.grant) throw new Error("attesi due grant");
    assert(a.until !== b.until);
  },
);

Deno.test("graceDecision: la grazia non dipende dallo stato della riga", () => {
  // past_due (il caso normale), canceled (fattura in ritardo su sub chiusa),
  // canceling, incomplete: la decisione è di merito, non di stato.
  for (const status of ["past_due", "canceled", "canceling", "incomplete"]) {
    const decision = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status, grace_until: null, current_period_end: null },
    );
    assertEquals(decision, { grant: true, until: GRACE_END }, status);
  }
});

Deno.test("graceDecision: ancora illeggibile → unreadable_date (MAI una data da 'adesso')", () => {
  for (const bad of [undefined, null, 0, -1, "1767225600", Number.NaN, 1e15]) {
    const decision = graceDecision(
      { created: bad, billing_reason: "subscription_cycle" },
      { status: "past_due", grace_until: null, current_period_end: null },
    );
    assertEquals(decision, { grant: false, reason: "unreadable_date" }, String(bad));
  }
});

Deno.test("graceDecision: ordine dei motivi — ancora illeggibile vince su not_a_renewal", () => {
  const decision = graceDecision({ created: null, billing_reason: "subscription_create" }, {});
  assertEquals(decision, { grant: false, reason: "unreadable_date" });
});

Deno.test(
  "graceDecision: solo il RINNOVO concede — prima fattura e ogni altro valore → not_a_renewal",
  () => {
    // 'subscription_create' è la prima fattura: chi non ha MAI pagato non ottiene
    // grazia. Tutto il resto (incluso il case diverso e l'assenza) è fail-closed.
    for (const reason of [
      "subscription_create",
      "subscription_update",
      "manual",
      "upcoming",
      "SUBSCRIPTION_CYCLE",
      "",
      null,
      undefined,
      42,
    ]) {
      const decision = graceDecision(
        { created: CREATED, billing_reason: reason },
        { status: "past_due", grace_until: null, current_period_end: null },
      );
      assertEquals(decision, { grant: false, reason: "not_a_renewal" }, String(reason));
    }
  },
);

Deno.test("graceDecision: episodio già aperto → episode_open, la finestra non si estende", () => {
  const decision = graceDecision(
    { created: CREATED, billing_reason: "subscription_cycle" },
    { status: "past_due", grace_until: FUT_1, current_period_end: null },
  );
  assertEquals(decision, { grant: false, reason: "episode_open" });
});

Deno.test("graceDecision: ordine dei motivi — episode_open vince su stale_after_recovery", () => {
  const decision = graceDecision(
    { created: CREATED, billing_reason: "subscription_cycle" },
    { status: "active", grace_until: FUT_1, current_period_end: FUT_2 },
  );
  assertEquals(decision, { grant: false, reason: "episode_open" });
});

Deno.test(
  "graceDecision: riga active con scadenza OLTRE la finestra → stale_after_recovery",
  () => {
    // Un incasso già registrato dopo l'emissione: l'evento è vecchio, non toccare nulla.
    const decision = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status: "active", grace_until: null, current_period_end: AFTER_GRACE_END },
    );
    assertEquals(decision, { grant: false, reason: "stale_after_recovery" });
  },
);

Deno.test(
  "graceDecision: confine pinnato da ENTRAMBI i lati — cpe UGUALE alla finestra non è stale",
  () => {
    // Il confronto è STRETTO (>): all'istante esatto la grazia si concede ancora;
    // un millisecondo oltre (qui +1s) no. Un mutante >= muore qui.
    const equal = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status: "active", grace_until: null, current_period_end: GRACE_END },
    );
    assertEquals(equal, { grant: true, until: GRACE_END });
    const beyond = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status: "active", grace_until: null, current_period_end: AFTER_GRACE_END },
    );
    assertEquals(beyond, { grant: false, reason: "stale_after_recovery" });
  },
);

Deno.test(
  "graceDecision: stale SOLO su riga active — past_due con scadenza lontana concede",
  () => {
    const decision = graceDecision(
      { created: CREATED, billing_reason: "subscription_cycle" },
      { status: "past_due", grace_until: null, current_period_end: FUT_2 },
    );
    assertEquals(decision, { grant: true, until: GRACE_END });
  },
);

Deno.test(
  "graceDecision: active con scadenza assente o illeggibile → grant (la staleness va PROVATA)",
  () => {
    for (const cpe of [null, undefined, "non-una-data", 1767225600]) {
      const decision = graceDecision(
        { created: CREATED, billing_reason: "subscription_cycle" },
        { status: "active", grace_until: null, current_period_end: cpe },
      );
      assertEquals(decision, { grant: true, until: GRACE_END }, String(cpe));
    }
  },
);

Deno.test("graceDecision: payload degeneri → mai un throw, sempre un rifiuto motivato", () => {
  for (const bad of [null, undefined, 42, "x", [], {}]) {
    const decision = graceDecision(bad, bad);
    assertEquals(decision.grant, false, String(bad));
  }
});

// ------------------------------------------- resolveAccessUntil + grace_until
// La grazia entra nel massimo FUORI dal filtro ACCESS_GRANTING_ROW (i 14 giorni
// sono dovuti anche a sottoscrizione chiusa) e può solo allungare (invariante 10).

Deno.test(
  "resolveAccessUntil: la grazia su una riga past_due conta (fuori dal filtro-status)",
  () => {
    assertEquals(
      resolveAccessUntil(
        [{ status: "past_due", current_period_end: null, grace_until: FUT_1 }],
        null,
      ),
      FUT_1,
    );
  },
);

Deno.test(
  "resolveAccessUntil: la grazia sopravvive alla sottoscrizione CHIUSA (riga canceled)",
  () => {
    // La cpe della riga canceled resta esclusa dal filtro; la grazia no.
    assertEquals(
      resolveAccessUntil(
        [{ status: "canceled", current_period_end: FUT_2, grace_until: FUT_1 }],
        null,
      ),
      FUT_1,
    );
  },
);

Deno.test(
  "resolveAccessUntil: la grazia può solo ALLUNGARE, mai accorciare (invariante 10)",
  () => {
    // Grazia più vicina di una copertura pagata → vince la copertura...
    assertEquals(
      resolveAccessUntil(
        [{ status: "active", current_period_end: FUT_2, grace_until: FUT_1 }],
        null,
      ),
      FUT_2,
    );
    // ...grazia più lontana → vince la grazia...
    assertEquals(
      resolveAccessUntil(
        [{ status: "active", current_period_end: FUT_1, grace_until: FUT_2 }],
        null,
      ),
      FUT_2,
    );
    // ...e la concessione manuale più lontana non ne risente.
    assertEquals(resolveAccessUntil([{ status: "past_due", grace_until: FUT_1 }], FUT_2), FUT_2);
  },
);

Deno.test(
  "resolveAccessUntil: grace_until spazzatura ignorata; righe senza grace invariate",
  () => {
    assertEquals(
      resolveAccessUntil(
        [{ status: "active", current_period_end: FUT_1, grace_until: 1767225600 }],
        null,
      ),
      FUT_1,
    );
    assertEquals(
      resolveAccessUntil([{ status: "past_due", grace_until: "non-una-data" }], null),
      null,
    );
  },
);
