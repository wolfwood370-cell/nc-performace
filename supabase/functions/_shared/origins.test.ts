// supabase/functions/_shared/origins.test.ts
// buildOriginConfig / isAllowedOrigin / resolveOrigin are pure (strings in,
// config/verdict out): every branch is testable without Deno.env. Hostnames
// below are the real project defaults plus OBVIOUSLY FAKE extras.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  buildOriginConfig,
  DEFAULT_ALLOWED_HOSTS,
  DEFAULT_ORIGIN,
  isAllowedOrigin,
  resolveOrigin,
} from "./origins.ts";

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

// ---------------------------------------------------------------- isAllowedOrigin

Deno.test("isAllowedOrigin: i 3 host Vercel di default in https → ammessi", () => {
  for (const host of DEFAULT_ALLOWED_HOSTS) {
    assert(isAllowedOrigin(`https://${host}`, DEFAULT_ALLOWED_HOSTS), host);
  }
});

Deno.test("isAllowedOrigin: https con host fuori lista → negata", () => {
  assertFalse(isAllowedOrigin("https://evil.example-finto.com", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: pin anti-suffix — altro deploy vercel.app → negato", () => {
  // Kills any future endsWith(".vercel.app"): that would admit ANYONE's deploy.
  assertFalse(isAllowedOrigin("https://altro-progetto.vercel.app", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: lookalike con host ammesso come prefisso → negato", () => {
  assertFalse(
    isAllowedOrigin("https://nc-performace-mu.vercel.app.evil-finto.com", DEFAULT_ALLOWED_HOSTS),
  );
});

Deno.test("isAllowedOrigin: sottodominio di un host ammesso → negato (match esatto)", () => {
  assertFalse(isAllowedOrigin("https://sub.nc-performace-mu.vercel.app", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: host ammesso ma in http → negato", () => {
  assertFalse(isAllowedOrigin("http://nc-performace-mu.vercel.app", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: localhost/127.0.0.1 in http → ammessi (qualsiasi porta)", () => {
  assert(isAllowedOrigin("http://localhost:5173", DEFAULT_ALLOWED_HOSTS));
  assert(isAllowedOrigin("http://localhost", DEFAULT_ALLOWED_HOSTS));
  assert(isAllowedOrigin("http://127.0.0.1:8080", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: https://localhost → negato (eccezione solo in http)", () => {
  assertFalse(isAllowedOrigin("https://localhost", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: origin malformata / 'null' / ftp → negate senza throw", () => {
  assertFalse(isAllowedOrigin("not-a-url", DEFAULT_ALLOWED_HOSTS));
  assertFalse(isAllowedOrigin("null", DEFAULT_ALLOWED_HOSTS));
  assertFalse(isAllowedOrigin("ftp://nc-performace-mu.vercel.app", DEFAULT_ALLOWED_HOSTS));
});

Deno.test("isAllowedOrigin: hostname maiuscolo nell'Origin → ammesso (URL normalizza)", () => {
  assert(isAllowedOrigin("https://NC-PERFORMACE-MU.vercel.app", DEFAULT_ALLOWED_HOSTS));
});

// -------------------------------------------------------------- buildOriginConfig

Deno.test("buildOriginConfig: env assenti → default nel codice, zero warn", () => {
  let config = buildOriginConfig(undefined, undefined);
  const warns = withCapturedWarn(() => {
    config = buildOriginConfig(undefined, undefined);
  });
  assertEquals(config.allowedHosts, [...DEFAULT_ALLOWED_HOSTS]);
  assertEquals(config.defaultOrigin, DEFAULT_ORIGIN);
  assertEquals(warns.length, 0);
});

Deno.test("buildOriginConfig: ALLOWED_ORIGIN_HOSTS è ADDITIVA — i default sopravvivono", () => {
  const config = buildOriginConfig("coach.example-finto.it", undefined);
  for (const host of DEFAULT_ALLOWED_HOSTS) assert(config.allowedHosts.includes(host), host);
  assert(config.allowedHosts.includes("coach.example-finto.it"));
  assertEquals(config.allowedHosts.length, DEFAULT_ALLOWED_HOSTS.length + 1);
});

Deno.test("buildOriginConfig: lista sporca — trim e vuoti scartati in silenzio", () => {
  let config = buildOriginConfig(undefined, undefined);
  const warns = withCapturedWarn(() => {
    config = buildOriginConfig(" a.example-finto.com ,, b.example-finto.com ,", undefined);
  });
  assert(config.allowedHosts.includes("a.example-finto.com"));
  assert(config.allowedHosts.includes("b.example-finto.com"));
  assertEquals(warns.length, 0);
});

Deno.test("buildOriginConfig: entry invalida scartata con warn che elenca SOLO le scartate", () => {
  let config = buildOriginConfig(undefined, undefined);
  const warns = withCapturedWarn(() => {
    config = buildOriginConfig("https://x.example-finto.com, valido.example-finto.com", undefined);
  });
  assert(config.allowedHosts.includes("valido.example-finto.com"));
  assertFalse(config.allowedHosts.includes("https://x.example-finto.com"));
  assertEquals(warns.length, 1);
  assert(warns[0].includes("https://x.example-finto.com"), "il warn elenca la voce scartata");
  assertFalse(warns[0].includes("valido.example-finto.com"), "il warn NON cita le voci valide");
});

Deno.test(
  "buildOriginConfig: entry maiuscola → ammessa lowercase, zero warn (trim→lowercase→validazione)",
  () => {
    let config = buildOriginConfig(undefined, undefined);
    const warns = withCapturedWarn(() => {
      config = buildOriginConfig("App.Example-Finto.com", undefined);
    });
    assert(config.allowedHosts.includes("app.example-finto.com"));
    assertEquals(warns.length, 0);
    assert(isAllowedOrigin("https://app.example-finto.com", config.allowedHosts));
  },
);

Deno.test(
  "buildOriginConfig: DEFAULT_ORIGIN_URL valida → sostituisce il default e ammette il suo hostname",
  () => {
    const config = buildOriginConfig(undefined, "https://coach.example-finto.it");
    assertEquals(config.defaultOrigin, "https://coach.example-finto.it");
    assert(config.allowedHosts.includes("coach.example-finto.it"));
  },
);

Deno.test(
  "buildOriginConfig: DEFAULT_ORIGIN_URL http o malformata → warn + default, mai throw",
  () => {
    for (const bad of ["http://coach.example-finto.it", "non-una-url"]) {
      let config = buildOriginConfig(undefined, undefined);
      const warns = withCapturedWarn(() => {
        config = buildOriginConfig(undefined, bad);
      });
      assertEquals(config.defaultOrigin, DEFAULT_ORIGIN, bad);
      assertEquals(warns.length, 1, bad);
    }
  },
);

Deno.test("buildOriginConfig: DEFAULT_ORIGIN_URL con path → normalizzata alla sola origin", () => {
  const config = buildOriginConfig(undefined, "https://coach.example-finto.it/app");
  assertEquals(config.defaultOrigin, "https://coach.example-finto.it");
});

// ------------------------------------------------------------------ resolveOrigin

Deno.test("resolveOrigin: origin ammessa → riflessa", () => {
  const config = buildOriginConfig(undefined, undefined);
  assertEquals(
    resolveOrigin("https://nc-performace-mu.vercel.app", config),
    "https://nc-performace-mu.vercel.app",
  );
  assertEquals(resolveOrigin("http://localhost:5173", config), "http://localhost:5173");
});

Deno.test("resolveOrigin: origin assente o vuota → default", () => {
  const config = buildOriginConfig(undefined, undefined);
  assertEquals(resolveOrigin(null, config), DEFAULT_ORIGIN);
  assertEquals(resolveOrigin("", config), DEFAULT_ORIGIN);
});

Deno.test("resolveOrigin: origin ostile → default, mai l'eco dell'origin", () => {
  const config = buildOriginConfig(undefined, undefined);
  const resolved = resolveOrigin("https://evil.example-finto.com", config);
  assertEquals(resolved, DEFAULT_ORIGIN);
  assertFalse(resolved.includes("evil"));
});

Deno.test("resolveOrigin: origin malformata → default senza throw", () => {
  const config = buildOriginConfig(undefined, undefined);
  assertEquals(resolveOrigin("not-a-url", config), DEFAULT_ORIGIN);
});

Deno.test("resolveOrigin: porta default esplicita :443 → riflessa normalizzata senza porta", () => {
  const config = buildOriginConfig(undefined, undefined);
  assertEquals(
    resolveOrigin("https://nc-performace-mu.vercel.app:443", config),
    "https://nc-performace-mu.vercel.app",
  );
});

Deno.test("resolveOrigin: default custom da DEFAULT_ORIGIN_URL", () => {
  const config = buildOriginConfig(undefined, "https://coach.example-finto.it");
  assertEquals(resolveOrigin(null, config), "https://coach.example-finto.it");
  assertEquals(
    resolveOrigin("https://coach.example-finto.it", config),
    "https://coach.example-finto.it",
  );
});
