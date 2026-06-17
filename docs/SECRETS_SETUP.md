# SECRETS_SETUP.md — Creazione e impostazione dei secret edge

> Progetto: **nc-performance-hub** · ref `xgxtplqlewpqjzghvbke` · giugno 2026
> Dove si impostano: Supabase Dashboard → progetto → **Edge Functions → Secrets** (oppure CLI `supabase secrets set`).
> ⚠️ **Nessun valore reale** va in questo file né nel repo: qui ci sono solo le istruzioni.

---

## TL;DR — cosa ti serve davvero

| Secret                   | Stato                   | Fonte                                                     |
| ------------------------ | ----------------------- | --------------------------------------------------------- |
| `OPENAI_API_KEY`         | da **creare**           | OpenAI platform                                           |
| `RESEND_API_KEY`         | da **creare**           | Resend dashboard                                          |
| `STRIPE_SECRET_KEY`      | da **recuperare**       | Stripe dashboard                                          |
| `STRIPE_WEBHOOK_SECRET`  | **post-deploy**         | Stripe, dopo aver creato l'endpoint                       |
| `LOVABLE_API_KEY`        | ❌ **non recuperabile** | gestita da Lovable → migra le 6 funzioni AI a OpenAI (D2) |
| `LOVABLE_AI_GATEWAY_URL` | ❌ **irrilevante**      | gateway legato a Lovable → non impostare                  |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` li **inietta Supabase in automatico**: non impostarli.

---

## 1. OPENAI_API_KEY

Usata da: `ask-copilot`, `chat-with-coach`, `ingest-knowledge` (embedding/RAG) — e diventerà il provider di **tutte** le funzioni AI dopo la migrazione D2.

1. Vai su **platform.openai.com** → accedi.
2. **Settings → API keys** (se usi i Projects: seleziona il progetto → **API keys**).
3. **+ Create new secret key** → dai un nome (es. `nc-performance-hub edge`).
4. Permessi: **All** va bene (o _Restricted_ con Write su chat/completions + embeddings).
5. **Copia subito** la chiave (`sk-proj-…`): OpenAI la mostra **una volta sola**.
6. Verifica di avere **credito/billing** attivo sul progetto OpenAI, altrimenti le chiamate falliscono con 429.

## 2. RESEND_API_KEY

Usata da: `forgot-password`, `invite-athlete`, `send-email`.

1. **resend.com** → accedi → **API Keys** (menu a sinistra).
2. **Create API Key** → nome + **Full access** + seleziona il **dominio** abilitato.
3. **Copia subito** (`re_…`): mostrata **una volta sola**.
4. Per inviare in produzione serve un **dominio verificato** in Resend (record DNS). Per i test va bene il dominio sandbox di Resend.

## 3. STRIPE_SECRET_KEY

Usata da: `create-checkout-session`, `create-portal-session`, `stripe-webhook`.

1. **dashboard.stripe.com** → **Developers → API keys**.
2. In alto scegli **Test mode** (consigliato finché non fai il cutover) o **Live**.
3. Sezione **Standard keys** → riga **Secret key** → **Reveal**.
4. Copia (`sk_test_…` in test / `sk_live_…` in live).
   - In **test** la riveli quante volte vuoi; in **live** **una volta sola**.

## 4. STRIPE_WEBHOOK_SECRET — solo **DOPO** il deploy

Serve l'URL della funzione `stripe-webhook` già deployata.

1. (Dopo il deploy) **dashboard.stripe.com** → **Developers → Webhooks** → **Add endpoint**.
2. **Endpoint URL**:
   `https://xgxtplqlewpqjzghvbke.supabase.co/functions/v1/stripe-webhook`
3. **Select events** — i 5 che la funzione gestisce davvero:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Add endpoint** → apri l'endpoint → **Reveal** signing secret (`whsec_…`).
5. Stesso **mode** (test/live) della `STRIPE_SECRET_KEY`: test e live hanno secret diversi.

---

## 5. ⚠️ LOVABLE_API_KEY / LOVABLE_AI_GATEWAY_URL — vicolo cieco (cambia il piano D2)

- `LOVABLE_API_KEY` è un **secret gestito automaticamente da Lovable**: viene **iniettato** nelle edge function _di Lovable Cloud_ e **non è esposto né recuperabile** dall'utente. Il gateway `ai.gateway.lovable.dev` è legato al progetto Lovable.
- Quindi **non è portabile** sul tuo Supabase self-hosted, e anche con un valore il gateway non autenticherebbe il nuovo progetto.
- **Conseguenza:** le **6 funzioni AI** che chiamano il gateway Lovable vanno **riscritte per usare OpenAI** (`OPENAI_API_KEY`). Non è più "rimandabile a prima di chiudere la fatturazione Lovable": è **necessario** perché girino sul nuovo progetto.
  - Da migrare: `analyze-athlete-week`, `analyze-meal-photo`, `ask-copilot`, `chat-with-coach`, `generate-batch-checkins`, `generate-program`.
  - `ingest-knowledge` usa già OpenAI → ok.
- `LOVABLE_AI_GATEWAY_URL`: valore noto `https://ai.gateway.lovable.dev/v1` (default hardcoded nel codice) ma **inutile** senza key valida → **non impostarla**.

> Nota di deploy: le 6 funzioni AI si **deployano comunque**; risponderanno 500 finché non avviene la migrazione D2. Le funzioni non-AI (Stripe, email, invite, delete, achievements) funzionano con i loro secret.

---

## Come impostare i secret su Supabase

**Dashboard:** progetto `xgxtplqlewpqjzghvbke` → **Edge Functions → Secrets** → _Add new secret_ → nome + valore.

**CLI (bulk)** — crea un `secrets.env` (⚠️ **NON committarlo**, aggiungilo a `.gitignore`):

```
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=re_...
STRIPE_SECRET_KEY=sk_test_...
```

poi:

```
supabase secrets set --env-file ./secrets.env --project-ref xgxtplqlewpqjzghvbke
```

---

## Checklist

- [ ] `OPENAI_API_KEY` creata e impostata
- [ ] `RESEND_API_KEY` creata e impostata
- [ ] `STRIPE_SECRET_KEY` (test) impostata
- [ ] → dì **"vai"**: deploy delle 15 funzioni (lato Cowork)
- [ ] `STRIPE_WEBHOOK_SECRET` creata **dopo** il deploy e impostata
- [ ] D2: migrazione delle 6 funzioni AI a OpenAI (sessione codice)

---

_Generato da Cowork, giugno 2026. Procedure verificate su docs ufficiali OpenAI / Resend / Stripe e fonti Lovable._
