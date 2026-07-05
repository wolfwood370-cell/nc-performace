
# D6 — Cutover a Supabase Hub esterno: fotografia + piano

**Nessuna modifica eseguita.** Solo ricognizione. Attendo il tuo OK prima di toccare `.env`, secret o codice.

---

## 1. Collegamento attuale vs target

**Oggi.** Il progetto Lovable è collegato a **Lovable Cloud** (Supabase managed, ref `geepagjpequxsjsoahgw`). `.env` contiene `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` iniettate dal connettore Cloud. Edge functions e migrations si deployano automaticamente su quel ref al merge. Secret runtime configurati sul progetto Cloud.

**Target.** Puntare il client + gli edge deploy all'Hub esterno `xgxtplqlewpqjzghvbke` (UE, di tua proprietà).

**Limitazione critica (nota Lovable).** *Lovable Cloud non è disconnettibile da un progetto una volta abilitato.* Il pannello "Connectors → Lovable Cloud → Disable" impatta solo progetti futuri. Quindi il cutover pratico è:

- **Opzione A (raccomandata).** Sovrascrivere `.env` con URL + anon key dell'Hub. Il file `src/integrations/supabase/client.ts` legge `import.meta.env.VITE_SUPABASE_*`: cambia backend senza toccare codice app. Il Cloud interno resta "acceso" ma inutilizzato — nessun costo perché non ci sono query.
- **Opzione B.** Nuovo progetto Lovable senza Cloud + collegamento connettore Supabase esterno a `xgxtplqlewpqjzghvbke` fin dall'inizio, poi import del codice via GitHub. Più pulito ma perde storia progetto.

**Consiglio: Opzione A.** Modifiche `.env`:

```
VITE_SUPABASE_PROJECT_ID="xgxtplqlewpqjzghvbke"
VITE_SUPABASE_URL="https://xgxtplqlewpqjzghvbke.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key Hub>"
```

Nessun altro file app da toccare. `supabase/config.toml` ha già `project_id = "xgxtplqlewpqjzghvbke"` → deploy CLI di Cowork già puntano all'Hub.

---

## 2. Edge functions — delta con l'Hub

Repo contiene **15 funzioni**, esattamente le stesse 15 deployate sull'Hub:

`analyze-athlete-week, analyze-meal-photo, ask-copilot, chat-with-coach, check-achievements, create-checkout-session, create-portal-session, delete-athlete, forgot-password, generate-batch-checkins, generate-program, ingest-knowledge, invite-athlete, send-email, stripe-webhook`.

**Match count: 15/15.** Nessuna mancante da nessuna parte.

**Versioni.** Non posso leggere le versioni deployate sull'Hub da qui (non ho MCP verso quel ref). So che `invite-athlete = v14` sull'Hub. Il codice `invite-athlete/index.ts` in repo include il fix recente (`.trim()` su `RESEND_API_KEY`, `from: noreply@mail.nctrainingsystems.com`) → probabile parità o repo leggermente avanti. **Azione Cowork post-cutover:** redeploy da CLI di tutte le 15 con `supabase functions deploy --project-ref xgxtplqlewpqjzghvbke` per garantire parità col codice del repo.

`send-email` in repo usa ancora `from: onboarding@resend.dev` (non il dominio verificato). Non blocca il cutover — `invite-athlete` è la path principale — ma da allineare in un secondo momento.

---

## 3. Secret usati dalle edge

Riferimenti nel codice:

| Secret | Usato da | Hub |
|---|---|---|
| `RESEND_API_KEY` | invite-athlete, send-email, forgot-password | ✅ già impostato e valido |
| `OPENAI_API_KEY` | ask-copilot, chat-with-coach, ingest-knowledge, + le 5 funzioni AI post migrazione D2 | ⚠️ da verificare/impostare |
| `STRIPE_SECRET_KEY` | create-checkout-session, create-portal-session, stripe-webhook | ⚠️ da impostare (test o live) |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | ⚠️ da creare **dopo** deploy (nuovo endpoint URL Hub) |
| `LOVABLE_API_KEY` / `LOVABLE_AI_GATEWAY_URL` | 6 funzioni AI legacy | ❌ non portabile → migrazione D2 a OpenAI necessaria per farle girare |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | tutte | ✅ auto-iniettati da Supabase |

Nessuna `Turnstile` referenziata nel codice edge attuale.

---

## 4. Schema / migrazioni

Repo ha **50 file** in `supabase/migrations/` (gen 2026). Hub ha **53 tabelle con RLS ON + seed exercises (954 righe) + `profiles.tax_code` + `profiles.address`**. Numeri compatibili con la storia migrations del repo.

**Non posso verificare `supabase_migrations.schema_migrations` sull'Hub da qui.** Serve a **Cowork** confermare via connettore:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

e confrontare con `ls supabase/migrations`. Delta atteso: **zero o quasi zero** (Cowork ha già baseline "tutto applicato").

---

## 5. Auth — riuso utenti Hub

**Problema chiave.** `auth.users` di Cloud (`geepag…`) ≠ `auth.users` di Hub (`xgxtpl…`). Gli account con cui hai fatto login finora sono su Cloud e **non migrano**. L'Hub ha già 3 utenti test (1 coach + 2 atleti).

**Strategia consigliata (nessuna migrazione utenti reali, ambiente ancora pre-produzione):**

1. Verifica su Hub (Cowork) se l'utente coach test ha già la tua email o va aggiornato.
2. Se sì → **password reset** via `forgot-password` (dominio Resend già verificato).
3. Se no → Cowork esegue update SQL su `auth.users` per settare la tua email sul coach test **oppure** crei nuovo utente da UI Auth e assegni `profiles.role='coach'` a mano.
4. Gli atleti test possono essere cancellati o riusati come sandbox.

**Dati persi:** solo dati di test in `geepag…`. Nessuna perdita rilevante — Cloud rimarrà comunque acceso in sola lettura come backup se serve export mirato.

---

## 6. Cosa si rompe subito allo switch

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Secret Stripe non impostati su Hub | checkout / webhook 500 | impostare `STRIPE_SECRET_KEY` prima di testare pagamenti |
| `STRIPE_WEBHOOK_SECRET` non ancora creato | webhook 401 | ricreare endpoint Stripe verso URL Hub post-deploy |
| 6 funzioni AI legacy usano `LOVABLE_API_KEY` | 500 su copilot/AI features | attende migrazione D2 a OpenAI (fuori scope cutover) |
| `types.ts` generato da Cloud potrebbe divergere da Hub | TS errors se schemi differiscono | Cowork rigenera: `supabase gen types typescript --project-id xgxtplqlewpqjzghvbke > src/integrations/supabase/types.ts` |
| Storage buckets su Hub | eventuali upload rotti se buckets mancanti | Cowork verifica `coach-avatars, coach-logos, coach-branding, chat-media, ai-knowledge-docs, food-photos` presenti |
| Login coach | credenziali Cloud non valgono su Hub | reset password (§5) |
| Realtime channels | funzionanti out-of-the-box su Hub se RLS ok | test post-cutover |

Non si rompe: layer client (usa solo env), RLS (già ON su Hub), edge deploy (config.toml già punta a Hub).

---

## 7. Piano cutover — ordinato, reversibile

**Pre-flight (Cowork, via connettore Hub, senza toccare `.env` repo).**

1. Diff `supabase_migrations.schema_migrations` Hub vs `ls supabase/migrations/` → conferma zero delta o applica mancanti.
2. Verifica storage buckets presenti (6 attesi).
3. Imposta secret Hub: `OPENAI_API_KEY`, `STRIPE_SECRET_KEY` (test). `RESEND_API_KEY` già ok.
4. Redeploy 15 edge functions dal repo → parità versione: `supabase functions deploy --project-ref xgxtplqlewpqjzghvbke`.
5. Prepara utente coach su Hub (update email su coach test esistente, oppure crea nuovo + `profiles.role='coach'`).
6. Rigenera `types.ts` dall'Hub → PR di Cowork per Code.

**Punto di rollback ✅ = qui.** Fino a ora `.env` non toccato, app ancora su Cloud.

**Cutover (Code / io, dopo tuo OK esplicito).**

7. Riscrivo `.env` con URL + anon key Hub.
8. Restart dev server, smoke test locale (login coach, dashboard).

**Post-cutover (tu + Cowork).**

9. Tu → dashboard Stripe: crea nuovo webhook endpoint verso `https://xgxtplqlewpqjzghvbke.supabase.co/functions/v1/stripe-webhook`, copia `whsec_…`.
10. Cowork → imposta `STRIPE_WEBHOOK_SECRET` su Hub.
11. Tu → login su preview con account coach Hub, invio invito atleta di test (verifica flusso Resend + RLS).
12. Publish Lovable per propagare `.env` in prod.

**Rollback in qualsiasi momento post-step 7:** ripristino `.env` ai valori Cloud (li conservo in commit precedente). App torna su `geepag…` senza data loss (Cloud è rimasto intatto).

---

## Chi fa cosa — riepilogo

| Attore | Compiti |
|---|---|
| **Cowork** | Step 1–6 (DB, secret non-Stripe, deploy edge, types.ts, utente coach) + step 10 |
| **Io (Code / Lovable)** | Step 7–8 (`.env` + smoke) + step 12 (publish) |
| **Tu (Nicolò)** | OK piano, step 9 (webhook Stripe), step 11 (test end-to-end), decisione publish |

---

**Domanda per procedere:** confermi Opzione A (sovrascrivere `.env`, Cloud rimane spento in background)? Vuoi che parta subito con Cowork sul pre-flight, o attendiamo che tu prepari anche le chiavi Stripe/OpenAI?
