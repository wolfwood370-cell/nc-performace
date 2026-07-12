# 03 — Backend & Supabase (progetto di proprietà)

> Metodologia per lavoro su `supabase/functions/**`, `supabase/migrations/**`, RLS policies, `src/integrations/supabase/*`, hook che chiamano edge functions.
>
> Backend = **Supabase, progetto di proprietà** (ref `xgxtplqlewpqjzghvbke`, UE). Deploy edge via CLI/connettore; il DB lo opera **Cowork** col connettore (`COWORK.md §4-bis`), **Code** propone i FILE di migrazione. Migrazione da Lovable Cloud tracciata in `docs/DB_MIGRATION.md`.

---

## Indice

0. [⚠ Security ownership policy — condivisa](#0-security-ownership)
1. [Architettura Supabase (progetto di proprietà)](#1-arch)
2. [Supabase client + types.ts](#2-client)
3. [Edge functions inventario](#3-edge-inventory)
4. [Edge function pattern canonical](#4-edge-pattern)
5. [Security checklist edge](#5-security)
6. [Stripe webhook deep-dive](#6-stripe)
7. [AI endpoint pattern](#7-ai)
8. [RLS + Migrations](#8-rls-migrations)
9. [Realtime subscriptions](#9-realtime)
10. [Logging + observability](#10-logging)
11. [Anti-pattern backend](#11-antipatterns)
12. [Modello-dato F0 (fondamenta — schema/RLS)](#12-modello-f0)

---

<a id="0-security-ownership"></a>

## 0. ⚠ Security ownership policy — ownership condivisa

**Decisione 2026-07-04 (metodo v2 — chiude la D5 di `docs/DB_MIGRATION.md`)**: con il DB di proprietà la security non è più delegata a un agente esterno. RLS, edge auth, `SECURITY DEFINER`, Realtime scoping, storage policy e advisor Supabase sono responsabilità **condivisa**:

| Attore          | Possiede                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cowork**      | Review e **applicazione** DB via connettore Supabase (RLS, `SECURITY DEFINER`, advisor, Realtime scoping): `apply_migration` + `get_advisors(security)` dopo ogni DDL, col **benestare di Nick**.    |
| **Claude Code** | **Codice sicuro** + `/security-review` ai milestone. Propone migration/policy come **FILE** in `supabase/migrations/`, **non applica sul DB** (niente MCP Supabase in Code — `CLAUDE.md` legge #11). |
| **Nick**        | Approva ogni chiamata DB; merge/push; secrets.                                                                                                                                                       |

Operazioni potenzialmente distruttive → **STOP & ASK** (`CLAUDE.md §5`).

### 0.1 Il loop security si chiude via connettore

Il loop security si chiude **via connettore (Cowork)** — apply + `get_advisors` + query di verifica post-apply — non serve più un agente esterno: accesso DB live, apply immediato e test RLS post-apply sono nativi della corsia Cowork (`COWORK.md §4-bis`).

### 0.2 Workflow corretto

```
1. Advisor warning / RLS gap emerso
   ↓
2. Cowork prepara la migration (SQL)
   ↓
3. STOP-per-OK di Nick
   ↓
4. Cowork: apply_migration + get_advisors(security) di verifica
   ↓
5. Code crea il FILE supabase/migrations/<timestamp>_<nome>.sql
   corrispondente (stesso nome/versione) e lo committa su branch claude/*
   ↓
6. Pattern persistenti utili (es. trigger anti-escalation, ownership RPC)
   → estratti in §5.x con `docs: aggiungi pattern <X>`.
```

### 0.3 Advisor: dal connettore, non da screenshot

Gli advisor si leggono **dal connettore** (`get_advisors`), non da screenshot. Il default non è più "chiedi a un agente esterno" ma: **Cowork prepara il fix, Nick approva**. Code interviene sul codice (edge functions, client) e propone i FILE di migrazione.

### 0.4 Quando Code interviene su security

1. **Codice sicuro, sempre**: checklist §5 su ogni edge function toccata + `/security-review` ai milestone.
2. **Bug runtime causato indirettamente da security** (es. `fa84fa3` Realtime channel race su `/coach`): è un bug funzionale → Code lo fixa.
3. **Fix RLS/DDL**: Code propone il FILE di migrazione, ma l'applicazione passa dal workflow §0.2 (Cowork + benestare di Nick). Quando l'utente menziona "sicurezza" / "vulnerability" / "Advisor" / "RLS" → **STOP & ASK** (`CLAUDE.md §4/§5`).

### 0.5 Pattern security già documentati

- §5.1 Ownership check via RPC `is_coach_of_athlete` (pattern del repo, commit `082df0b`)
- §5.2 Trigger anti privilege-escalation su `profiles` (migration del repo `20260525125306`)

Quando un fix security produce un nuovo pattern riusabile, estrai in §5.x con riferimento al commit/migration di origine.

### 0.6 Vincoli noti (finding verificati sul DB)

Finding confermati sul progetto — riverificati anche post-migrazione (`docs/DB_MIGRATION_FASE1_REPORT.md §4 R1`) — da NON tentare di ri-fixare:

**`realtime.messages` è in uno schema gestito da Supabase — NON modificabile.**
Una `CREATE POLICY ON realtime.messages` (migration tentative `69119fc` del
2026-05-25) viene **bloccata** al deploy con `insufficient_privilege`.
Comportamento atteso, gestito dal DO block con exception handling.
**L'advisor "Any authenticated user can subscribe to any Realtime channel
topic" rimane OPEN by design** — l'app è già sicura per i canali
`postgres_changes` (RLS sulle tabelle sorgente) e non usa Broadcast/Presence
al momento.

**`invite_tokens`: flow coach-only con redemption server-side, ritenuto sicuro.**
Le 4 policy `coach_id = auth.uid()` + il trigger `handle_new_user`
SECURITY DEFINER bypass-RLS sono sufficienti. Il commit `207c4b8` (filtro
`used=false AND expires_at > now()`) resta attivo come hardening extra non
strettamente necessario — non danneggia nulla perché il flow attuale non
legge invite stale dal client.

**Quando incontri uno di questi vincoli in futuri scan advisor**:

- Marca come "ignored intentional" nella tua risposta all'utente
- NON proporre fix di iniziativa
- Riferimento esplicito a questa §0.6

---

<a id="1-arch"></a>

## 1. Architettura Supabase (progetto di proprietà)

```
┌─────────────────────────────────────────────┐
│  FE (Vite bundle)                           │
│  - React + TS + Vite                        │
│  - @supabase/supabase-js                    │
│  Hosting: Cloudflare Pages post-D4          │
│  (oggi Lovable Publish, finché il cutover   │
│   FE .env — D6 — non è completato)          │
└─────────────────────────────────────────────┘
              │  HTTPS
              ▼
┌─────────────────────────────────────────────┐
│  Supabase — progetto di proprietà (UE)      │
│  ┌──────────────────────────────────────┐   │
│  │ Postgres (RLS-protected)             │   │
│  │ Auth (email, OAuth Google nativo)    │   │
│  │ Realtime (WebSocket)                 │   │
│  │ Storage (file uploads)               │   │
│  │ Edge Functions (Deno runtime)        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  External services                          │
│  - Stripe (webhook signed)                  │
│  - AI providers (OpenAI)                    │
│  - Email (Resend via send-email function)   │
└─────────────────────────────────────────────┘
```

### 1.1 Modello operativo (CLI / progetto di proprietà)

- **Deploy edge**: `supabase functions deploy` (CLI) o `deploy_edge_function` via connettore — non più da dashboard di terzi
- **Env vars / secrets**: `supabase secrets set` + dashboard Supabase. ⚠ Il cutover FE `.env` è **D6**, ancora in corso (oggi `.env.local` temporaneo punta il FE al backend di proprietà)
- **types.ts**: `supabase gen types typescript --linked` — deterministico, **include `appointments`** → l'**hand-patch è obsoleto** (vedi §2.2 e `CLAUDE.md` legge #7)
- **Migrations**: `apply_migration` via connettore (**Cowork**) + il **file** `supabase/migrations/*` committato da **Code** (vedi §8.2). Non più applicate automaticamente al merge
- **Service role key**: disponibile come secret env per edge functions, mai esposta al client (invariato)

<a id="2-client"></a>

## 2. Supabase client + types.ts

### 2.1 Client singleton

`src/integrations/supabase/client.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
```

### 2.2 Hand-patch types.ts — OBSOLETO (nota storica)

> **OBSOLETO dal passaggio al DB di proprietà.** L'hand-patch serviva quando `types.ts` era rigenerato dalla piattaforma Lovable, che droppava il blocco `appointments` a ogni regen. Con `supabase gen types typescript --linked` il regen è deterministico e **include `appointments`**: nessun hand-patch, nessun cast `(supabase as any)`.

**Oggi** (allineato a `CLAUDE.md` legge #7): dopo ogni cambio di schema →

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
npx tsc --noEmit -p tsconfig.app.json
```

<a id="3-edge-inventory"></a>

## 3. Edge functions inventario

15 functions in `supabase/functions/`:

| Function                  | Category    | Auth                 | Note                                                               |
| ------------------------- | ----------- | -------------------- | ------------------------------------------------------------------ |
| `analyze-athlete-week`    | AI          | User (coach)         | Weekly summary athlete                                             |
| `analyze-meal-photo`      | AI vision   | User (athlete)       | Photo → macros                                                     |
| `ask-copilot`             | AI          | User (coach)         | Master Copilot Q&A                                                 |
| `chat-with-coach`         | AI          | User (athlete/coach) | Chat realtime con AI assist                                        |
| `check-achievements`      | Logic       | User (athlete)       | Verifica + assegna achievement                                     |
| `create-checkout-session` | Stripe      | User (coach)         | Stripe Checkout URL + Origin whitelist + is_coach_of_athlete check |
| `create-portal-session`   | Stripe      | User (coach)         | Customer Portal URL                                                |
| `delete-athlete`          | Destructive | User (coach)         | Cascade delete via RPC                                             |
| `forgot-password`         | Auth        | Public (rate limit)  | Magic link reset                                                   |
| `generate-batch-checkins` | AI          | User (coach)         | Batch checkin questions                                            |
| `generate-program`        | AI          | User (coach)         | Program da prompt                                                  |
| `ingest-knowledge`        | AI          | User (coach)         | Aggiunge doc a RAG                                                 |
| `invite-athlete`          | Logic       | User (coach)         | Invio invito email                                                 |
| `send-email`              | Util        | Service (internal)   | SMTP wrapper                                                       |
| `stripe-webhook`          | Webhook     | Stripe signature     | Sub events                                                         |

### 3.1 Pattern shared mancante (opportunità)

`supabase/functions/_shared/` NON esiste oggi. Candidate per estrazione cross-function:

```
supabase/functions/_shared/
├── auth.ts           # requireAuth(req, roles[]) → user | throws
├── uuid.ts           # assertUuid(value) → throws if invalid
├── rate-limit.ts     # slidingWindow(userId, key, maxPerHour) → boolean
├── log-scrubber.ts   # scrubPii(obj) → safe object for logs
├── errors.ts         # AppError class + toResponse(err) → Response
└── cors.ts           # corsHeaders + handleOptions(req)
```

Quando estrai, fai 1 PR isolato (`refactor(edge): introduci _shared/ helpers cross-function`).

<a id="4-edge-pattern"></a>

## 4. Edge function pattern canonical

```ts
// supabase/functions/<name>/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// import { requireAuth } from "../_shared/auth.ts";  // se _shared esiste

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // ← service role per RLS bypass interno
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Role check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "coach") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Parse + validate input
    const body = await req.json();
    if (typeof body.athlete_id !== "string" || !/^[0-9a-f-]{36}$/.test(body.athlete_id)) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Ownership check
    const { data: athlete } = await supabase
      .from("profiles")
      .select("coach_id")
      .eq("id", body.athlete_id)
      .single();
    if (athlete?.coach_id !== user.id) {
      return new Response(JSON.stringify({ error: "not_your_athlete" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Logic
    // ... do work ...

    // 7. Response
    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // 8. Error handling (scrubbed)
    console.error("Edge fn error:", err instanceof Error ? err.message : "unknown");
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

<a id="5-security"></a>

## 5. Security checklist edge

Per ogni edge function nuova/modificata:

- [ ] CORS headers presenti + preflight gestito
- [ ] Auth check all'inizio (`requireAuth` o equivalente inline)
- [ ] Role check se endpoint role-restricted (`coach`, `admin`, `athlete`)
- [ ] `assertUuid()` su ogni ID da payload
- [ ] Ownership check layered (self / coach-of-athlete / admin bypass)
- [ ] Origin whitelist per redirect URL (Stripe callback, magic link)
- [ ] Rate limit sliding window su endpoint email/AI/SMS (vedi `send-email`, `chat-with-coach`)
- [ ] Log scrubbing — mai loggare full error object (PII/token leak)
- [ ] Idempotency via UNIQUE constraint + handle `code === '23505'`
- [ ] Signature verification per webhook esterni (Stripe — §6)
- [ ] Defense in depth: FE check + RLS + edge re-check
- [ ] Service role key SOLO server-side, mai exported al client
- [ ] Migration testata in branch staging prima di prod (se applicabile)

### 5.1 Pattern: ownership check via RPC `is_coach_of_athlete`

Quando un'edge function permette al coach di agire per conto di un athlete
(es. `create-checkout-session` con `athlete_id` payload), serve verificare
la relazione coach→athlete via RPC (non si può fidare del client).

Pattern canonico del repo (commit `082df0b`):

```ts
// Use USER client (auth header), NOT service role — l'RPC è SECURITY DEFINER
// internamente e risolve auth.uid() dal token, quindi il check è fatto
// dal DB con identità dell'utente reale.
const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  global: { headers: { Authorization: authHeader } },
});

if (targetAthleteId !== user.id) {
  const { data: isCoach, error } = await userClient.rpc("is_coach_of_athlete", {
    p_athlete_id: targetAthleteId,
  });
  if (error || !isCoach) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
```

Funzioni con questo pattern oggi: `create-checkout-session`. Da estendere
a qualsiasi edge function che riceve `athlete_id` da un payload coach.

### 5.2 Pattern: trigger anti privilege-escalation su `profiles`

Defense in depth contro user-side modifica diretta di campi sensibili
(role, coach*id, subscription*\*). Migration del repo `20260525125306`:

```sql
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / postgres bypass
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing role is not allowed';
  END IF;
  -- ... altri campi protetti: coach_id, subscription_tier,
  --     subscription_status, current_period_end
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
```

Caratteristiche:

- **SECURITY DEFINER + bypass service_role**: edge functions con service
  key possono ancora aggiornare (es. stripe-webhook che setta
  `subscription_status='active'` post-payment).
- **Per-field DISTINCT check**: lascia passare tutti gli UPDATE che NON
  toccano i campi protetti. User può ancora aggiornare `full_name`,
  `avatar_url`, preferences, ecc.
- **RAISE EXCEPTION blocca la transazione**: la query fallisce a livello
  PostgreSQL, RLS bypass via service role è l'unica via per aggiornare
  i campi protetti.

Pattern replicabile su altre tabelle con campi sensibili (es. `coach_alerts`
con `severity`, `workout_logs` con `completed_at`).

<a id="6-stripe"></a>

## 6. Stripe webhook deep-dive

### 6.1 Pattern signature verification

```ts
// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-10-28.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const body = await req.text(); // ← raw text, NON parsed JSON

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err) {
    return new Response("invalid signature", { status: 400 });
  }

  // 1. Idempotency check via UNIQUE constraint (schema F0: §12)
  const { error: insertError } = await supabase
    .from("stripe_events")
    .insert({ stripe_event_id: event.id, type: event.type, payload: event });
  if (insertError?.code === "23505") {
    return new Response("already processed", { status: 200 }); // ← duplicate, OK
  }

  // 2. Handle event type
  switch (event.type) {
    case "customer.subscription.updated":
      // ...
      break;
    case "invoice.paid":
      // ...
      break;
    // ...
  }

  return new Response("ok", { status: 200 });
});
```

### 6.2 Env vars critici Stripe

| Var                           | Scope            | Note                                                    |
| ----------------------------- | ---------------- | ------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | Server (edge fn) | sk*test*… o sk*live*…                                   |
| `STRIPE_WEBHOOK_SECRET`       | Server           | whsec\_… — **DIVERSO per ogni env** (staging/prod/test) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Client           | pk*test*… o pk*live*… — inlined a build time            |

### 6.3 Failure modes Stripe

| Sintomo                                   | Causa                                                       | Fix                                                              |
| ----------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Webhook 401 / signature mismatch          | `STRIPE_WEBHOOK_SECRET` env desync                          | Confronta env var con Stripe Dashboard webhook endpoint secret   |
| Subscription mai attivata nel DB          | Webhook ricevuto ma write fail (RLS)                        | Verifica service role key in edge fn                             |
| Customer Portal redirect fail             | Domain non whitelistato in Stripe Settings                  | Aggiungi domain in Stripe → Settings → Billing → Customer Portal |
| Bundle ha publishable key staging in prod | `VITE_STRIPE_PUBLISHABLE_KEY` non rebildato dopo env change | Rebuild/redeploy del FE dopo il cambio env                       |
| Duplicate subscription creation           | No idempotency check                                        | UNIQUE su `stripe_events.stripe_event_id` (già nello schema F0)  |

<a id="7-ai"></a>

## 7. AI endpoint pattern

### 7.1 Architettura tipica AI function

```
1. Auth + role check
2. Rate limit + quota check (ai_usage_tracking)
3. Fetch context (athlete data, knowledge base, chat history)
4. Build prompt da template (DB o _shared/prompts/)
5. Call AI provider (streaming SSE preferito)
6. Log usage (tokens_used, model, latency_ms) in ai_usage_tracking
7. Response (SSE stream o JSON finale)
```

### 7.2 Quota tracking

Tabella `ai_usage_tracking`:

- `user_id`, `function_name`, `tokens_in`, `tokens_out`, `model`, `created_at`

Hook FE `useAiQuota`:

- Aggrega usage del mese corrente
- Confronta con plan limit
- Espone `{ used, limit, remaining, resetAt }`

### 7.3 Streaming SSE pattern

```ts
return new Response(
  new ReadableStream({
    async start(controller) {
      for await (const chunk of aiProvider.stream(prompt)) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      controller.close();
    },
  }),
  {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
    },
  },
);
```

### 7.4 System prompt management

System prompt **NON** hardcoded in TS. Vivono in:

- DB table `ai_prompts` (versionata, A/B testabile)
- O `supabase/functions/_shared/prompts/<name>.txt` (versionato in git)

Hardcoded in `.ts` = ogni edit richiede deploy = friction.

<a id="8-rls-migrations"></a>

## 8. RLS + Migrations

### 8.1 RLS policy pattern

Ogni tabella ha RLS abilitato. Policy granulari:

```sql
-- profiles: leggi se self o coach-of
CREATE POLICY "profiles_select_self_or_coach"
ON profiles FOR SELECT
USING (
  auth.uid() = id                              -- self
  OR auth.uid() = coach_id                     -- coach of this athlete
  OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'  -- admin
);

-- workout_logs: insert solo se athlete owner
CREATE POLICY "workout_logs_insert_self"
ON workout_logs FOR INSERT
WITH CHECK (auth.uid() = athlete_id);
```

### 8.2 Migration workflow

```
1. Il SQL nasce dal lavoro DB di Cowork (o da un fix proposto da Code come FILE)
2. STOP-per-OK di Nick
3. Cowork applica via connettore: apply_migration + get_advisors(security) di verifica
4. Code salva lo STESSO SQL come file supabase/migrations/<timestamp>_<nome>.sql
   (stesso nome/versione della apply) e lo committa su branch claude/*
5. Merge in main via GitHub Desktop (Nick)
```

**Mai amendare** una migration applicata → migrazione correttiva **in avanti**, mai reset. Mai modificare lo schema remoto fuori dai file di migrazione, o `db push` va in errore di sync.

### 8.3 Service role bypass

Edge functions con service role key **bypassano** RLS. Quindi:

- Edge fn DEVE fare auth+ownership check manuali
- Mai usare service role per query "comode" — è un foot-gun

<a id="9-realtime"></a>

## 9. Realtime subscriptions

### 9.1 Pattern subscribe

```ts
useEffect(() => {
  const channel = supabase
    .channel(`chat-${roomId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
      (payload) => {
        queryClient.setQueryData(["chat", roomId, "messages"], (old) => [...old, payload.new]);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [roomId]);
```

### 9.2 Quando usare realtime vs polling

| Use case                      | Realtime    | Polling                           |
| ----------------------------- | ----------- | --------------------------------- |
| Chat                          | ✅ realtime | ❌                                |
| Notification new              | ✅ realtime | parziale                          |
| Coach dashboard "live alerts" | ✅ realtime | accept 5min polling               |
| Stripe subscription status    | ❌          | ✅ (webhook is source of truth)   |
| Workout sync                  | ❌          | offline queue → push on reconnect |

### 9.3 Cleanup

Sempre `removeChannel` in cleanup useEffect, altrimenti zombie subscription.

<a id="10-logging"></a>

## 10. Logging + observability

### 10.1 FE logger

`src/lib/logger.ts` — wrapper su `console.*` con scrub PII e env-aware level.

```ts
import { logger } from "@/lib/logger";

logger.info("Workout saved", { workoutId }); // ✅
logger.error("Save failed", { error: err.message }); // ✅ — NO full err object

console.log(profile); // ❌ — può loggare full PII
```

### 10.2 Edge function logging

```ts
// ✅ Buono — message + safe metadata
console.error("Stripe webhook fail", { eventType: event.type, status: 400 });

// ❌ Male — body completo
console.error("Webhook", { body: req.body, headers: req.headers });
```

### 10.3 Observability Supabase

- Logs edge function: connettore (`get_logs`) o Supabase Dashboard → Functions → Logs
- Query slow logs: Supabase Dashboard → Database → Logs
- Stripe event log: Stripe Dashboard → Developers → Events

<a id="11-antipatterns"></a>

## 11. Anti-pattern backend

| Anti-pattern                                                      | Perché evitarlo                        |
| ----------------------------------------------------------------- | -------------------------------------- |
| Service role key esposta al client                                | RLS bypass totale                      |
| Edge function senza auth check                                    | Endpoint pubblico unintended           |
| RLS disabilitata "tanto controllo edge"                           | Defense in depth violata               |
| Webhook senza signature verification                              | Spoofable                              |
| Loggare body request completo                                     | PII/token leak                         |
| `select('*')` quando ti servono 3 campi                           | Bandwidth waste                        |
| Modifica manuale `types.ts`                                       | Perso al prossimo `gen types --linked` |
| Amend migration mergiata in main                                  | Spacchi prod DB                        |
| AI endpoint senza quota check                                     | Quota burn + bill shock                |
| Realtime subscribe senza cleanup                                  | Zombie channels, memory leak           |
| `supabase.from(table).then(...)` in render senza useQuery wrapper | Re-fire ogni render, no cache          |
| Hardcoded prompt AI in TS                                         | Edit richiede deploy                   |
| Migration con `DROP COLUMN` senza backup                          | Data loss                              |
| Cascade delete via SQL trigger invece di RPC atomic               | Partial state on fail                  |

<a id="12-modello-f0"></a>

## 12. Modello-dato F0 (fondamenta — schema/RLS)

Le 6 aggiunte green-field della fetta F0 (`supabase/migrations/20260712150000..150005_f0_*.sql`), tutte **deny-by-default** dal primo commit: RLS on, zero policy = zero accesso; esistono SOLO le policy elencate qui sotto.

| Oggetto                                                          | Cosa                                                                                                                                                                                                   | RLS                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `profiles.coaching_mode` enum {coached, autonomous}              | modalità del cliente; il gate §0 del CORE la legge per scegliere il percorso di rilascio. ≠ `mode` body-param di `generate-program` (new\|continue)                                                    | eredita `profiles`                                                               |
| `profiles.tier` enum {premium, monthly}                          | tier commerciale; ≠ `subscription_tier` legacy (text, non toccata)                                                                                                                                     | eredita `profiles`                                                               |
| `tier_entitlements` (tier, feature, enabled)                     | mappa entitlement come config-dato (seed nella migration); il rewiring FE è una fetta successiva — oggi `useFeatureAccess.ts` gestisce solo limiti di consumo hard-coded su tier legacy free/basic/pro | SELECT `authenticated`; scrittura solo Cowork/migrazione                         |
| `consents` (append-only)                                         | registro consensi granulare (art. 9 GDPR); stato attuale = riga più recente per (athlete_id, consent_type); FK `ON DELETE CASCADE` verso `profiles`                                                    | INSERT/SELECT own; SELECT coach via `is_coach_of_athlete`; **mai** UPDATE/DELETE |
| `audit_log` (append-only)                                        | log azioni a prova di manomissione client; `actor_id` `ON DELETE SET NULL` (il log sopravvive alla cancellazione account, attore anonimizzato)                                                         | SELECT own/coach; INSERT solo service-role; **mai** UPDATE/DELETE                |
| `stripe_events` (idempotenza)                                    | realizza il pattern idempotenza-webhook di §6.1; la cabla F3                                                                                                                                           | **zero policy** (solo service-role)                                              |
| `method_config` (profile_name, version, config jsonb, is_active) | scaffolding config-driven (metodo di Nicolò = profilo n.1); indice unico parziale = max 1 versione attiva per profilo; il contenuto lo applica Cowork via connettore, mai hard-coded                   | SELECT `authenticated` dove `is_active`; scrittura solo Cowork                   |

**Accesso-coach:** sempre l'helper esistente `public.is_coach_of_athlete(athlete_id)` (SECURITY DEFINER — §5.1), NON un `EXISTS` inline. Nota: esiste anche `is_my_athlete` (quasi-duplicato) → consolidamento = fetta hardening.

**Pattern policy F0 (da riusare sulle tabelle future):** una sola SELECT permissive combinata own-or-coach per (tabella, ruolo) — non aggrava il finding advisor `multiple_permissive_policies` — e `(SELECT auth.uid())` nelle comparazioni dirette — non aggrava `auth_rls_initplan`.

### 12.1 `daily_readiness` — 3° write-path dell'anello atleta (esistente; F0 lo documenta, non lo tocca)

Oltre a `workout_logs` + `exercise_logs`, l'anello atleta scrive **`daily_readiness`**: check-in giornaliero (UNIQUE `athlete_id,date`; upsert da `src/hooks/athlete/useAthleteReadinessHooks.ts` — usato da `DailyCheckin.tsx` — e da `useOfflineSync.ts`) con readiness `score`, sonno/stress/energia/umore/fatica/digestione, `body_weight`, `has_pain` + `soreness_map` (jsonb per muscolo). Letto da: dashboard coach (alert `low_readiness`, soglie 45/50 in `useCoachDashboardMetrics`/`useCoachData`), risk overview, analytics (`body_weight`), health-profile (`has_pain`/`soreness_map`). **`has_pain`/`soreness_map` = input naturale della cattura-sicurezza per-ciclo dell'anello Autonomo** (gate §0 del CORE). Debiti nominati (fetta allenamento-autonomo): niente `updated_at` (la conflict-resolution offline usa `created_at`) e `score` placeholder-85 scritto da `DailyCheckin.tsx`.
