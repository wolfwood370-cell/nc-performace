# PRODUCT_SPEC — nc-performance-hub

> **Spec estratta dal codice** (repo allo stato RC6, 2026-06-12). Cattura **struttura, logiche, scienza e comportamenti** delle due piattaforme (Coach + Atleta) così come sono _realmente_ implementate.
> Scopo: documento riusabile per (a) la migrazione da Lovable, (b) il refactor mirato, (c) un eventuale rebuild del frontend, (d) contesto di lavoro per Claude Code / Fable 5.
> Metodo: lettura diretta del codice (pagine, hook, store, `src/lib/math`, edge functions, migrazioni) da parte di 4 estrazioni parallele. Dove un comportamento è atteso ma non implementato è marcato **(non implementato)** o **(mock)**; i dubbi come **(da confermare)**.

## Indice

1. Architettura & struttura
2. Stato di maturità: reale vs mock _(leggere prima di decidere rebuild)_
3. Modello dati
4. La scienza & gli algoritmi
5. Coach Platform
6. Athlete App
7. Backend: edge functions, RLS, realtime, storage, trigger
8. Incongruenze, debiti tecnici & implicazioni per la decisione

---

## 1. Architettura & struttura

**Stack** (da `CLAUDE.md` + repo): React 18 · Vite 5 · TypeScript strict · Tailwind + shadcn/ui · TanStack Query v5 (persist IndexedDB) · Zustand + immer · React Router v6 · Framer Motion. Backend Supabase (oggi Lovable Cloud) · Stripe · 15 edge function Deno. 213 file `.ts/.tsx`.

**Dual interface** (mai mescolare i temi):

| Ambito             | Target               | Tema                                                                                | Note                                       |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| **Coach Platform** | Web-first responsive | Aura Health System (token `bg-primary`, `surface-container-*`, `font-display`)      | Shell `CoachLayout` (sidebar + bottom-nav) |
| **Athlete App**    | Mobile-only PWA      | Aura "glass" light-forced (`forcedTheme="light"`, `brand-container`, Manrope/Inter) | Shell `AthleteLayout` (bottom-nav 2 voci)  |

**Routing** (`src/App.tsx`, tutte le pagine lazy-loaded):

- **Coach** (15 route, tutte dentro `SubscriptionGuard`): `/coach` (Home), `/coach/athletes`, `/coach/athlete/:id`, `/coach/programs` (ProgramBuilder), `/coach/calendar`, `/coach/messages`, `/coach/library`, `/coach/exercises`, `/coach/analytics`, `/coach/business`, `/coach/inbox`, `/coach/fms`, `/coach/knowledge`, `/coach/copilot`, `/coach/settings`.
- **Atleta** (dentro `ProtectedAthleteRoute`): `/athlete` (layout → `index` Dashboard, `training`, `profile`, `nutrition` entitlement-gated) + sibling full-screen `/athlete/daily-checkin`, `/athlete/weekly-checkin`, `/athlete/exercise-preview`, `/athlete/active-workout`, `/athlete/post-workout`. (Le pagine mock `/athlete/readiness`, `/athlete/readiness/today`, `/athlete/training/phase`, `/athlete/analytics`, `/athlete/analytics/acwr` sono state rimosse — fetta pagine-da-scollegare, 2026-08-11.)
- **Pubblico**: `/auth`, `/reset-password`, `/onboarding`, `/privacy`, `/terms`.

**State management**: TanStack Query per lo stato server (persistito su IndexedDB); Zustand+immer per stato client complesso (`stores/programBuilder`, `useAthleteReadinessStore`, `useAthleteWorkoutStore`, `useMovementStore`); React state locale per il resto.

**Cuore "scienza"**: `src/lib/math/` (`constants`, `readinessMath`, `nutritionMath`, `adaptiveTDEE`, `trainingMetrics`) — moduli puri, zero dipendenze, testabili. Vedi §4.

---

## 2. Stato di maturità: reale vs mock

> **Sezione chiave per la decisione "rebuild da zero".** Il progetto sembra "molto avanti", ma la maturità è **molto disomogenea** tra i tre strati.

| Strato                               | Maturità                            | Dettaglio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend (DB, RLS, edge, scienza)** | 🟢 **Reale e robusto**              | 53 tabelle con relazioni coerenti; RLS hardened (helper SECURITY DEFINER, anti-escalation, advisor fixes); 15 edge function con auth/ownership/rate-limit; modelli matematici reali e isolati in `src/lib/math`. **Questa è la parte di valore — va preservata.**                                                                                                                                                                                                                                                                             |
| **Coach Platform (frontend)**        | 🟡 **Funzionale con isole di mock** | Flussi core reali (roster, athlete detail, program builder, messaggi, inbox check-in, business/Stripe, FMS, knowledge/copilot). Ma diversi placeholder: MRR stimato, chart AdvancedStats/BodyMetrics, ACWR/"fase" nel context pane chat, Google Calendar, engine auto-regolazione del ProgressionInspector (salva solo in-memory).                                                                                                                                                                                                            |
| **Athlete App (frontend)**           | 🟠 **In gran parte scaffold/mock**  | Solo **3 flussi** persistono davvero: onboarding (`profiles`+`coach_alerts`), daily readiness (`daily_readiness`), active-workout (`workout_logs`+`exercise_logs`+debrief). Dashboard "prossimo workout", blueprint, preview, weekly check-in, **tutte le analytics atleta** e la mappa dolori = **dati mock**. Il **widget nutrizione è omesso**. Le capability PWA (Wake Lock, haptics `navigator.vibrate`, Web Audio, Media Session, coda offline IndexedDB) **esistono come librerie ma non sono importate da nessuna schermata atleta**. |

**Implicazione diretta sulla domanda "ricostruire da zero?":** il "già molto avanti ma appestato" vale soprattutto per il **frontend atleta**, che è più vicino a un prototipo di quanto sembri. Il **backend e la scienza NON sono appestati**: sono la parte solida. Quindi il candidato ragionevole a un "rebuild" è il **frontend (in particolare l'app atleta)**, **sopra lo stesso backend** — non l'intero sistema. Vedi §8 per la raccomandazione consolidata.

## 3. Modello dati

> Da `src/integrations/supabase/types.ts` + `supabase/migrations/**`. Schema `public`. PK sempre `id uuid` (default `gen_random_uuid()`) salvo dove indicato.

### Auth / profili

| Tabella         | Colonne chiave                                                                                                                                                                                                                                                                                                                                                                                         | FK / note                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `profiles`      | `id` (= `auth.users.id`), `full_name`, `role` (enum `user_role`), `coach_id`, `onboarding_completed`, `onboarding_data` jsonb, `subscription_tier`, `subscription_status`, `current_period_end`, `experience_level`, `neurotype`, `one_rm_data` jsonb, `red_flags` jsonb, `medical_clearance_required`, `fms_exclusion_zones[]`, `settings`/`preferences` jsonb, `avatar_url`/`logo_url`/`brand_color` | **self-FK** `coach_id → profiles.id` (gerarchia coach→atleta). Tabella cardine. |
| `invite_tokens` | `coach_id`, `email`, `full_name`, `token`, `expires_at`, `used`                                                                                                                                                                                                                                                                                                                                        | Onboarding atleta via email; redenzione in `handle_new_user`.                   |

### Programmi / allenamento

| Tabella                         | Colonne chiave                                                                                                                                                                                                                                                       | FK / note                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `program_plans`                 | `coach_id`, `name`, `is_template`, `deleted_at`                                                                                                                                                                                                                      | soft-delete                                                                              |
| `program_weeks`                 | `program_plan_id`, `week_order`, `name`                                                                                                                                                                                                                              | `→ program_plans`                                                                        |
| `program_days`                  | `program_week_id`, `day_number`                                                                                                                                                                                                                                      | `→ program_weeks`                                                                        |
| `program_workouts`              | `program_day_id`, `name`, `sort_order`                                                                                                                                                                                                                               | `→ program_days`                                                                         |
| `program_exercises`             | `program_workout_id`, `exercise_id`, `sets`, `reps`, `rpe`, `load_text`, `tempo`, `rest`, `snapshot_muscles[]`                                                                                                                                                       | `→ program_workouts`, `→ exercises` (nullable). Snapshot = denormalizzazione resiliente. |
| `program_blocks`                | `coach_id`, `athlete_id`, `name`, `goal`, `status`, `start_date`, `data` jsonb                                                                                                                                                                                       | documento Program Builder V2 (JSONB)                                                     |
| `exercises`                     | `coach_id`, `name`, `muscles[]`, `secondary_muscles[]`, `movement_pattern`, `exercise_type`, `tracking_fields[]`, `default_rpe`, `video_url`, `archived`                                                                                                             | libreria esercizi per coach                                                              |
| `workouts`                      | `athlete_id`, `coach_id`, `title`, `status` (enum `workout_status`), `structure` jsonb, `scheduled_date`, `sync_version`, `deleted_at`                                                                                                                               | soft-delete                                                                              |
| `workout_logs`                  | `athlete_id`, `workout_id`, `program_workout_id`, `status` (enum `workout_log_status`), `exercises_data` jsonb, `rpe_global`, `srpe`, `total_load_au`, `duration_seconds`, `scheduled_date`, `started_at`/`completed_at`, `local_id`/`sync_status`/`google_event_id` | **tabella centrale tracking sessioni**; sorgente trigger watchdog/notify                 |
| `exercise_logs`                 | `session_id`, `exercise_id`, `set_number`, `weight`, `reps`, `is_completed` — UNIQUE(`session_id`,`exercise_id`,`set_number`)                                                                                                                                        | `session_id → workout_logs`. Log normalizzato 1-riga-per-set.                            |
| `workout_exercises`             | `workout_log_id`, `exercise_name`, `sets_data` jsonb, `mean_velocity_ms`, `peak_velocity_ms`, `calc_power_watts`, `rom_cm`                                                                                                                                           | metriche VBT                                                                             |
| `workout_templates`             | `coach_id`, `name`, `structure` jsonb, `tags[]`                                                                                                                                                                                                                      | —                                                                                        |
| `training_phases`               | `athlete_id`, `coach_id`, `focus_type` (enum `phase_focus_type`), `start_date`, `end_date`, `base_volume`                                                                                                                                                            | periodizzazione                                                                          |
| `fms_assessments` / `fms_tests` | composito `/21`, 7 test FMS L/R                                                                                                                                                                                                                                      | `→ profiles`                                                                             |
| `injuries`                      | `athlete_id`, `body_zone`, `status`, `injury_date`                                                                                                                                                                                                                   | `→ profiles`                                                                             |
| `session_voice_events`          | `athlete_id`, `workout_log_id`, `transcript`, `intent_detected`                                                                                                                                                                                                      | eventi voce in sessione                                                                  |
| `appointments`                  | `coach_id` (→ `auth.users`), `athlete_id` (→ `profiles`), `title`, `type` CHECK(`check-in`/`pt-session`/`consult`/`other`), `date`, `time`, `duration_min`                                                                                                           | **solo in migration `20260519120000`, assente da `types.ts`** (rigenerazione Lovable)    |

### Nutrizione

| Tabella                   | Colonne chiave                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `nutrition_plans`         | `athlete_id`, `coach_id`, `daily_calories`, `protein_g`/`carbs_g`/`fats_g`, `strategy_mode`, `cycling_targets` jsonb, `active` |
| `nutrition_logs`          | `athlete_id`, `date`, `meal_name`/`meal_tag`, `calories`/`protein`/`carbs`/`fats`/`water`                                      |
| `nutrition_daily_summary` | `athlete_id`, `date`, totali + `water_ml`, `adherence_score`                                                                   |
| `meal_logs`               | `user_id`, `meal_time` (enum), `calories`/macro, `photo_url`, `confidence_score` (popolata da AI meal-photo)                   |
| `custom_foods`            | `athlete_id`, macro + micronutrienti (`fiber`, `salt`, `sugars`, `saturated_fat`, …)                                           |

### Tracking atleta

| Tabella                  | Colonne chiave                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daily_readiness`        | `athlete_id`, `date`, `sleep_quality`, `sleep_hours`, `stress_level`, `mood`, `energy`, `digestion`, `fatigue_score` (1-10), `soreness_map` jsonb, `score`, `has_pain`, `body_weight` |
| `daily_metrics`          | `user_id`, `date`, `hrv_ms`/`hrv_rmssd`, `resting_hr`, `body_weight_kg`, `readiness_score`                                                                                            |
| `body_measurements`      | `athlete_id`, `date`, `weight_kg`, `body_fat_percentage`, circonferenze                                                                                                               |
| `athlete_cycle_settings` | `athlete_id` (1-1), `cycle_length_days`, `last_period_start_date`, `auto_regulation_enabled`                                                                                          |
| `daily_cycle_logs`       | `athlete_id`, `date`, `current_phase` (enum `cycle_phase`), `symptom_tags[]`                                                                                                          |
| `weekly_checkins`        | `athlete_id`, `coach_id`, `week_start`, `status` (enum `checkin_status`), `ai_summary`, `coach_notes`, `metrics_snapshot` jsonb                                                       |

### Chat / Realtime · Knowledge · Billing · Gamification · AI · Supporto

- **Chat/Realtime**: `chat_rooms`, `chat_participants` (`room_id`,`user_id`,`last_read_at`), `messages` (`room_id`,`sender_id`,`content`,`media_url`), `notifications`, `coach_alerts` (`coach_id`,`athlete_id`,`workout_log_id`,`severity`). _(messages/notifications/coach_alerts in publication realtime.)_
- **Knowledge/RAG**: una libreria sola — `knowledge_documents` (status enum) + `knowledge_chunks` (`embedding` pgvector 1536, indice HNSW cosine), letta da `match_knowledge_chunks`; `coach_knowledge_base` (RAG legacy, 0 righe) rimossa il 2026-09-05; `content_library` (type enum).
- **Billing**: `billing_plans` (`stripe_price_id`/`product_id`), `athlete_subscriptions` (status enum, `stripe_subscription_id`), `coach_products`, `invoices`.
- **Gamification**: `badges` (catalogo, PK text), `user_badges`, `leaderboard_cache` (`week_volume`,`workout_count`), `habits_library`, `athlete_habits`, `habit_logs`.
- **AI usage**: `ai_usage_tracking` (quota chat, solo service-role), `user_ai_usage` (chat/vision count), `athlete_ai_insights` (output `analyze-athlete-week`).
- **Supporto**: `support_tickets` (category/status enum).
- **View**: `analytics_athlete_summary` (`compliance_rate`, `current_acwr`, `acute/chronic_load_raw`, `has_active_injury`…), `analytics_athlete_progress`.

### Enum principali

`user_role`(coach,athlete) · `workout_status`(pending,in_progress,completed,skipped) · `workout_log_status`(scheduled,completed,missed,in_progress) · `phase_focus_type`(strength,hypertrophy,endurance,power,recovery,peaking,transition) · `cycle_phase`(menstrual,follicular,ovulatory,luteal) · `meal_time`(breakfast,lunch,dinner,snack) · `checkin_status`(pending,approved,sent,skipped) · `knowledge_doc_status`(pending,processing,processed,failed) · `content_type`(video,pdf,link,text,ai_knowledge) · `subscription_status` · `ticket_category` · `ticket_status`.

### RPC principali (oltre agli helper di sicurezza)

`archive_athlete`, `clone_program_week`, `clone_program_workout`, `schedule_program_week`, `get_chat_partner_profiles`, `get_or_create_direct_room`, `match_knowledge_chunks` (RAG cosine — una libreria sola; `match_documents` rimossa il 2026-09-05), `set_athlete_daily_limit`.

## 4. La scienza & gli algoritmi

> Modelli "puri" in `src/lib/math/**` (testabili). Parametri AI nelle edge function Deno.

### Costanti baseline (`src/lib/math/constants.ts`)

| Costante                  | Valore | Uso                                                   |
| ------------------------- | ------ | ----------------------------------------------------- |
| `ACWR_BASELINE_DAYS`      | 28 gg  | finestra cronica ACWR (modello coupled, Hulin et al.) |
| `WEARABLES_BASELINE_DAYS` | 14 gg  | minimo dati HRV/RHR prima del Z-Score                 |
| `NUTRITION_BASELINE_DAYS` | 21 gg  | finestra rolling TDEE adattivo                        |
| `ACWR_LOOKBACK_DAYS`      | 42 gg  | array carico giornaliero ACWR                         |
| `READINESS_BASELINE_DAYS` | 30 gg  | baseline rolling readiness                            |

### 4.1 Readiness scoring (`readinessMath.ts`)

**Due implementazioni** + una semplificata inline lato coach.

- **`computeReadiness()`** (modello pesato HRV/RHR/Soggettivo): HRV **60%** (Z-score `(hrv−mean)/sd`, clamp [−2,+2], lineare → 0-60), RHR **20%** (Z invertito → 0-20), Soggettivo **20%** (energy 0.30·mood 0.25·stress-inv 0.25·sleepQuality 0.20, ×20). Finale `clamp(0,100)`. Degradazione: senza baseline → solo soggettivo riscalato `(subj/20)×100`.
- **`calculateReadinessScore()`** (blend 50/50): soggettiva Sleep 40% (target 8h) · Stress 20% inv · Soreness 20% inv · Mood 20%; se HRV/RHR presenti, oggettiva Z→[0,100] e **blend 50/50**.
- `standardDeviation` usa **dev. std di popolazione (N)** trattando i 30gg come popolazione.
- Insight deterministico a soglie (offline): sleep<6, stress>7, soreness>7, mood<4.

### 4.2 ACWR — Acute:Chronic Workload Ratio ⚠ **3 implementazioni divergenti**

- **Canonica EWMA "coupled"** (`trainingMetrics.ts`): acute 7gg (`α=0.25`), chronic 28gg (`α≈0.069`). Carico giornaliero **`Strain = totalVolume × RPE`** (`totalVolume=Σ sets×reps×weight`; fallback sRPE `RPE×min`). EWMA `α·v + (1−α)·prev`. Serve ≥14gg, altrimenti `null`. **Bande**: <0.8 detraining · 0.8–1.3 optimal · 1.3–1.5 warning · >1.5 high-risk.
- **Media semplice atleta** (`useAthleteAcwrData.ts`): NO EWMA; carico `RPE×min`, acute=Σ7/7, chronic=Σ28/28.
- **Overview multi-atleta** (`useAthletesRiskOverview.ts`): medie semplici, carico `srpe×min`; ≥28gg; flag readiness<40 → low_recovery.

### 4.3 Training metrics

- **e1RM = formula di Epley**, costante **0.0333**: `1RM = weight × (1 + 0.0333 × reps)` (`useAthleteAnalytics.ts:166`). NB: in `useAthleteVbtData.ts:88` somma le reps di tutti i set anziché il best set — **possibile bug**.
- **Tonnellaggio** `Σ(weight×reps)`; **Intensità** = RPE medio (fallback `rpe_global ?? 7`).
- **Monotony/Strain di Foster: NON presenti** (esiste solo il "load" giornaliero volume×RPE).

### 4.4 VBT — Velocity-Based Training

⚠ **Nessun modello load-velocity (velocità→%1RM).** Le velocità (`mean/peak_velocity_ms`, `calc_power_watts`, `rom_cm`) sono **lette pre-calcolate** da `workout_exercises` (sorgente hardware/sensore — **da confermare**). Le sole "zone" sono soglie di visualizzazione (`VelocityTrendChart`): >1.0 m/s potenza, <0.5 m/s forza/grinding.

### 4.5 Nutrizione

- **TDEE adattivo** (`adaptiveTDEE.ts`, motore): basato sulla termodinamica. `α=0.20`, `KCAL_PER_KG_TISSUE=7700`, finestra 14gg. EWMA peso (salta i `null`). `TDEE = avgIntake − (smoothedWeightDelta×7700)/windowDays`. Confidence da copertura dati.
- **TDEE legacy/display** (`nutritionMath.ts`): stessa fisica con `α=0.10` (più liscia). Suggerimenti: cut plateau "−150 kcal", perdita rapida "+200"; bulk "+100"/"−150"; target `{cut:tdee−550, maintain:tdee, bulk:tdee+275}`, warning se |varianza|>10%.
- **TDEE statico Harris-Benedict** (`AthleteDetail.tsx`): `BMR = 88 + 13.4·W + 4.8·H − 5.7·30`, `TDEE = BMR×1.55`. **Età hardcoded 30, gender sempre maschio, activity 1.55** — esplicitamente "simplified".
- **Macro**: **nessun auto-calcolo** da BMR/peso — inseriti **manualmente dal coach** (`StrategyContent.tsx`). Unica matematica: Atwater `kcal = P×4 + C×4 + F×9`; guard se |kcal inserite − da macro| > 50; cycling training-day `cal×1.15,carbs×1.3` / rest-day `cal×0.85,carbs×0.7,fats×1.1`. Colori: P rosso, F giallo, C verde.
- **Anelli Fibre/Acqua/Sodio: NON implementati** (i campi esistono in `foodApi.ts`/`custom_foods` ma nessun target/ring li consuma). Fonte cibo: Open Food Facts (per 100g).

### 4.6 Periodizzazione (`usePeriodization.ts`)

Tabella `training_phases` (focus_type enum 7 valori, `base_volume` default 100). **Nessun motore di progressione automatica**: solo CRUD + controllo sovrapposizione date (`areIntervalsOverlapping`). La progressione vera è delegata all'AI (`generate-program`).

### 4.7 Cycle phasing (`useCyclePhasing.ts`)

Ciclo default **28gg**. `daysIntoCycle = ((tot % len)+len)%len || len`. Fasi: 1–5 menstrual, 6–12 follicular, 13–15 ovulatory, 16+ luteal. Modificatori `strength_potential` 0-100: menstrual 35/Deload, follicular 80/Push, ovulatory 95/Peak (**injury risk High — Protect Knees**), luteal 55/Maintenance. Log in `daily_cycle_logs`.

### 4.8 FMS scoring

- **Profilo salute** (`useAthleteHealthProfile.ts`): 7 test FMS, bilaterali = `min(L,R)`. Status: 0 pain, 1 dysfunctional, 2 limited, ≥3 optimal. Totale **/21**. Semaforo salute rosso/giallo/verde.
- **Motore rischio biomeccanico** (`src/lib/math/fmsRiskEngine.ts`): incrocia esercizio × ultima FMS → traffic light. Gate: verticalPush→shoulder_mobility, squat→deep_squat, hinge→active_straight_leg, coreSpinal→trunk_stability. Clearing test positivo o score 0 → HIGH; score 1 → MODERATE; ≥2 → ok. Riferimenti clinici Cook/Burton 2006, Kiesel/Plisky 2007.

### 4.9 Achievements (`check-achievements/index.ts`)

Deterministico server-side. first_step (≥1), iron_will (≥50), centurion (≥100), heavy_lifter (≥10.000 kg in una sessione), on_fire (streak ≥4 sett.), consistency_king (≥8 sett.), volume_beast (≥100.000 kg lifetime). Streak su ISO-week consecutive. Effetti: insert `user_badges`, notifica `badge_earned`, upsert `leaderboard_cache`.

### 4.10 Logica AI (edge functions)

Tutte via **Lovable AI Gateway** (`ai.gateway.lovable.dev`, OpenAI-compatible) tranne gli **embedding** (diretti OpenAI `text-embedding-3-small`, 1536 dim).

| Funzione                  | Modello                                         | Strategia                                                                                        | Output                    |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| `generate-program`        | `openai/gpt-5.2`                                | tool-call forzato `submit_program`; modalità new/continue (analizza 4 settimane)                 | JSON scheda               |
| `analyze-meal-photo`      | `gemini-3-flash-preview`, temp 0.2              | vision, riferimenti visivi (piatto ~26cm), confidence 1-100                                      | JSON macro                |
| `ask-copilot`             | `gpt-5-mini` (RAG) / `gemini-2.5-flash` (modes) | RAG soglia **0.75**, top-5, cita `[Source N]`, no world-knowledge                                | answer+sources            |
| `chat-with-coach`         | `gpt-5-mini` stream                             | RAG una libreria, `match_knowledge_chunks` soglia **0.5**, top-3; rate-limit `ai_usage_tracking` | SSE stream                |
| `analyze-athlete-week`    | `gpt-5-mini`                                    | tool-call `submit_analysis`; **gender guardrail** (vietato ciclo/ormoni se maschio)              | report MD + sentiment 0-1 |
| `generate-batch-checkins` | `gemini-2.5-flash`, ≤280 char                   | settimana Europe/Rome, compliance%                                                               | testo IT                  |
| `ingest-knowledge`        | `text-embedding-3-small`                        | Recursive splitter chunk **1000**/overlap **200**, HNSW cosine                                   | chunk in DB               |

## 5. Coach Platform

> Tutte le route coach dentro `CoachLayout` (sidebar + bottom-nav), tema Aura, protette da `SubscriptionGuard`.

**SubscriptionGuard** (`src/components/auth/SubscriptionGuard.tsx`): non blocca atleti; `/coach/settings` e `/coach/business` sempre accessibili (per aggiornare il pagamento); tier `null`/`free` passa; status bloccanti `past_due|unpaid|canceled` → schermata "Abbonamento in pausa" con CTA `/coach/business`.

### 5.1 Dashboard / Command Center (`/coach` — CoachHome)

Triage giornaliero a bento-grid. Empty state se 0 atleti → `InviteAthleteDialog`. Widget: Centrale Operativa (hero AI con bullet **derivati client-side**, non edge AI), Triage (top-5 alert critical+warning → athlete detail), Pulse Attività (gauge completati/totali), Ultimi Allenamenti (feed pill RPE), Azioni Rapide. `useCoachDashboardMetrics` legge `profiles`/`daily_readiness`/`injuries`/`workout_logs`/`workouts`, genera 6 regole di alert (missed_workout, rpe_spike>9, low_readiness<45, no_checkin, high_acwr>1.3, active_injury); ACWR session-load = RPE×durata (7/28gg). **MRR mockato** (`activeClients×50`).

### 5.2 Roster atleti (`/coach/athletes` — CoachAthletes)

Griglia + ricerca + 5 filtri (`all|active|onboarding|rehab|suspended`, calcolati su readiness date e riskLevel). **Live session**: query `workout_logs status=scheduled+started_at`, refetch 30s + canale realtime `live-sessions-realtime`, atleti live con 🔴. Card mappa ACWR/readiness/painMarkers.

### 5.3 Athlete Detail (`/coach/athlete/:id` — AthleteDetail, ~3200 righe)

9 tab: overview, program, exercise-stats, vbt-analytics, advanced-stats, body-metrics, progress-pics, strategy, settings. Carica `profiles`/`injuries`/`training_phases`/`workout_logs`/`daily_metrics`. **OverviewTab**: readiness gauge, ACWR, TDEE tracker, compliance, dolore, `AiInsightCard`. **ProgramTab**: fase attiva + microciclo 7gg → "Apri Program Builder". **Azioni critiche**: save profilo (merge `profiles.settings`), **archivia** (RPC `archive_athlete`), **elimina** (edge `delete-athlete`). ⚠ chart AdvancedStats/BodyMetrics **mockati** (ma INSERT reale su `body_measurements`).

### 5.4 Program Builder (`/coach/programs` — ProgramBuilder)

Builder periodizzato V2. **Modello**: ProgramBlock(macro) → Microcycle(settimana, `is_deload`) → Session(giorno) → ProgrammedExercise(`superset_id`) → ProgrammedSet(`reps_target` stringa "8-10"/"AMRAP", `rpe/rir/percent_1rm_target`, `rest_seconds`, `tempo`, `is_warmup`). Store Zustand+immer (`useAdvancedProgramStore`): `initializeBlock` (scaffold N×M), `addExerciseToSession`, `updateSetProgression`, **`duplicateWeek`** (deep-clone con re-stamp UUID + remap superset — killer feature). Persistenza: UPSERT JSONB su **`program_blocks`** (`useSaveProgramBlock`, cast `as any`). **ProgressionInspector**: editor regole IF/ON/THEN — **solo in-memory, engine server NON wired** (toast "in arrivo"). Library da `exercises` (RLS coach), filtro `name ILIKE`+`muscles CS`.

### 5.5 Messaggistica coach+AI (`/coach/messages` — CoachMessages)

3 colonne: `RoomList` · `ChatPane` · `AthleteContextPane`. Auto-select da `?room=`; contesto alert da `?alertContext=` pre-compila messaggio empatico. Nuova chat via RPC `get_or_create_direct_room`. **ChatPane**: realtime coach↔atleta (NON AI), upload video su storage `chat-media` (max 50MB, signed URL 7gg), rileva link loom/youtube. **Context pane**: readiness ring live; ⚠ periodizzazione/ACWR **hardcoded/mock**. Dati via `useChatRooms` (`chat_participants`/`chat_rooms`/`messages` + RPC sicura `get_chat_partner_profiles`), realtime `room-${roomId}`.

### 5.6 Analytics coach (`/coach/analytics` — CoachAnalytics)

Per atleta selezionato + `useRealtimeAnalytics` (auto-refresh quando l'atleta logga). **StrengthChart** (Epley 1RM, best set), **VolumeIntensityChart** (tonnellaggio + RPE medio), **MetabolicChart** (peso da `daily_readiness` + calorie `nutrition_logs` vs target `nutrition_plans`), **AcwrGauge** (zone 0.8-1.3 ottimale, ≥2 settimane), **VelocityTrendChart** (VBT mean/peak + power). **AiInsightCard**: invoca edge `analyze-athlete-week` → report MD + sentiment.

### 5.7 FMS Screening (`/coach/fms` — FmsScreening)

7 test FMS (score 0-3 tap target) + 3 clearing test (switch dolore forza 0). Red flag se 0; composito /21. `useMovementStore` + `useSaveAssessment`. FMS→rischio esercizi (`useFmsAlerts`): mappa test→controindicazioni, usato dal Program Builder.

### 5.8 Knowledge Base / RAG (`/coach/knowledge` — KnowledgeBase)

Drag&drop `.pdf`/`.txt` (estrazione testo **client-side** via pdfjs) → INSERT `knowledge_documents` → edge `ingest-knowledge` `{documentId, textContent}`. Polling 3s su pending/processing; stati + `chunk_count`.

### 5.9 Master Copilot (`/coach/copilot` — MasterCopilot)

Chat AI RAG sulla knowledge base. `useCopilotChat` (no React Query, optimistic + rollback, timeout 30s) → edge `ask-copilot` `{message, history}` → `{answer, sources}`. Badge fonti citate.

### 5.10 Business / Billing — Stripe (`/coach/business` — CoachBusiness)

KPI (MRR/clienti/pending). Crea piano (€→cents, intervallo) → `billing_plans`. **Richiedi Pagamento** → `RequestPaymentDialog` → edge `create-checkout-session` `{plan_id, athlete_id}` → URL Stripe. `useFeatureAccess`: gating tier **free/basic/pro** (`ai_vision_daily`, `ai_chat_daily`, `max_active_programs`, `video_feedback` solo pro). ⚠ coesistono due modelli billing (`billing_plans`/`athlete_subscriptions` vs `coach_products`/`invoices`) — **da confermare quale canonico**.

### 5.11 Calendar / Appointments (`/coach/calendar` — CoachCalendar)

Drag&drop workout su mese/settimana. Drag singolo → crea `workouts`+`workout_logs` scheduled. Drag settimana ("Smart Paste") → RPC `schedule_program_week`. Elimina = cancella log + soft-delete `workouts.deleted_at`. ⚠ Google Calendar **mockato**. `appointments` via `useCoachAppointments` (cast `as any`).

### 5.12 Library (`/coach/library`), Exercise DB (`/coach/exercises`), Check-in Inbox (`/coach/inbox`), Settings (`/coach/settings`)

- **Library**: `content_library` (video/pdf/link/text/ai_knowledge); `ai_knowledge` con contenuto → trigger edge `ingest-knowledge`.
- **Exercise DB**: CRUD `exercises` via `useExerciseLibraryQuery`.
- **Check-in Inbox**: edge `generate-batch-checkins` genera report AI; filtri review/anomalies/archived; "Approva & Invia" → RPC room + INSERT `messages` + status `sent`. Tabella `weekly_checkins`.
- **Settings**: bypass guard _(corpo non letto — da confermare)_.

**Invito atleta** (`InviteAthleteDialog`): INSERT `invite_tokens` → URL `{origin}/auth?token=...`; il signup chiama `redeem_athlete_onboarding_link`/`handle_new_user` collegando al coach.

## 6. Athlete App

> ⚠ **Scaffold recente.** Solo 3 flussi persistono davvero: **onboarding**, **daily readiness**, **active-workout**. Il resto è UI con **dati mock**. Le capability PWA esistono come librerie ma **non sono collegate** (vedi 6.8).

**Shell** `AthleteLayout`: `<main>` scrollabile + bottom-nav glass **2 voci** (Oggi `/athlete`, Allenamenti `/athlete/training`); profilo = avatar in alto a dx; **nutrition deliberatamente omessa**. Le pagine non-layout sono sibling full-screen (back/X proprio).

**Guardia** `ProtectedAthleteRoute`: loading→spinner; `!user`→`/auth`; `role!=athlete`→`/coach`; `!onboarding_completed`→`/onboarding`; else children.

### 6.1 Onboarding atleta (handoff dal coach)

Wizard **8 step** (`OnboardingWizard.tsx`): Termini → Biometria → PAR-Q → Ortopedia → Sport/Tecnica → Lifestyle → Obiettivi → Neurotyping (15 affermazioni). Resume draft da `localStorage`. `analyzeOnboarding` calcola neurotipo + red flags. **Submit**: UPDATE `profiles` (`neurotype`, `onboarding_completed=true`, `onboarding_data`, `medical_clearance_required`, `fms_exclusion_zones[]`, `red_flags`) + **INSERT `coach_alerts`** per ogni flag (medical_clearance, fms_exclusion, reduced_volume…). NB: lo stile onboarding è shadcn neutro (pre-Aura). **Edge: nessuna** (scrittura diretta).

### 6.2 Daily readiness check-in

**Entry**: `useDailyReadinessQuery(today)` → a check-in completato la card Prontezza è statica (mostra solo lo score reale, nessuna navigazione); altrimenti il tap porta a `/athlete/daily-checkin` (logging). **Logging** (`DailyCheckin.tsx`): 5 righe scala 1-5 (Sonno/Energia/Stress/Umore/Digestione) + tag-cloud 11 muscoli con intensità 3-livelli. **Salva**: mappa 1-5→0-10, **inverte Energia in Fatica** `(6-energy)×2`, aggrega soreness 0-10; persiste su `daily_readiness` (upsert UNIQUE `athlete_id,date`). ⚠ `score` inviato è **placeholder fisso 85** ("weighted composite server-side in follow-up"). **Viste analisi**: non esistono — le pagine mock `AthleteReadinessDetails` e `DailyReadiness` sono state rimosse (2026-08-11). ⚠ **Niente `navigator.vibrate`** (il design system lo prescrive, non implementato). ⚠ submit **non** accodata offline (fallisce con toast).

### 6.3 Dashboard "Oggi"

`AthleteDashboard.tsx`: header + avatar→profilo; saluto **nome mock "Marco"**. **Widget Readiness** (ring = `daily_readiness.score` reale, default 3 metriche peggiori, pin custom via dialog). **Widget Prossimo Allenamento** **mock** ("Forza Lower Body", 45min) → "Inizia Sessione" → `/athlete/active-workout`. **Widget Nutrition: OMESSO** (nonostante design system §3.1).

### 6.4 Training lifecycle (Hub → preview → ActiveWorkout → Debrief)

- **Training Hub** (`AthleteTraining`): week-strip Mon-Sun; `HeroWorkoutCard`/`WorkoutBlueprint` **mock** (fasi "Movement Prep"/"Main Session", codici A1/B1 → exercise preview); `GlanceCards` (sola card Prontezza a larghezza piena, reale: score a check-in fatto, «—» + tap→daily-checkin altrimenti; la card Carico mock è stata rimossa). CTA "Inizia Sessione" → `startSession(uuid)` + `/athlete/active-workout`.
- **Exercise preview** (`ExercisePreview`): legge l'esercizio REALE da `location.state` (redirect a `/athlete/training` se assente). Rende la variante `standard`; nel codice esiste anche la variante `emom`, oggi **irraggiungibile** — l'unico produttore era `WorkoutPhaseDetail`, pagina mock rimossa (2026-08-11); cleanup del ramo emom a piano.
- **ActiveWorkout** (focus-mode `fixed inset-0 z-50`, copre la nav): **on-mount** `stopSession()` → INSERT `workout_logs (in_progress)` → `startSession(row.id)`. Timer 1Hz. Esercizi **mock** ma conteggio set **live da `exercise_logs`**. **Logging set**: `StandardSetDrawer` → INSERT `exercise_logs (session_id, exercise_id, set_number, weight, reps)` + rifocalizza campo kg. Bottone "Recupero" → toast **(timer non implementato)**.
- **Exit/friction modal** (`ExitWorkoutDialog`, `z-[60]`): Riprendi (anche Escape/backdrop) / Termina e Salva → `/athlete/post-workout` / Annulla (distruttivo) → `stopSession()`.
- **PostWorkoutDebrief**: stats **derivate da `exercise_logs`** (serie = righe, volume = Σ weight×reps); `RpeSelector` 1-10 **senza preselezione e deselezionabile** (parte vuoto; il tocco sulla pill accesa la spegne → torna «nessuna dichiarazione»; si salva anche con `rpe_global` NULL — l'RPE è una dichiarazione dell'atleta, non un obbligo; pill = toggle-button `aria-pressed`, non radiogroup) + note. Hero: durata **reale** dal cronometro (`elapsedTime`, resa `1h 15m`/`35m`/`34s` via `src/lib/time/duration.ts`); titolo e muscoli ancora **mock** (fonte = rilascio programma, fetta futura). **Salva**: UPDATE `workout_logs` (`completed_at`, `duration_seconds`, `rpe_global`, `notes`, `status=completed`) → `stopSession()`.
- **Resilienza**: `useAthleteWorkoutStore` **non** persiste `activeSessionId` (evita id stale) → ActiveWorkout fa sempre nuova sessione on-mount.

### 6.5 Weekly check-in (focus mode)

`WeeklyCheckin.tsx`: foto progresso (placeholder, **nessun file picker reale**) + textarea narrativa. **Submit NON persiste** (solo `log.info` + toast — backend "in follow-up"). NB: la rotta non è linkata da altre pagine atleta. Da non confondere con `useWeeklyCheckins` (lato **coach**).

### 6.6 Analytics atleta — **rimosse**

Le pagine `TrainingAnalytics` (e1RM 142.5kg) e `AcwrAnalysis` (gauge fisso 1.15 «Sweet Spot» per chiunque, anche in sovraccarico) erano **tutte costanti** e sono state rimosse (fetta pagine-da-scollegare, 2026-08-11): oggi non esiste una superficie analytics lato atleta. Gli hook reali (`useAthleteAcwrData`, `useAthleteVbtData`, `useAthleteAnalytics`) esistono e non erano collegati a quelle pagine.

### 6.7 Profilo

`AthleteProfile`: identità da `useAuth`; azioni "Account/Notifiche/Contatta Coach" = toast "in arrivo"; **Logout** unica azione cablata (`signOut` pulisce storage + redirect `/auth`).

### 6.8 Infrastruttura dichiarata ma NON collegata (verificato con grep, zero import in `pages/athlete` + `components/athlete`)

| Asset                           | Stato reale                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Wake Lock API**               | **Inesistente** nel repo (nessun `navigator.wakeLock`)                                                                        |
| **Haptics `navigator.vibrate`** | `useHapticFeedback`/`ux.ts` esistono ma usati solo da Confetti/CoachBottomNav                                                 |
| **Web Audio (rest timer)**      | `audioFeedback.ts` definito, **nessun consumer**                                                                              |
| **Media Session**               | `mediaSession.ts` definito, **nessun consumer**                                                                               |
| **Coda offline IndexedDB**      | `useOfflineSync`/`offlineStorage` completi ma **nessun import** → scritture atleta dirette a Supabase, **falliscono offline** |
| **OfflineSyncProvider**         | montato senza `userRole` → blocca azioni offline; pagine atleta non lo consumano                                              |

**Implicazione**: l'app atleta è oggi "online-first"; le PWA capability sono **librerie dormienti**. I commenti "Phase N / follow-up" suggeriscono integrazione prevista in commit successivi **(da confermare)**.

## 7. Backend: edge functions, RLS, realtime, storage, trigger

### 7.1 Edge functions (15)

`verify_jwt=true` ovunque tranne `stripe-webhook` (firma Stripe) e `forgot-password` (pubblico). Pattern: client user-scoped (anon+JWT) per validare `auth.uid()`, poi client service-role per le scritture. Le funzioni AI rifanno **internamente** il check auth.

| Funzione                  | Auth                               | Side-effect (scritture)                                                | Servizio                             |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `analyze-athlete-week`    | jwt + ownership                    | insert `athlete_ai_insights`                                           | Lovable AI (`gpt-5-mini`)            |
| `generate-program`        | jwt + role + ownership             | insert `workout_logs`                                                  | Lovable AI (`gpt-5`)                 |
| `analyze-meal-photo`      | jwt; cap 10MB                      | nessuna (ritorna stima)                                                | Lovable AI vision (`gemini-3-flash`) |
| `ingest-knowledge`        | jwt                                | update `knowledge_documents`, insert `knowledge_chunks`                | OpenAI embeddings                    |
| `ask-copilot`             | jwt                                | nessuna (RPC `match_knowledge_chunks` 0.75/top-5)                      | OpenAI emb + Lovable AI              |
| `chat-with-coach`         | jwt                                | insert/update `ai_usage_tracking` (quota)                              | OpenAI emb + Lovable AI              |
| `create-checkout-session` | jwt; whitelist Origin              | insert/update `athlete_subscriptions`                                  | Stripe                               |
| `create-portal-session`   | jwt; whitelist Origin              | —                                                                      | Stripe                               |
| `send-email`              | jwt; whitelist Origin              | —                                                                      | Resend                               |
| `check-achievements`      | jwt                                | insert `user_badges`/`notifications`, upsert `leaderboard_cache`       | —                                    |
| `generate-batch-checkins` | jwt; Europe/Rome                   | insert `weekly_checkins`                                               | Lovable AI (`gemini-2.5-flash`)      |
| `invite-athlete`          | jwt; sanitizza nome                | insert `profiles` (metadata per `handle_new_user`)                     | Resend                               |
| `delete-athlete`          | jwt; verifica coach                | update/delete `profiles` (admin)                                       | Supabase admin                       |
| `forgot-password`         | **no jwt**; whitelist `redirectTo` | — (admin recovery link)                                                | Resend                               |
| `stripe-webhook`          | **no jwt**; firma                  | insert/update `athlete_subscriptions`, update `profiles` (tier/status) | Stripe                               |

### 7.2 Modello RLS / sicurezza (coach ↔ atleta)

Relazione = singolo campo `profiles.coach_id` (self-FK). L'accesso cross-utente passa per **helper `SECURITY DEFINER STABLE`** che bypassano la RLS (evitano ricorsione): `is_coach_of_athlete`, `is_my_athlete`, `is_my_coach`, `is_room_member`, `shares_room_with`.

- **Coach vede atleti**: su `profiles` policy `coach_id = auth.uid()`; sulle tabelle dato pattern uniforme — **atleta FOR ALL su righe proprie** (`auth.uid()=athlete_id`), **coach FOR SELECT** via `is_coach_of_athlete(athlete_id)`.
- **`prevent_profile_privilege_escalation`** (BEFORE UPDATE profiles, service-role bypassa): blocca modifica self di `role`/`coach_id`/`subscription_*` → solo edge in service-role (es. `stripe-webhook`) può cambiarli.
- **`handle_new_user`** (AFTER INSERT auth.users): risolve ruolo da `meta.coach_id` valido → atleta linkato; oppure `invite_tokens` per email (marca `used`); else `meta.role` (default athlete).
- **Hardening advisor** (`20260525*`, ownership Lovable): `search_path` pinned su tutte le DEFINER + REVOKE PUBLIC (tranne helper RLS); `ai_usage_tracking`/`leaderboard_cache` scrivibili solo service-role; RPC `set_athlete_daily_limit` (clamp 1-1000); `invite_tokens` ristretti agli attivi; `realtime.messages` topic-scoping (wrappato in DO/exception perché schema gestito da Supabase — può restare advisor aperto).

### 7.3 Realtime / Storage / Trigger

- **Realtime** (publication `supabase_realtime`): `messages`, `notifications`, `coach_alerts`. (`workout_logs` aggiunta poi **rimossa**, audit C7.) Canali FE: `room-<id>`, `coach-alerts-<uid>`, `notifications-<uid>`, `analytics-<athleteId>`, `live-sessions-realtime`.
- **Storage** (6 bucket): `chat-media` (public, 50MB), `coach-avatars`/`coach-logos`/`coach-branding` (public, write folder-owner), `food-photos` (**private**: SELECT owner + coach via `is_coach_of_athlete`), `ai-knowledge-docs` (**private**). Ownership = `storage.foldername(name)[1] == auth.uid()`.
- **Trigger** (tutti DEFINER `search_path=public`): `watchdog_workout_alert` (su `workout_logs` completed con `rpe>=9` o `srpe>800` → insert `coach_alerts`), `notify_coach_workout_completed`, `notify_athlete_program_assigned` (scheduled → notifica atleta), `cascade_soft_delete_program` (propaga `deleted_at`), `update_updated_at_column`, `prevent_profile_privilege_escalation`, `handle_new_user`.

## 8. Incongruenze, debiti tecnici & implicazioni per la decisione

### 8.1 Debiti e incongruenze rilevati (dal codice)

| #   | Tema                            | Dettaglio                                                                                                                                          | Dove                                                                  |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | **ACWR ×3**                     | Tre implementazioni divergenti (EWMA coupled vs 2 medie semplici); bande coincidono, carichi no                                                    | `trainingMetrics.ts`, `useAthleteAcwrData`, `useAthletesRiskOverview` |
| 2   | **α EWMA peso incoerente**      | 0.20 (engine) vs 0.10 (display)                                                                                                                    | `adaptiveTDEE.ts` vs `nutritionMath.ts`                               |
| 3   | **e1RM VBT**                    | somma reps di tutti i set invece del best set — possibile bug                                                                                      | `useAthleteVbtData.ts:88`                                             |
| 4   | **Readiness score placeholder** | l'atleta invia `score=85` fisso; il composito pesato non è calcolato server-side                                                                   | `DailyCheckin.tsx`                                                    |
| 5   | **Modelli assenti**             | anelli Fibre/Acqua/Sodio, load-velocity VBT (%1RM da velocità), monotony/strain Foster, auto-macro da BMR, progressione periodizzazione automatica | vari                                                                  |
| 6   | **App atleta mock**             | dashboard next-workout, blueprint, preview, weekly check-in, **tutte le analytics**, mappa dolori = mock; nutrition omessa                         | `pages/athlete/**`                                                    |
| 7   | **PWA dormiente**               | Wake Lock inesistente; haptics/audio/media-session/offline-sync non collegati alle schermate atleta                                                | `lib/*`, `hooks/*`                                                    |
| 8   | **Mock lato coach**             | MRR, AdvancedStats/BodyMetrics chart, ACWR/fase nel context-pane chat, Google Calendar, engine auto-regolazione (solo in-memory)                   | `coach/**`                                                            |
| 9   | **Doppio modello billing**      | `billing_plans`/`athlete_subscriptions` vs `coach_products`/`invoices` coesistono                                                                  | `useBillingPlans` vs `useCoachBusinessData`                           |
| 10  | **types.ts hand-patch**         | blocco `appointments` droppato dalla rigenerazione Lovable → cast `as any`                                                                         | `useCoachAppointments`                                                |

### 8.2 Cosa preservare vs cosa ricostruire (raccomandazione)

- 🟢 **Preservare (è la parte di valore, NON appestata)**: tutto il **backend** (53 tabelle, RLS hardened, 15 edge function, realtime/storage/trigger) e la **scienza** in `src/lib/math` (readiness, TDEE adattivo, Epley, FMS engine, cycle phasing, achievements). Più i flussi **coach reali** (program builder, messaggi, inbox, FMS, business).
- 🟠 **Candidato a ridisegno/rebuild**: il **frontend atleta** (oggi scaffold/mock) e la **rifinitura UI coach** (sostituire i mock con query reali, collegare le librerie PWA dormienti).

**Conclusione strategica.** Il "ricostruire da zero" **non** si giustifica per l'intero sistema: il backend e la scienza sono solidi e re-implementarli butterebbe via i fix di sicurezza/RLS e i modelli già corretti. Si giustifica invece, se vuoi, un **rebuild design-led del solo frontend atleta sopra lo stesso backend**, usando questo spec come blueprint — che è esattamente il modo a rischio minimo per ottenere la qualità UX che cerchi. In parallelo: **completare il wiring** (mock→dati reali, collegare offline/haptics/wake-lock) è spesso più economico di un rewrite e porta l'app atleta da "prototipo" a "prodotto".

### 8.3 Come usare questo documento

- **Per la migrazione** (Fase 1 roadmap): il §3 e §7 sono la mappa di ciò che deve esistere sul nuovo Supabase.
- **Per Claude Code / Fable 5**: allega questo spec come contesto; le sezioni §4–§7 con i `file:riga` sono istruzioni dirette di reimplementazione.
- **Per il rebuild FE atleta**: §6 (journey + comportamenti attesi) + `docs/UX_UI_DESIGN_SYSTEM.md` (token/architetture) sono il capitolato.
- **Da confermare**: i punti marcati nel testo (sorgente velocità VBT, FK non dichiarate, modello billing canonico, conteggio enum) prima di trattarli come verità.

---

_Spec generata il 2026-06-12 da estrazione automatica del codice RC6. Aggiornare dopo modifiche sostanziali a `src/lib/math`, alle edge functions o al modello dati._
