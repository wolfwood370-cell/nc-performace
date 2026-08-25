-- =============================================================
-- Realign the workout watchdog to the srpe column (B-22 follow-up)
-- =============================================================
-- Since slice rpe-sessione (PR #60) the athlete's debrief writes the
-- session RPE to workout_logs.srpe and NOBODY writes rpe_global anymore:
-- the original RULE 1 (rpe_global >= 9) could never fire again. Measured
-- 25/08 on the LIVE database: coach_alerts holds ONE row in its whole
-- history (type nutrition_safety), zero risk_alert ever emitted — this is
-- not repairing a working channel, it is keeping a live, never-exercised
-- channel from becoming impossible.
--
-- What changes vs the INSTALLED function (pg_get_functiondef, 25/08):
--   1. RULE 1 reads NEW.srpe — same shape: threshold >= 9, severity
--      'high' from 10, 'medium' at 9 — and the message is Italian and
--      names the quantity («RPE di sessione»): the coach reads this
--      surface in Italian, and we are rewriting that very line.
--   2. RULE 2 (NEW.srpe > 800, «extreme session load») is REMOVED — see
--      the comment at the exact spot where it stood, inside the body.
-- Everything else is preserved from the installed version: SECURITY
-- DEFINER, SET search_path TO 'public', 'pg_temp' (the INSTALLED form —
-- stricter than the historical file 20260213073401, which carried only
-- 'public'; the hardening was applied via connector), the status guard,
-- the coach/full_name resolution, the NULL-coach exit, the workout
-- title, the v_link. The trigger trg_watchdog_workout_alert is untouched
-- and keeps pointing at this function.
--
-- ⚠ FILE ONLY: this migration is applied by Nicolò/Cowork via connector
-- (methodology 03 §0.2) — never by the agent.

CREATE OR REPLACE FUNCTION public.watchdog_workout_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_coach_id UUID;
  v_athlete_name TEXT;
  v_workout_title TEXT;
  v_severity TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  -- Only fire on completed workouts with high RPE
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get athlete's coach
  SELECT p.coach_id, p.full_name INTO v_coach_id, v_athlete_name
  FROM profiles p WHERE p.id = NEW.athlete_id;

  -- No coach assigned = no alert
  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get workout title
  SELECT w.title INTO v_workout_title
  FROM workouts w WHERE w.id = NEW.workout_id;

  v_link := '/coach/athlete/' || NEW.athlete_id;

  -- RULE 1: session RPE >= 9 — reads srpe, the column the athlete writes
  -- since B-22 (rpe_global is legacy and no longer written).
  IF NEW.srpe IS NOT NULL AND NEW.srpe >= 9 THEN
    v_severity := CASE WHEN NEW.srpe >= 10 THEN 'high' ELSE 'medium' END;
    v_message := COALESCE(v_athlete_name, 'Atleta') || ' ha registrato RPE di sessione ' || NEW.srpe || ' su "' || COALESCE(v_workout_title, 'Allenamento') || '"';

    INSERT INTO coach_alerts (coach_id, athlete_id, workout_log_id, type, severity, message, link)
    VALUES (v_coach_id, NEW.athlete_id, NEW.id, 'risk_alert', v_severity, v_message, v_link);
  END IF;

  -- RULE 2 stood here (IF NEW.srpe > 800 → 'extreme session load') and is
  -- REMOVED, not corrected: it was written believing srpe held the LOAD
  -- (session RPE × duration), but the column carries
  -- CHECK (srpe >= 1 AND srpe <= 10) — the condition was unreachable by
  -- construction, and an unreachable threshold that claims to watch the
  -- load is worse than no threshold: it reads as coverage. The
  -- extreme-load alarm is a different capability and will come from the
  -- srpe × duration computation owned by the load module (frontend
  -- src/lib/math/acwr.ts), not from a column capped at 10.

  RETURN NEW;
END;
$$;
