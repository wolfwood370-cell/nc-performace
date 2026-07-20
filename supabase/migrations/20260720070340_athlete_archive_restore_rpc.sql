## APPENDICE A — migrazione GIÀ APPLICATA (specchio VERBATIM, non applicare)
-- Fetta archiviazione atleti end-to-end (2026-07-19, sess.79)
-- 1) archive_athlete: aggiunge archived_at accanto ad archived
--    (il tipo FE src/types/profile.ts prevede già entrambe le chiavi)
CREATE OR REPLACE FUNCTION public.archive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(auth.uid(), p_athlete_id) THEN
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

-- 2) unarchive_athlete: speculare (stessa guardia); rimuove le chiavi
--    così il profilo torna allo stato vergine (attivo = flag assente/false)
CREATE OR REPLACE FUNCTION public.unarchive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(auth.uid(), p_athlete_id) THEN
    RAISE EXCEPTION 'Not authorized to unarchive this athlete';
  END IF;

  UPDATE public.profiles
  SET settings = (COALESCE(settings, '{}'::jsonb) - 'archived') - 'archived_at',
      updated_at = now()
  WHERE id = p_athlete_id;
END;
$function$;

-- 3) least-privilege sulla NUOVA funzione (pattern record_consent_rpc):
--    niente EXECUTE per anon/PUBLIC; solo authenticated (guardia interna resta).
--    archive_athlete esistente NON viene toccata nei grant (fetta hardening dedicata).
REVOKE ALL ON FUNCTION public.unarchive_athlete(uuid) FROM PUBLIC, anon;
