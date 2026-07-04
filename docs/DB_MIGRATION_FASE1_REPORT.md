# DB_MIGRATION_FASE1_REPORT.md — Esito Fase 1 (schema su Supabase di proprietà)

> **Data:** 2026-06-13 · **Sessione:** Cowork (connettore Supabase) · **Stato:** ✅ **schema applicato e verificato.**
> Companion di [`DB_MIGRATION.md`](./DB_MIGRATION.md) e [`DB_MIGRATION_PREFLIGHT.md`](./DB_MIGRATION_PREFLIGHT.md).

---

## 1. Progetto creato

| Campo                              | Valore                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Nome                               | **nc-performance-hub**                                                                                                                     |
| Project ref / ID                   | **`xgxtplqlewpqjzghvbke`**                                                                                                                 |
| Region                             | `eu-central-1` (Frankfurt)                                                                                                                 |
| API URL                            | `https://xgxtplqlewpqjzghvbke.supabase.co`                                                                                                 |
| Publishable key (pubblica)         | `sb_publishable_Hr-lQDDqFZZXZgfjLK999A_JkCfRg1f`                                                                                           |
| Anon key legacy (pubblica, compat) | `eyJhbGciOiJIUzI1NiIs…UJyqOUl1FszPDVrGG3_asK-73V5eJu3-G08R2ibG9h0`                                                                         |
| Organizzazione                     | `wolfwood370-cell's Org` (`umydelvpdzieopddfhpf`)                                                                                          |
| Costo                              | **0 €/mese** (Free tier)                                                                                                                   |
| ⚠️ **DB password**                 | **da recuperare e salvare TU** dal Dashboard → Project Settings → Database (serve per `supabase link`). Claude non la vede né la gestisce. |

> `service_role` key e DB password sono **secret**: non sono in questo documento. Publishable/anon key sono pubbliche (vanno nel bundle) → ok documentarle.

## 2. Cosa è stato applicato

- **125 migrazioni replicate** via connettore (`apply_migration` in **10 chunk**), con confini posti dopo i 3 `ALTER TYPE … ADD VALUE` (enum) per rispettare i limiti transazionali.
- **2 tabelle out-of-band ricostruite** (vedi §4): `body_measurements`, `nutrition_daily_summary`.
- **Migration history riconciliata**: `supabase_migrations.schema_migrations` ora contiene **126 version** (125 originali + 1 correttiva), 0 righe-artefatto. ⇒ i `supabase db push` futuri vedono tutto già applicato (no-op pulito).

## 3. Verifica post-apply (tutto coerente)

| Check                              | Risultato                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Tabelle `public` · senza RLS       | **54** · **0** (tutte con RLS)                                                                                                     |
| Tabelle con policy                 | **54 / 54**                                                                                                                        |
| Enum                               | **13** — i 3 `ADD VALUE` applicati (`content_type+ai_knowledge`, `billing_sub_status+canceling`, `workout_log_status+in_progress`) |
| Funzioni · SECURITY DEFINER        | 24 · 20                                                                                                                            |
| Trigger `public` · su `auth.users` | 32 · **1** (`on_auth_user_created`)                                                                                                |
| Policy `public` · `storage`        | 213 · 30                                                                                                                           |
| Publication realtime               | **`coach_alerts, messages, notifications`** (`workout_logs` aggiunto e poi rimosso)                                                |
| `vector`                           | schema `extensions`, dim 1536                                                                                                      |
| Advisor security                   | **0 errori**, solo WARN (vedi §4 ADV)                                                                                              |

## 4. ⚠️ Da verificare / sistemare (debiti di questa fase)

| #       | Item                                                | Dettaglio                                                                                                                                                                                                                                                                                                                                      | Owner                      |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **OB1** | `body_measurements` — **RLS ricostruita**           | Nessun `CREATE TABLE` nelle 125 migrazioni (creata a mano nel dashboard Lovable). Colonne prese da `types.ts`; **RLS ricostruita** col pattern standard atleta: _atleta gestisce le proprie righe (`FOR ALL`) + coach legge via `is_coach_of_athlete`_. **Verifica che corrisponda all'intento** (è dato sanitario).                           | 👤                         |
| **OB2** | `nutrition_daily_summary` — ricostruita             | Idem out-of-band. Le 5 policy le ha aggiunte il blocco guarded di AUDIT C5. Tipi colonna (`INTEGER`/`NUMERIC`) ricostruiti da `types.ts` — verifica.                                                                                                                                                                                           | 👤                         |
| **OB3** | File migrazione correttiva                          | Aggiungere `supabase/migrations/20260515122000_reconstruct_out_of_band_tables.sql` al repo (file pronto in `outputs/`) così il repo è self-completo per i `db push` futuri.                                                                                                                                                                    | 🤖 (fase codice, worktree) |
| **R1**  | `realtime.messages` topic_scoping **non applicata** | Bloccata da schema managed (`insufficient_privilege`) — **identico a Lovable** (`03-BACKEND §0.6`). L'advisor "any authenticated user can subscribe" resta **OPEN by design**; l'app è sicura sui `postgres_changes` (RLS sulle tabelle source).                                                                                               | nessuna azione             |
| **R2**  | `supabase/config.toml` `project_id`                 | ancora `geepagjpequxsjsoahgw` (Lovable) → aggiornare a `xgxtplqlewpqjzghvbke` nella fase env.                                                                                                                                                                                                                                                  | 🤖 (fase codice)           |
| **ADV** | Advisor security (WARN)                             | 0 ERROR. WARN su _SECURITY DEFINER executable_ (anon/auth), _public bucket listing_ (coach-logos/avatars/branding), _search_path mutable_ (`set_appointments_updated_at`): **stessi findings deferiti del sorgente**. Ownership = Decisione **D5** (✅ risolta 2026-07-04, metodo v2: ownership condivisa — vedi `03-BACKEND-SUPABASE.md §0`). | report-only                |

## 5. Prossimi passi — Fase 1, step 8–14 (prossima sessione)

| #   | Passo                                                                                                                                                                                                                                     | Owner         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 8   | Impostare i **secrets** edge: `OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, `LOVABLE_AI_GATEWAY_URL` (no `SUPABASE_*`). Nessun tool connettore per i secret → dashboard/CLI.       | 👤            |
| 9   | Deploy 15 edge functions (`verify_jwt`: 13 true; `stripe-webhook` + `forgot-password` false)                                                                                                                                              | 🤖/🤝         |
| 10  | **Stripe**: nuovo endpoint webhook → `…/functions/v1/stripe-webhook` → nuovo `STRIPE_WEBHOOK_SECRET`                                                                                                                                      | 👤 ⚠️         |
| 11  | **OAuth nativo**: sostituire `@lovable.dev/cloud-auth-js` (`src/integrations/lovable/index.ts`, `src/pages/Auth.tsx`) con `supabase.auth.signInWithOAuth` (email + Google); rimuovere `lovable-tagger` (`vite.config.ts`, `package.json`) | 🤖 (worktree) |
| 12  | `.env` + `config.toml` ai valori del nuovo progetto (URL/publishable/project_id)                                                                                                                                                          | 🤖            |
| 13  | Rigenerare `types.ts` (`generate_typescript_types --linked`) + script npm `gen:types`. Include `appointments` → **legge #7 obsoleta**                                                                                                     | 🤝            |
| 14  | **Build gate** `tsc --noEmit -p tsconfig.app.json` + commit atomici IT (no push)                                                                                                                                                          | 🤖            |
| 15  | Config Google (client id/secret + redirect) + Auth dashboard · smoke test                                                                                                                                                                 | 👤 + 🤝       |

## 6. Prompt pronto per la nuova chat

```
Prosecuzione migrazione nc-performance-hub (Lovable → Supabase mio). La FASE 1 SCHEMA è
FATTA: progetto Supabase "nc-performance-hub" ref xgxtplqlewpqjzghvbke (eu-central-1),
125 migrazioni replicate via connettore + 2 tabelle out-of-band ricostruite
(body_measurements, nutrition_daily_summary), migration history riconciliata a 126 version,
54 tabelle tutte con RLS, advisor 0 errori. Dettagli in docs/DB_MIGRATION_FASE1_REPORT.md.

Leggi prima: CLAUDE.md + .claude/methodology/00-CORE.md + 03-BACKEND-SUPABASE.md, e
docs/DB_MIGRATION_FASE1_REPORT.md (stato + debiti §4 + prossimi passi §5).

Guardrail invariati: risposte/commit in italiano; worktree isolato; MAI push; build gate
tsc --noEmit -p tsconfig.app.json; secrets/credenziali le imposto io; security = D5 (report-only).

Obiettivo: Fase 1 step 8–14 — deploy edge functions (io imposto i secret), codice OAuth nativo
Supabase + rimozione lovable-tagger, .env/config.toml/types.ts al nuovo progetto, build gate.
Aggiungi anche il file supabase/migrations/20260515122000_reconstruct_out_of_band_tables.sql
(pronto in outputs/) e verifica con me la RLS ricostruita di body_measurements (§4 OB1).
Comincia proponendo il piano prima di eseguire.
```

---

_Generato 2026-06-13 (Cowork, connettore Supabase ref `e1acde72-…`). Nessuna operazione distruttiva sul sorgente Lovable: resta intatto per rollback._
