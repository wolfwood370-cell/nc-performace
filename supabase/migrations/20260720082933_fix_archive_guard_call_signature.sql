-- Hotfix (2026-07-20): allinea le chiamate alla firma REALE della guardia.
-- public.is_coach_of_athlete esiste SOLO come (p_athlete_id uuid) con auth.uid() interno;
-- la chiamata a 2 argomenti (auth.uid(), p_athlete_id) non risolve a runtime.
-- Bug latente ereditato dalla definizione originale di archive_athlete (mai eseguita
-- prima d'ora) e replicato in unarchive_athlete: emerso al primo uso reale dall'UI.
-- NB: set_athlete_daily_limit ha la stessa chiamata rotta -> NON toccata qui
-- (fetta hardening RPC dedicata; nessun caller UI oggi).

CREATE OR REPLACE FUNCTION public.archive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(p_athlete_id) THEN
    RAISE EXCEPTION 'Not authorized to archive this athlete';
  END IF;

  UPDATE public.profiles
  SET settings = jsonb_set(
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          '{archived}', 'true'::jsonb, true
        ),
        '{archived_at}', to_jsonb(now()), true
      ),
      updated_at = now()
  WHERE id = p_athlete_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unarchive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(p_athlete_id) THEN
    RAISE EXCEPTION 'Not authorized to unarchive this athlete';
  END IF;

  UPDATE public.profiles
  SET settings = (COALESCE(settings, '{}'::jsonb) - 'archived') - 'archived_at',
      updated_at = now()
  WHERE id = p_athlete_id;
END;
$function$;
