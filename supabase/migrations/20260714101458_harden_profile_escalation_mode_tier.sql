-- Hardening: rende coaching_mode + tier (colonne F0) immutabili dall'atleta.
-- Additivo ai 5 campi già protetti. service_role bypassa (scritture server:
-- invite-athlete, handle_new_user, submit_intake-via-edge-fn girano come service_role).
-- NON bloccati qui (rinviati a Fase 2, accoppiati al ritiro della scrittura
-- client-side del wizard /onboarding): medical_clearance_required, red_flags,
-- fms_exclusion_zones. Bloccarli ora romperebbe l'onboarding attivo.
-- Base: definizione LIVE dal catalogo (pg_get_functiondef) 2026-07-14. Solo 2 IF aggiunti.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role / postgres bypass this trigger
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing role is not allowed';
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Changing coach_id is not allowed';
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'Changing subscription_tier is not allowed';
  END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Changing subscription_status is not allowed';
  END IF;
  IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end THEN
    RAISE EXCEPTION 'Changing current_period_end is not allowed';
  END IF;
  -- NEW (2026-07-14): colonne commerciali/di-modalità F0 — server-set all'invito, mai editabili dall'atleta.
  IF NEW.coaching_mode IS DISTINCT FROM OLD.coaching_mode THEN
    RAISE EXCEPTION 'Changing coaching_mode is not allowed';
  END IF;
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'Changing tier is not allowed';
  END IF;

  RETURN NEW;
END;
$function$;
