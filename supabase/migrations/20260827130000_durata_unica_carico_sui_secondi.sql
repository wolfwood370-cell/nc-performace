-- ============================================================================
-- Durata unica: total_load_au si ridefinisce sui SECONDI (A-02)
-- ----------------------------------------------------------------------------
-- Misura sul DB vivo (2026-08-27): 16 righe in workout_logs — 6 con
-- duration_seconds, 4 con srpe, 4 con ENTRAMBI, 0 con duration_minutes,
-- total_load_au ≠ 0 su ZERO righe. La colonna generata moltiplicava per
-- duration_minutes, che nessun percorso scrive più: il debrief scrive i
-- secondi (useAthleteWorkoutHooks.ts) e A-02 nomina duration_seconds come
-- casa della durata. I minuti sono una VISTA, non un dato.
--
-- Scelte, nel commento perché la colonna non le può dire:
--   * NIENTE COALESCE: un'assenza resta NULL. srpe o durata mancanti →
--     carico ASSENTE, mai zero — la stessa semantica di computeAcwr
--     (src/lib/math/acwr.ts), che ESCLUDE la seduta invece di azzerarla.
--     Il vecchio COALESCE(...,0) è il motivo per cui 16 righe su 16
--     valevano 0 e la somma nel check-in sembrava una misura.
--   * Tipo NUMERIC, non integer: integer su srpe×secondi/60 tronca
--     6,0666… → 6 e una seduta di 52 s con sRPE 7 deve valere 6,07 AU,
--     non 6 e non 0. L'arrotondamento appartiene alla vista, mai al dato.
--     Il test src/lib/math/__tests__/caricoParita.test.ts deriva tipo ed
--     espressione da QUESTO file e diventa rosso se qualcuno rimette
--     integer.
--   * Effetto sulle 16 righe esistenti (STORED ricalcola al ADD COLUMN):
--     le 4 con srpe+durata → carico vero; le altre 12 → NULL (assenza
--     dichiarata, prima valevano 0).
--
-- duration_minutes NON si cancella qui: nessuno la scrive più, ma il
-- codice vecchio ancora servito potrebbe leggerla — la rimozione è un
-- secondo passo dopo la produzione (lezione della cache persistita,
-- applicata allo schema).
--
-- La view analytics_athlete_summary dipende dalla colonna generata: si
-- stacca e si RICREA BYTE-IDENTICA alla definizione live (= migration
-- 20260214204708, verificato via pg_get_viewdef il 2026-08-27). I grant
-- (anon/authenticated/service_role) tornano dai default privileges del
-- progetto — verificati identici ai default, nessun GRANT esplicito da
-- riemettere. ⚠ Reperto già censito il 2026-08-25 e NON corretto qui di
-- proposito (serve una decisione di Nicolò): il ramo
-- `total_load_au * COALESCE(rpe_global, 5)` conta l'RPE due volte, e con
-- la colonna finalmente popolata quel ramo si ATTIVA — prima girava
-- sempre il ramo duration_seconds perché total_load_au valeva 0.
--
-- NB: questa migration è un FILE proposto da Code — l'apply è di Cowork
-- col benestare di Nicolò (CLAUDE.md legge #11).
-- ============================================================================

-- 1) La view dipende da total_load_au: DROP COLUMN fallirebbe (dependency).
DROP VIEW public.analytics_athlete_summary;

-- 2) Postgres non permette di sostituire l'espressione di una colonna
--    GENERATED: DROP + ADD. STORED ricalcola le righe esistenti.
ALTER TABLE public.workout_logs DROP COLUMN total_load_au;

ALTER TABLE public.workout_logs
  ADD COLUMN total_load_au numeric GENERATED ALWAYS AS
    (srpe::numeric * duration_seconds::numeric / 60.0) STORED;

COMMENT ON COLUMN public.workout_logs.total_load_au IS
  'Carico interno della seduta (AU) = sRPE × durata in minuti, derivato da duration_seconds. NULL quando manca sRPE o durata: un''assenza resta un''assenza, mai 0. Numeric: l''arrotondamento è della vista, non del dato.';

-- 3) La view, byte-identica alla definizione precedente (20260214204708).
-- Server-side analytics view: ACWR, compliance, last workout, injury status
-- Avoids downloading raw logs to the frontend

CREATE OR REPLACE VIEW public.analytics_athlete_summary
WITH (security_invoker = true)
AS
WITH recent_logs AS (
  SELECT
    wl.athlete_id,
    wl.completed_at,
    wl.scheduled_date,
    wl.status,
    wl.total_load_au,
    wl.rpe_global,
    wl.duration_seconds,
    -- Day index from today (0 = today, 1 = yesterday, etc.)
    (CURRENT_DATE - (wl.completed_at AT TIME ZONE 'UTC')::date) AS days_ago
  FROM workout_logs wl
  WHERE wl.completed_at IS NOT NULL
    AND wl.completed_at >= (NOW() - INTERVAL '42 days')
),
-- Acute load: sum of loads in last 7 days
-- Chronic load: sum of loads in last 28 days
-- Using simple moving average ratios (SMA) which is standard for SQL aggregation
load_windows AS (
  SELECT
    athlete_id,
    COALESCE(SUM(
      CASE WHEN days_ago <= 7 THEN
        CASE
          WHEN total_load_au IS NOT NULL AND total_load_au > 0
            THEN total_load_au * COALESCE(rpe_global, 5)
          WHEN duration_seconds IS NOT NULL AND duration_seconds > 0
            THEN COALESCE(rpe_global, 5) * (duration_seconds / 60.0)
          ELSE 0
        END
      ELSE 0 END
    ), 0) AS acute_load,
    COALESCE(SUM(
      CASE WHEN days_ago <= 28 THEN
        CASE
          WHEN total_load_au IS NOT NULL AND total_load_au > 0
            THEN total_load_au * COALESCE(rpe_global, 5)
          WHEN duration_seconds IS NOT NULL AND duration_seconds > 0
            THEN COALESCE(rpe_global, 5) * (duration_seconds / 60.0)
          ELSE 0
        END
      ELSE 0 END
    ), 0) AS chronic_load
  FROM recent_logs
  GROUP BY athlete_id
),
-- Compliance: completed vs total scheduled in last 30 days
compliance AS (
  SELECT
    wl.athlete_id,
    COUNT(*) FILTER (WHERE wl.status = 'completed') AS completed_count,
    COUNT(*) AS total_count
  FROM workout_logs wl
  WHERE wl.scheduled_date >= (CURRENT_DATE - 30)
  GROUP BY wl.athlete_id
),
-- Last workout date
last_workout AS (
  SELECT
    athlete_id,
    MAX(completed_at) AS last_workout_date
  FROM workout_logs
  WHERE status = 'completed'
  GROUP BY athlete_id
),
-- Active injuries
active_injuries AS (
  SELECT DISTINCT athlete_id, true AS has_injury
  FROM injuries
  WHERE status != 'healed'
)
SELECT
  p.id AS athlete_id,
  p.full_name,
  p.avatar_url,
  p.onboarding_completed,
  p.coach_id,
  -- ACWR: acute (7d avg) / chronic (28d avg), using daily averages
  CASE
    WHEN COALESCE(lw2.chronic_load, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(lw2.acute_load, 0) / 7.0) / (COALESCE(lw2.chronic_load, 0) / 28.0) * 100) / 100.0
  END AS current_acwr,
  COALESCE(lw2.acute_load, 0) AS acute_load_raw,
  COALESCE(lw2.chronic_load, 0) AS chronic_load_raw,
  -- Compliance rate
  CASE
    WHEN COALESCE(c.total_count, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(c.completed_count, 0)::numeric / c.total_count * 100)
  END AS compliance_rate,
  -- Last workout
  lwk.last_workout_date,
  -- Injury status
  COALESCE(ai.has_injury, false) AS has_active_injury
FROM profiles p
LEFT JOIN load_windows lw2 ON lw2.athlete_id = p.id
LEFT JOIN compliance c ON c.athlete_id = p.id
LEFT JOIN last_workout lwk ON lwk.athlete_id = p.id
LEFT JOIN active_injuries ai ON ai.athlete_id = p.id
WHERE p.role = 'athlete';
