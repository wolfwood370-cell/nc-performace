# DB_MIGRATION.md — Migrazione DB da Lovable Cloud a Supabase di proprietà

> **Stato:** BOZZA / assessment-only · **Data:** 2026-06-12 · **Release:** RC6
> **Progetto sorgente:** Lovable Cloud, Supabase ref `geepagjpequxsjsoahgw`
> **Natura di questa sessione:** _read-only_. Nessuna modifica al DB, nessuna migrazione eseguita, nessun push. Questo documento **pianifica**, non esegue.

---

## 0. Legenda owner dei passi

| Marca              | Significato                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 👤 **[UTENTE]**    | Lo fai TU: account, progetto, chiavi, DB URL, env/secrets, esecuzione comandi distruttivi. Claude documenta, non esegue. |
| 🤖 **[CLAUDE]**    | Lo può preparare Claude in worktree isolato (codice, comandi, migration files). Nessun push, nessuna esecuzione su DB.   |
| 🤝 **[CONGIUNTO]** | Claude prepara, tu esegui/confermi.                                                                                      |
| ⚠️                 | Passo potenzialmente distruttivo o irreversibile.                                                                        |

---

## 1. Vincolo di partenza (assunto, non ri-verificato)

Il backend è oggi su **Lovable Cloud**. L'istanza Supabase sottostante **non è nel tuo account**: non possiedi service-role key né DB URL, non esiste disconnessione/trasferimento automatico, e il connettore Supabase gestisce solo progetti di tua proprietà. Serve quindi una **migrazione manuale** verso un nuovo progetto Supabase tuo.

Conseguenza operativa centrale: **tutto ciò che richiede `pg_dump`/`psql` sul DB sorgente è bloccato finché non ottieni una connection string del progetto Lovable** (vedi §6 Fase 2 e §9 Decisione D1).

---

## 2. Stato attuale del backend (orientamento)

| Aspetto               | Valore rilevato                                                                                                                                         | Fonte                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Supabase project ref  | `geepagjpequxsjsoahgw`                                                                                                                                  | `supabase/config.toml`                                                                                 |
| Env names (solo nomi) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`                                                                        | `.env`                                                                                                 |
| Client                | `@supabase/supabase-js` v2.90 · `createClient<Database>` · `persistSession` su `localStorage`                                                           | `src/integrations/supabase/client.ts`                                                                  |
| Tipi                  | `src/integrations/supabase/types.ts` (92 KB, generato)                                                                                                  | repo                                                                                                   |
| Deploy model attuale  | Migrazioni applicate da Lovable al merge in `main`; functions deploy da Lovable Dashboard; env/secrets via Lovable UI; `types.ts` rigenerato da Lovable | `methodology/03-BACKEND-SUPABASE.md §1.1` (all'epoca, col vecchio nome, descriveva il modello Lovable) |
| Auth sociale          | OAuth Google/Apple/Microsoft via **`@lovable.dev/cloud-auth-js`** (non nativo Supabase)                                                                 | `src/integrations/lovable/index.ts`, `src/pages/Auth.tsx`                                              |

> ⚠️ Nota chiave: l'OAuth non passa da Supabase Auth nativo ma dalla libreria Lovable. Questo è un **cambio di codice**, non una semplice riconfigurazione (vedi §6 Fase 8 e Decisione D3).

---

## 3. Inventario di migrazione

Cosa deve spostarsi sul nuovo progetto. Quantità rilevate da `supabase/migrations/` (125 file) e `types.ts`.

### 3.1 Schema dati

| Elemento         | Conteggio               | Note                                                                                                                                                                                                                      |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelle `public` | **53**                  | 52 in `types.ts` + `appointments` (assente da `types.ts` per regen Lovable, presente come migration).                                                                                                                     |
| Enum `public`    | **12**                  | `user_role`, `subscription_status`, `workout_status`, `cycle_phase`, `meal_time`, `checkin_status`, `content_type`, `knowledge_doc_status`, `phase_focus_type`, `ticket_category`, `ticket_status`, `workout_log_status`. |
| Extension        | **`vector`** (pgvector) | Indispensabile per RAG (`match_documents`, `match_knowledge_chunks`, tabelle `knowledge_chunks`/`coach_knowledge_base`). Va abilitata sul nuovo progetto **prima** del restore.                                           |

Domini principali: profili/auth, programmi di allenamento (`program_*`, `workout_*`, `exercise*`), nutrizione (`nutrition_*`, `meal_logs`, `custom_foods`), tracking atleta (`daily_metrics`, `daily_readiness`, `body_measurements`, `athlete_cycle_settings`, `daily_cycle_logs`), chat/realtime (`chat_rooms`, `chat_participants`, `messages`), knowledge/RAG (`knowledge_documents`, `knowledge_chunks`), billing (`billing_plans`, `coach_products`, `athlete_subscriptions`, `invoices`), gamification (`badges`, `user_badges`, `leaderboard_cache`), supporto (`support_tickets`), AI usage (`user_ai_usage`, `athlete_ai_insights`), `appointments`.

### 3.2 Funzioni, trigger, RLS

| Elemento                    | Conteggio                                                                                     | Note                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funzioni Postgres           | **25**                                                                                        | Incl. helper `SECURITY DEFINER` per RLS anti-ricorsione (`is_room_member`, `shares_room_with`, `is_coach_of_athlete`, `is_my_athlete`, `is_my_coach`), RAG (`match_documents`, `match_knowledge_chunks`), clone/schedule programmi, `handle_new_user`, `prevent_profile_privilege_escalation`, watchdog/notify. |
| File con `SECURITY DEFINER` | **32**                                                                                        | Tutti `SET search_path = public`.                                                                                                                                                                                                                                                                               |
| Trigger                     | **~30**                                                                                       | `on_auth_user_created` (su `auth.users`), `update_*_updated_at` (~22 tabelle), `trg_notify_*`, `trg_watchdog_workout_alert`, `trg_prevent_profile_privilege_escalation`, `trg_workout_sync_version`, `update_room_on_message`, `on_program_soft_delete`.                                                        |
| Policy RLS                  | **53 tabelle** con RLS abilitato (342 statement `create policy` storici, inclusi rifacimenti) | Source-of-truth = migrazioni.                                                                                                                                                                                                                                                                                   |

> ⚠️ `on_auth_user_created` è un trigger sullo schema **`auth`** (non `public`). Negli schema dump standard Supabase, `auth`/`storage` sono **esclusi**: vanno ripristinati a parte (vedi §6 Fase 3/6).

### 3.3 Realtime

`ALTER PUBLICATION supabase_realtime ADD TABLE` per: **`messages`**, **`notifications`**, **`coach_alerts`**. (`workout_logs` era stato aggiunto e poi **rimosso** — AUDIT C7.) Membership catturata nelle migrazioni → si replica. Da verificare post-restore che la publication esista sul nuovo progetto.

### 3.4 Storage

6 bucket creati via `INSERT INTO storage.buckets` + policy su `storage.objects` (10 file migration coinvolti):

| Bucket                                           | Visibilità presunta |
| ------------------------------------------------ | ------------------- |
| `coach-avatars`, `coach-logos`, `coach-branding` | public              |
| `ai-knowledge-docs`, `chat-media`, `food-photos` | private             |

> ⚠️ Le **policy e i bucket** sono nelle migrazioni, ma i **file** (oggetti) sono righe nello schema `storage` e **non** sono nei dump schema: vanno copiati a parte (vedi §6 Fase 5).

### 3.5 Edge functions (15) → mappa secret

| Function                  | `verify_jwt`      | Dipendenza esterna            | Secret usati (oltre a `SUPABASE_*` auto)     |
| ------------------------- | ----------------- | ----------------------------- | -------------------------------------------- |
| `analyze-athlete-week`    | ✅                | Lovable AI                    | `LOVABLE_API_KEY`                            |
| `analyze-meal-photo`      | ✅                | Lovable AI (vision)           | `LOVABLE_AI_GATEWAY_URL`, `LOVABLE_API_KEY`  |
| `ask-copilot`             | ✅                | Lovable AI + OpenAI           | `LOVABLE_API_KEY`, `OPENAI_API_KEY`          |
| `chat-with-coach`         | ✅                | Lovable AI + OpenAI           | `LOVABLE_API_KEY`, `OPENAI_API_KEY`          |
| `generate-program`        | ✅                | Lovable AI                    | `LOVABLE_API_KEY`                            |
| `generate-batch-checkins` | ✅                | Lovable AI                    | `LOVABLE_API_KEY`                            |
| `ingest-knowledge`        | ✅                | OpenAI (embeddings)           | `OPENAI_API_KEY`                             |
| `create-checkout-session` | ✅                | Stripe                        | `STRIPE_SECRET_KEY`                          |
| `create-portal-session`   | ✅                | Stripe                        | `STRIPE_SECRET_KEY`                          |
| `stripe-webhook`          | ❌ (firma Stripe) | Stripe                        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `invite-athlete`          | ✅                | Resend                        | `RESEND_API_KEY`                             |
| `send-email`              | ✅                | Resend                        | `RESEND_API_KEY`                             |
| `forgot-password`         | ❌ (pubblica)     | Resend                        | `RESEND_API_KEY`                             |
| `check-achievements`      | ✅                | —                             | (solo supabase)                              |
| `delete-athlete`          | ✅                | — (service-role, cascade RPC) | (solo supabase)                              |

### 3.6 Secrets / variabili da ricreare sul nuovo progetto

Da impostare manualmente 👤: `OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, `LOVABLE_AI_GATEWAY_URL`.
Auto-iniettati da Supabase nelle functions (NON impostare a mano): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### 3.7 Auth

- Provider: email/password (nativo) + OAuth Google/Apple/Microsoft via libreria Lovable (§2).
- Trigger `handle_new_user` su `auth.users` crea il `profiles` row.
- `profiles.id` ha **FK → `auth.users(id)`**: gli utenti vanno migrati **prima** dei profili (vedi §6 Fase 6).
- Config Auth (redirect URLs, email template, SMTP, rate limit) vive **solo nel dashboard** (nessun `[auth]` in `config.toml`) → riconfigurazione manuale 👤.

### 3.8 Cron / scheduled job

**Nessun `pg_cron`/`cron.schedule` trovato nelle migrazioni.** Se esistono job schedulati (es. trigger periodico di `generate-batch-checkins` o `watchdog`), sono configurati **fuori dalle migrazioni** (Lovable Dashboard / scheduler esterno) → da verificare manualmente nel pannello Lovable 👤 e ricreare sul nuovo progetto (Supabase Scheduled Functions / `pg_cron`).

---

## 4. Dipendenze residue da Lovable DOPO lo spostamento del DB ⚠️

Spostare il DB **non** elimina Lovable dal sistema. Tre agganci sopravvivono:

| Aggancio                                                                           | Impatto                                                                             | Cosa fare                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lovable AI Gateway** (`LOVABLE_API_KEY`, `LOVABLE_AI_GATEWAY_URL`) — 6 functions | Se il gateway smette di rispondere fuori da Lovable Cloud, 6 endpoint AI si rompono | Decisione D2: confermare che la key resti valida stand-alone, **oppure** re-puntare le 6 functions a un provider diretto (OpenAI/Anthropic). |
| **`@lovable.dev/cloud-auth-js`** — OAuth social                                    | Login Google/Apple/Microsoft passa da Lovable                                       | Decisione D3: sostituire con `supabase.auth.signInWithOAuth` nativo + configurare i provider nel nuovo progetto. Cambio di codice.           |
| **`lovable-tagger`** (devDependency, `vite.config.ts`)                             | Solo build/preview, nessun impatto runtime/DB                                       | Opzionale: rimuovibile in un secondo momento, non blocca la migrazione.                                                                      |

---

## 5. Backup preventivo (PRIMA di tutto)

| Passo                                                                                                                                            | Owner                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Tag git dello stato RC6 (`git tag pre-db-migration-rc6`) come punto di ritorno del codice                                                        | 🤖 prepara comando · 👤 esegue |
| Conservare copia del `.env` attuale (valori Lovable) per rollback FE                                                                             | 👤                             |
| **Backup dati sorgente**: se piano Lovable/Supabase lo consente, scaricare un backup fisico o eseguire i dump di §6 Fase 2 e archiviarli offline | 👤                             |
| **Non spegnere/declassare Lovable** finché il nuovo progetto non è verificato in produzione                                                      | 👤                             |

---

## 6. Runbook ordinato

### Fase 0 — Pre-flight 🤝

1. 🤖 Crea branch worktree `claude/db-migration` (no push) per le modifiche di codice (OAuth, types, script npm).
2. 👤 Verifica billing/quota del nuovo progetto e regione (consigliata EU, es. `eu-central-1`, vicino agli atleti).
3. 👤 Completa il backup preventivo §5.

### Fase 1 — Creazione progetto Supabase di proprietà 👤 ⚠️(credenziali)

1. Crea account/org Supabase e **nuovo progetto**.
2. Salva in un password manager: **project ref**, **DB password**, **anon key**, **service-role key**, **connection string**. _(Claude non gestisce né vede queste chiavi.)_
3. Abilita l'extension **`vector`** (Dashboard → Database → Extensions) prima del restore.

### Fase 2 — Estrazione dal sorgente Lovable 👤 ⚠️ — NODO CRITICO

Due strade mutuamente esclusive (Decisione D1):

**Opzione A — con accesso al DB sorgente (preferita, migra anche i dati).**
Richiede la connection string del progetto Lovable (dal pannello Cloud di Lovable o via richiesta a Lovable). Poi (Supabase CLI):

```
supabase db dump --db-url "$SRC" -f roles.sql  --role-only
supabase db dump --db-url "$SRC" -f schema.sql
supabase db dump --db-url "$SRC" -f data.sql   --data-only
# auth/storage sono esclusi dai dump standard: diffa/esporta a parte
supabase db pull --db-url "$SRC" --schema auth,storage
```

Per gli utenti auth seguire la guida ufficiale "Migrating Auth Users Between Projects" (pg_dump di `auth.users` + `auth.identities`, preserva gli hash password).

**Opzione B — senza accesso al sorgente (fallback, solo schema).**
Ricostruisci **solo lo schema** replicando le 125 migrazioni sul nuovo progetto (Fase 3, ramo B). **Perdi**: dati, utenti auth, file storage. Atleti/coach dovrebbero re-registrarsi o usare reset password. Degradazione da accettare esplicitamente.

> Decisione D1 da prendere PRIMA di proseguire: A o B. Tutto il resto del runbook dipende da questa.

### Fase 3 — Ripristino schema sul nuovo progetto 🤝 ⚠️

- `supabase link --project-ref <NEW>` (👤 fornisce ref/password)
- **Ramo A:** `psql "$NEW" -f roles.sql` → imposta password dei ruoli LOGIN 👤 → `psql "$NEW" -f schema.sql` → ripristina trigger/policy di `auth`/`storage` dal pull.
- **Ramo B:** `supabase db push` (applica le migration locali). 🤖 può preparare/ordinare i file; 👤 esegue.
- Verifica: extension `vector` attiva, 25 funzioni presenti, ~30 trigger, RLS su 53 tabelle, publication `supabase_realtime` con `messages/notifications/coach_alerts`.

### Fase 4 — Dati (solo Ramo A) 👤 ⚠️

- Assicurati che il nuovo DB sia vuoto di dati prima del load.
- `psql "$NEW" -f data.sql`. Se emergono errori FK, carica con trigger disabilitati (`SET session_replication_role = replica;`) e riabilita dopo.

### Fase 5 — Storage 👤 ⚠️

- Bucket + policy: già nelle migrazioni (Fase 3) o via `config.toml [storage.buckets]`. Verifica i 6 bucket (§3.4) e la visibilità public/private.
- **File**: copia gli oggetti dai bucket sorgente con la guida Storage "Copy/Move Objects" / `supabase storage cp` / `rclone` via protocollo S3. Richiede accesso al sorgente.

### Fase 6 — Auth users (solo Ramo A) 👤 ⚠️ — ORDINE CRITICO

1. **Disabilita** temporaneamente il trigger `on_auth_user_created` (altrimenti l'import di `auth.users` genera `profiles` duplicati).
2. Importa `auth.users` + `auth.identities` (hash preservati → i login email/password continuano a funzionare).
3. Importa `profiles` (FK su `auth.users` ora soddisfatta).
4. **Riabilita** `on_auth_user_created`.

### Fase 7 — Edge functions + secrets 🤝 ⚠️(Stripe)

1. 👤 `supabase secrets set` per i 6 secret di §3.6 (i `SUPABASE_*` NON si impostano).
2. 👤 `supabase functions deploy` (tutte e 15; `config.toml` con `verify_jwt` è già corretto e si replica).
3. ⚠️ **Stripe**: crea un **nuovo endpoint webhook** nel Stripe Dashboard verso la nuova URL `…/functions/v1/stripe-webhook`, ottieni il **nuovo `STRIPE_WEBHOOK_SECRET`** e aggiornalo nei secrets. Aggiorna eventuali domini in Customer Portal/Checkout.

### Fase 8 — Frontend: env + codice + tipi 🤝

1. 👤 Aggiorna `.env` (valori nuovo progetto): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
2. 🤖 (worktree) **OAuth**: sostituisci `@lovable.dev/cloud-auth-js` in `src/integrations/lovable/index.ts` e `src/pages/Auth.tsx` con `supabase.auth.signInWithOAuth(...)` nativo. 👤 configura i provider OAuth (Google/Apple/Microsoft: client id/secret + redirect URL) nel dashboard del nuovo progetto.
3. 🤝 **Rigenera `types.ts`**: `supabase gen types typescript --linked > src/integrations/supabase/types.ts`. _(Ora include `appointments` → vedi §8: la legge #7 hand-patch diventa obsoleta.)_ Aggiungi uno script npm `gen:types`.
4. 🤖 **Build gate:** `npx tsc --noEmit -p tsconfig.app.json` verde.

### Fase 9 — Cutover & smoke test 🤝

1. 👤 Re-deploy del FE con le nuove env.
2. 👤 Riconfigura Auth nel dashboard: redirect URLs, email template, SMTP (se custom), rate limit.
3. 🤝 Smoke test: login email + OAuth · `SELECT` su `profiles` = 200 (no ricorsione RLS) · chat realtime · upload foto pasto · `generate-program` (AI) · checkout Stripe (test mode) + ricezione webhook · invito atleta (email Resend).
4. 👤 Periodo di osservazione in parallelo prima di dismettere Lovable.

---

## 7. Rollback

| Situazione                                          | Rollback                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Problemi prima del cutover FE                       | Nessuno: il nuovo progetto è **additivo**, Lovable resta intatto.                                             |
| Problemi dopo aver puntato le env al nuovo progetto | Ripristina il `.env` Lovable salvato (§5) + re-deploy FE. Ritorno immediato al backend originale.             |
| Schema/dati corrotti sul nuovo progetto             | Droppa/ricrea il nuovo progetto e ripeti dai dump `.sql` archiviati. Il sorgente Lovable non è stato toccato. |
| Codice OAuth/types già modificato                   | Le modifiche vivono nel branch `claude/db-migration`: revert del branch, il `main` resta pulito.              |

**Punto di non ritorno:** lo spegnimento/declassamento di Lovable Cloud. Eseguirlo **solo** dopo giorni di verifica in produzione del nuovo backend. Finché Lovable è attivo, il rollback è sempre a costo ~zero.

---

## 8. Implicazioni sulla metodologia (modello "DB di proprietà")

Lo spostamento cambia premesse codificate in `CLAUDE.md` e `methodology/03-BACKEND-SUPABASE.md` (all'epoca col vecchio nome Lovable):

| Tema                                     | Oggi (Lovable Cloud)                          | Dopo (DB di proprietà)                                                                          |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Deploy migrazioni                        | Lovable applica al merge in `main`            | 👤 `supabase db push` (o CI) — passo nuovo, prima implicito                                     |
| Deploy edge functions                    | Lovable Dashboard                             | 👤 `supabase functions deploy`                                                                  |
| `types.ts`                               | Rigenerato da Lovable (droppa `appointments`) | 🤝 `supabase gen types --linked` (deterministico, **include `appointments`**)                   |
| **Legge #7** (hand-patch `appointments`) | Necessaria                                    | **Obsoleta** — il regen di proprietà non droppa più il blocco                                   |
| Secrets/env                              | Lovable UI                                    | 👤 `supabase secrets set` + dashboard                                                           |
| **Legge #11** (Security = Lovable)       | Ownership del Security Agent di Lovable       | **Quell'agente non esiste più** → ownership ridefinita in D5 (✅ risolta: condivisa, metodo v2) |

Vedi **Appendice A** per il diff proposto a `CLAUDE.md`.

> ✅ **Applicato in "metodo v2" (2026-07-04):** `CLAUDE.md` legge #7/#11 + §4/§7 aggiornati, `03` rinominato in `03-BACKEND-SUPABASE.md`, **D5 risolta** (ownership condivisa: Code = codice sicuro + `/security-review`; Cowork = advisors/RLS/DB via connettore col benestare di Nick).

---

## 9. Lista rischi

| #   | Rischio                                                              | Severità  | Mitigazione                                                                                                        |
| --- | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| R1  | Nessun accesso al DB sorgente → impossibile migrare dati/utenti/file | **Alta**  | Decisione D1: ottenere connection string da Lovable; altrimenti Opzione B (solo schema) con perdita dati esplicita |
| R2  | Hash password non esportabili → tutti gli utenti devono resettare    | **Alta**  | Migrare `auth.users`+`auth.identities` via guida ufficiale (richiede R1 risolto)                                   |
| R3  | Lovable AI Gateway non più raggiungibile → 6 functions AI down       | **Alta**  | Decisione D2: confermare validità key stand-alone o re-point a OpenAI/Anthropic                                    |
| R4  | OAuth social rotto durante la transizione (libreria Lovable)         | **Media** | Decisione D3: codice nativo + provider configurati prima del cutover                                               |
| R5  | Stripe webhook desync (secret/endpoint diversi)                      | **Media** | Nuovo endpoint + nuovo `STRIPE_WEBHOOK_SECRET` (Fase 7)                                                            |
| R6  | `pgvector` non abilitato / dimension mismatch su embeddings          | **Media** | Abilitare `vector` prima del restore; verificare dimensioni colonne `knowledge_chunks`                             |
| R7  | Publication `supabase_realtime` non ricreata → chat/notifiche mute   | **Media** | Verifica esplicita post-restore (Fase 3)                                                                           |
| R8  | Trigger `auth`/`storage` persi (esclusi dai dump standard)           | **Media** | `supabase db pull --schema auth,storage` e ripristino separato                                                     |
| R9  | Ordine FK errato in import (profiles prima di auth.users)            | **Media** | Fase 6 ordine critico + trigger disabilitato durante import                                                        |
| R10 | File storage non copiati (solo bucket/policy migrati)                | **Media** | Fase 5 copia oggetti dedicata                                                                                      |
| R11 | Gestione errata di service-role key (leak)                           | **Alta**  | Solo lato server/secrets, mai nel bundle; owner = utente                                                           |
| R12 | Job schedulati non documentati nelle migrazioni dimenticati          | **Bassa** | Verifica pannello Lovable (§3.8) prima del cutover                                                                 |

---

## 10. Decisioni aperte (da approvare prima di qualsiasi esecuzione)

| ID     | Decisione                                                                                                                             | Perché serve                                                              | Default proposto                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Come ottenere accesso al DB sorgente? Opzione A (con connection string/export da Lovable) o B (solo schema, perdita dati)?            | Determina se migriamo i dati o ripartiamo a vuoto. Blocca tutto il resto. | Tentare A; B solo se Lovable non concede accesso                                                                                                      |
| **D2** | Destino del Lovable AI Gateway: mantenere `LOVABLE_API_KEY` o re-puntare le 6 functions AI a un provider diretto?                     | 6 endpoint AI dipendono dal gateway                                       | Verificare validità key; pianificare re-point a OpenAI come piano B                                                                                   |
| **D3** | OAuth social: mantenere Google/Apple/Microsoft con codice nativo Supabase?                                                            | Richiede credenziali provider e cambio di codice                          | Sì, migrare a `supabase.auth.signInWithOAuth`                                                                                                         |
| **D4** | Hosting FE: resta su Lovable Publish o si sposta (Vercel/Netlify)?                                                                    | La migrazione DB non lo impone ma è legato alle env/redirect              | Disaccoppiare in step successivo, non in questo                                                                                                       |
| **D5** | ✅ RISOLTA (2026-07-04, metodo v2) — Security ownership (legge #11): chi possiede ora la security senza il Security Agent di Lovable? | Senza Lovable serveva un nuovo modello                                    | Ownership condivisa: Code = codice sicuro + `/security-review`; Cowork = advisors/RLS/DB via connettore col benestare di Nick (`CLAUDE.md` legge #11) |
| **D6** | Timing del cutover e durata della finestra in parallelo Lovable↔nuovo                                                                 | Definisce quando è sicuro dismettere Lovable                              | ≥ qualche giorno di osservazione                                                                                                                      |

---

## Appendice A — Proposta diff `CLAUDE.md` (NON applicata)

> Da approvare prima di committare. Tocca le sezioni indicate (#7 e legge #11), più due touchpoint correlati per coerenza.

**§3 — Legge #7 (riformulazione, l'hand-patch diventa obsoleto):**

```diff
-7. **Hand-patch resilience**: dopo ogni merge da `origin/main`, verifica blocco `appointments` in `src/integrations/supabase/types.ts`.
+7. **Types ownership**: `types.ts` è rigenerato da te via `supabase gen types typescript --linked` (DB di proprietà). Il blocco `appointments` non viene più droppato: l'hand-patch storico è obsoleto. Rigenera dopo ogni cambio di schema.
```

**§3 — Legge #11 (Security: da Lovable a ownership condivisa):**

```diff
-11. **Security = Lovable**: i security issues (RLS, edge auth, SECURITY DEFINER, Realtime, advisor warnings) sono **ownership di Lovable Security Agent**, NON di Claude. Vedi `methodology/03-BACKEND-LOVABLE.md §0` per il workflow completo. Claude interviene su security solo se l'utente lo chiede esplicitamente.
+11. **Security = ownership condivisa (DB di proprietà)**: non esiste più il Lovable Security Agent. RLS, edge auth, SECURITY DEFINER, Realtime scoping e advisor Supabase sono ora responsabilità **utente + Claude**. Claude può proporre migration/policy in worktree, ma ogni applicazione su DB è eseguita/approvata dall'utente (operazione potenzialmente distruttiva → resta STOP & ASK in §5). Vedi `methodology/03-BACKEND-SUPABASE.md §0`.
```

**§7 — Tabella file di metodologia (descrizione + rename suggerito):**

```diff
-| [`methodology/03-BACKEND-LOVABLE.md`](.claude/methodology/03-BACKEND-LOVABLE.md) | Supabase + Lovable Cloud + edge functions + security.      |
+| [`methodology/03-BACKEND-SUPABASE.md`](.claude/methodology/03-BACKEND-SUPABASE.md) | Supabase di proprietà + edge functions + CLI deploy + security. |
```

**Touchpoint correlati (segnalati, non nel diff minimo richiesto):**

- §4 _decision flow_: il ramo "⚠ security → defer al Security Agent di Lovable" va riscritto (non c'è più Lovable); aggiornare anche il puntatore al file di metodologia backend.
- `methodology/03-BACKEND-SUPABASE.md` (all'epoca col vecchio nome): §0 (security ownership), §1.1 (deploy/env/types via Lovable), §8.2 (migration applicata al merge) e §10.3 (observability Lovable) sono da riscrivere per il modello CLI/owned. Rename e riscritture **eseguiti** in "metodo v2" (2026-07-04, vedi riga di stato in §8).

---

## Appendice B — Comandi di riferimento (per l'esecuzione futura, NON eseguiti qui)

```
# Link al nuovo progetto
supabase login
supabase link --project-ref <NEW_REF>

# Dump dal sorgente (richiede connection string Lovable)
supabase db dump --db-url "$SRC" -f roles.sql  --role-only
supabase db dump --db-url "$SRC" -f schema.sql
supabase db dump --db-url "$SRC" -f data.sql   --data-only
supabase db pull  --db-url "$SRC" --schema auth,storage

# Ripristino sul nuovo progetto
psql "$NEW_DB_URL" -f roles.sql      # poi: ALTER ROLE ... PASSWORD ...
psql "$NEW_DB_URL" -f schema.sql
psql "$NEW_DB_URL" -f data.sql       # eventualmente con session_replication_role=replica

# Oppure (Ramo B, solo schema dalle migrazioni)
supabase db push

# Secrets + functions
supabase secrets set OPENAI_API_KEY=... RESEND_API_KEY=... STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... LOVABLE_API_KEY=... LOVABLE_AI_GATEWAY_URL=...
supabase functions deploy

# Tipi + build gate
supabase gen types typescript --linked > src/integrations/supabase/types.ts
npx tsc --noEmit -p tsconfig.app.json
```

---

### Fonti (documentazione Supabase)

- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase)
- [Migrating Auth Users Between Projects](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects)
- [Storage — Copy/Move Objects](https://supabase.com/docs/guides/storage/management/copy-move-objects)
- [CLI: db dump](https://supabase.com/docs/reference/cli/supabase-db-dump) · [CLI Reference](https://supabase.com/docs/reference/cli/introduction)
