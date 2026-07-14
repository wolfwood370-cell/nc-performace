-- =============================================================================
-- 20260714205824_harden_profile_escalation_clinical_fields.sql
-- =============================================================================
-- Fase 2 (cutover intake) — completamento del lock anti-escalation.
-- Estende public.prevent_profile_privilege_escalation() con 3 campi-sicurezza
-- clinici, ora scritti SOLO server-side dalla edge fn submit-intake tramite la
-- RPC submit_intake (service_role, che bypassa il trigger):
--   - medical_clearance_required
--   - red_flags
--   - fms_exclusion_zones
-- L'atleta (authenticated) non puo' piu' alterarli con un update client-side: il
-- wizard legacy che li scriveva e' stato ritirato nel cutover (branch
-- claude/intake-form-fase2, commit 7e3e937, live in produzione su Vercel).
--
-- Precondizioni verificate LIVE prima dell'apply (2026-07-14, Cowork via connettore):
--   (a) bypass service_role presente nel trigger + provato in produzione
--       (invite-athlete scrive coaching_mode/tier — gia' lockati — via
--        service_role e funziona);
--   (b) grant submit_intake = service_role-only (rpc diretta come authenticated
--       NEGATA);
--   (c) 0 write client-side dei 3 campi in src/ (grep) + build post-cutover
--       7e3e937 READY in produzione su Vercel (deploy dpl_5MEB...).
--
-- Verifica 4-vie post-apply:
--   1. pg_get_functiondef -> 10 RAISE (5 storici + coaching_mode + tier + 3 nuovi),
--      bypass service_role e SET search_path preservati;
--   2. UPDATE che cambia red_flags come non-service_role -> BLOCCATO
--      ('Changing red_flags is not allowed'), in transazione annullata;
--   3. UPDATE a valore invariato -> PASSA (IS DISTINCT FROM = false);
--   4. trigger trg_prevent_profile_privilege_escalation ancora legato+enabled;
--      get_advisors: nessun problema nuovo.
--
-- CAVEAT forward (da tenere a mente quando si costruira' la UI coach FMS):
--   il trigger blocca OGNI update non-service_role (nessun self-update gating),
--   quindi la futura scrittura coach di fms_exclusion_zones DOVRA' passare da una
--   edge fn service_role, o sara' bloccata da questo trigger.
--
-- Gemello della migration applicata live da Cowork il 2026-07-14
-- (version 20260714205824). Committare a mano (Nick).
-- =============================================================================

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
  -- NEW (2026-07-14, fase 2 cutover): campi-sicurezza clinici — server-set via edge fn service_role (bypass sopra), mai editabili dall'atleta post-intake.
  IF NEW.medical_clearance_required IS DISTINCT FROM OLD.medical_clearance_required THEN
    RAISE EXCEPTION 'Changing medical_clearance_required is not allowed';
  END IF;
  IF NEW.red_flags IS DISTINCT FROM OLD.red_flags THEN
    RAISE EXCEPTION 'Changing red_flags is not allowed';
  END IF;
  IF NEW.fms_exclusion_zones IS DISTINCT FROM OLD.fms_exclusion_zones THEN
    RAISE EXCEPTION 'Changing fms_exclusion_zones is not allowed';
  END IF;

  RETURN NEW;
END;
$function$;
