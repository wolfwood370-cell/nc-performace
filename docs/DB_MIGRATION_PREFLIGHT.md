# DB_MIGRATION_PREFLIGHT.md — Validazione statica delle 125 migrazioni

> **Stato:** read-only · **Data:** 2026-06-13 · **Scope:** Opzione B (schema-only) · **Nessuna operazione sul DB.**
> **Esito:** ✅ **GO** — il set è replicabile in ordine su un progetto Supabase vergine. Rischio = operativo (apply sequenziale), non di schema.

Companion di [`DB_MIGRATION.md`](./DB_MIGRATION.md). Questo documento valida la **Fase 3 ramo B** (replay schema dalle migrazioni) prima di toccare il connettore.

---

## 1. Metodo

Analisi statica (scan/grep) dei 125 file `.sql` in `supabase/migrations/`. Nessuna connessione al DB sorgente né al nuovo progetto. Obiettivo: confermare che il replay in ordine cronologico su un progetto Supabase nuovo non incontri blocchi strutturali.

## 2. Esito sintetico

| Check                                                         | Esito                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ordinamento (timestamp univoci; lessicografico = cronologico) | ✅ nessun duplicato                                                                                          |
| Ruoli custom (`CREATE ROLE`)                                  | ✅ nessuno; grant solo a `authenticated` / `public` / `service_role` (standard Supabase)                     |
| Idempotenza                                                   | ✅ 87× `IF NOT EXISTS` · 39× `CREATE OR REPLACE` · 194× `DROP ... IF EXISTS`                                 |
| pgvector                                                      | ✅ `CREATE EXTENSION` nello stesso file del primo uso (`20260215160406`), prima della colonna `vector(1536)` |
| Auth bootstrap                                                | ✅ `handle_new_user` + trigger `on_auth_user_created` nel 1° file (`20260109192244`)                         |
| auth / storage / realtime                                     | ✅ schemi e publication `supabase_realtime` standard (esistono di default su Supabase)                       |
| `ALTER ... OWNER TO` / ref Lovable in SQL / Vault             | ✅ 0 / 0 / 0 (l'unico hit `service_role_key` è un commento)                                                  |
| Migrazione bloccata by-design (`realtime_topic_scoping`)      | ✅ wrappata in `DO $$ ... EXCEPTION` → non fa fallire il run (vedi 03-BACKEND §0.6)                          |
| `DROP TABLE` / `DROP COLUMN`                                  | ✅ 3 totali, tutti in-sequenza + `IF EXISTS`                                                                 |

## 3. Inventario atteso (target di verifica post-apply)

| Oggetto              | Atteso                                      | Note                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelle `public`     | ~53                                         | 54 `CREATE TABLE` (incl. 1 ricreazione)                                                                                                                                                                                                        |
| Enum                 | 13                                          | `user_role`, `subscription_status`, `billing_sub_status`, `workout_status`, `workout_log_status`, `cycle_phase`, `meal_time`, `checkin_status`, `content_type`, `knowledge_doc_status`, `phase_focus_type`, `ticket_category`, `ticket_status` |
| Funzioni             | ~25                                         | 36 `CREATE OR REPLACE FUNCTION` (incl. riedizioni nel tempo)                                                                                                                                                                                   |
| Trigger              | ~32                                         | incl. `on_auth_user_created`, `update_*_updated_at`, watchdog/notify                                                                                                                                                                           |
| Index                | ~74                                         | incl. `hnsw (embedding vector_cosine_ops)`                                                                                                                                                                                                     |
| Policy RLS           | stato cumulativo                            | 341 `CREATE POLICY` / 151 `DROP POLICY` nella storia → la RLS finale è il risultato cumulativo                                                                                                                                                 |
| Publication realtime | `messages`, `notifications`, `coach_alerts` | `workout_logs` aggiunto e poi rimosso (AUDIT C7)                                                                                                                                                                                               |
| Embedding dim        | `vector(1536)`                              | coerente con OpenAI embeddings (`ingest-knowledge`)                                                                                                                                                                                            |

## 4. Flag residui (bassi) + mitigazione

| #   | Flag                                                                            | Severità | Mitigazione                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PF1 | 125 apply sequenziali via connettore                                            | Bassa    | `apply_migration` in ordine; stop al 1° errore; l'idempotenza rende sicuro il re-run dei precedenti                                     |
| PF2 | pgvector senza schema esplicito nel 1° `CREATE` (risoluzione via `search_path`) | Bassa    | identico al sorgente, già funzionante su Lovable/Supabase; il 2° create (`20260430`) è `WITH SCHEMA extensions` `IF NOT EXISTS` (no-op) |
| PF3 | Trigger su `auth.users` + policy su `storage.objects` (privilegi)               | Bassa    | `apply_migration` gira con privilegi elevati; eventuale `insufficient_privilege` emerge al 1° errore, non corrompe nulla                |
| PF4 | RLS = stato cumulativo di molte riscritture                                     | Bassa    | verifica post-apply con `get_advisors` (**solo report**, D5 aperta) + smoke `SELECT profiles`                                           |

## 5. Meccanismo di apply raccomandato (all'approvazione)

1. `confirm_cost` (0 €) → `create_project` (org `umydelvpdzieopddfhpf`, region `eu-central-1`, name `nc-performance-hub`).
2. Verifica `vector` con `list_extensions` (il 1° `CREATE EXTENSION` è già nelle migrazioni; enable esplicito pre-apply opzionale).
3. `apply_migration` per i 125 file **in ordine**, con `version` = prefisso a 14 cifre del filename → la migration history del nuovo progetto resta allineata ai file locali (`supabase db push` / `gen types --linked` futuri coerenti).
4. **Stop al 1° errore**: riporto file + riga, decido/correggo, riprendo. I precedenti restano applicati (idempotenti).
5. Verifica finale: `list_tables` (~53), `list_migrations` (125), publication realtime, `get_advisors` (report).

## 6. Conclusione

✅ **GO.** Nessun blocco strutturale al replay schema-only. Si può creare il progetto e replicare lo schema con fiducia. Il punto di attenzione è esclusivamente operativo (apply sequenziale di 125 file), già mitigato da idempotenza diffusa e da uno stop-al-primo-errore.

---

_Pre-flight generato il 2026-06-13 (sessione Cowork, connettore Supabase). Read-only: nessuna operazione eseguita sul DB._
