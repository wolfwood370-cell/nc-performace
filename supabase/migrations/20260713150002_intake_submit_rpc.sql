-- =============================================================================
-- submit_intake — transactional writer for the intake/onboarding submit
--
-- PRIVATE RPC: EXECUTE revoked from client roles, granted to service_role
-- only. The only caller is the `submit-intake` edge function, which
-- authenticates the athlete (JWT), validates the payload against the enum
-- whitelists and runs the deterministic safety/scoring modules; it passes
-- both the raw payload and the computed results here. This function is the
-- single all-or-nothing boundary: profiles + consents + injuries +
-- athlete_cycle_settings + coach_alerts + audit_log in one transaction.
--
-- p_athlete_id = auth user id verified by the edge function (never
--                client-supplied).
-- p_payload    = validated client payload:
--                { schema_version, intake, consents: [{type, granted} x6],
--                  consent_version, injuries: [...], cycle? }
-- p_computed   = edge-computed results:
--                { intake_record,                  -- onboarding_data.intake
--                  profile: { objective?, experience_level?, neurotype?,
--                             medical_clearance_required, red_flags },
--                  alerts: [{type, severity, message}],
--                  audit_metadata }                -- lean, NO health values
--
-- Error hygiene (art. 9 — nc-questionnaire lesson 0004): any unexpected error
-- is re-raised with a FIXED message. Never re-raise SQLERRM/DETAIL: they can
-- embed row values ("Failing row contains ...") and health data would end up
-- in the database logs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_intake(
  p_athlete_id uuid,
  p_payload jsonb,
  p_computed jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile        public.profiles%ROWTYPE;
  v_required_ok    boolean;
  v_disclaimer_ok  boolean;
  v_injury         jsonb;
  v_alert          jsonb;
  v_version        text;
BEGIN
  -- Controlled pre-checks (no writes yet): return {ok:false} without raising.
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_athlete_id;
  IF NOT FOUND OR v_profile.role <> 'athlete'::public.user_role THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_athlete');
  END IF;

  -- One intake per athlete (resume/edit flows are a later slice).
  IF COALESCE(v_profile.onboarding_data, '{}'::jsonb) ? 'intake' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_submitted');
  END IF;

  v_version := NULLIF(p_payload->>'consent_version', '');
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  -- Consent gate re-check inside the transaction boundary (defense in depth;
  -- the edge function already refuses to call without both granted).
  SELECT
    bool_or(c->>'type' = 'health_required' AND (c->>'granted')::boolean),
    bool_or(c->>'type' = 'non_medical_disclaimer' AND (c->>'granted')::boolean)
  INTO v_required_ok, v_disclaimer_ok
  FROM jsonb_array_elements(COALESCE(p_payload->'consents', '[]'::jsonb)) AS c;

  IF NOT COALESCE(v_required_ok, false) OR NOT COALESCE(v_disclaimer_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_consents');
  END IF;

  -- 1) Consents: one append-only row per consent (granted true/false alike).
  INSERT INTO public.consents (athlete_id, consent_type, granted, version, source)
  SELECT
    p_athlete_id,
    (c->>'type')::public.consent_type,
    (c->>'granted')::boolean,
    v_version,
    'intake'
  FROM jsonb_array_elements(p_payload->'consents') AS c;

  -- 2) Profile: typed columns + additive merge of onboarding_data.intake.
  --    red_flags keeps the canonical 4-key shape consumed by the engine gate;
  --    fms_exclusion_zones (column) is intentionally NOT written: FMS stays a
  --    coach-side instrument (fms_assessments), injuries carry the zones.
  UPDATE public.profiles
  SET
    objective = CASE
      WHEN p_computed->'profile' ? 'objective'
      THEN (p_computed->'profile'->>'objective')::public.objective
      ELSE objective
    END,
    experience_level = COALESCE(p_computed->'profile'->>'experience_level', experience_level),
    neurotype = COALESCE(p_computed->'profile'->>'neurotype', neurotype),
    medical_clearance_required =
      COALESCE((p_computed->'profile'->>'medical_clearance_required')::boolean, false),
    red_flags = COALESCE(p_computed->'profile'->'red_flags', red_flags),
    full_name = COALESCE(NULLIF(p_payload->'intake'->'anagrafica'->>'full_name', ''), full_name),
    tax_code = COALESCE(NULLIF(p_payload->'intake'->'anagrafica'->>'tax_code', ''), tax_code),
    address = COALESCE(NULLIF(p_payload->'intake'->'anagrafica'->>'address', ''), address),
    onboarding_data = COALESCE(onboarding_data, '{}'::jsonb)
      || jsonb_build_object('intake', p_computed->'intake_record'),
    onboarding_completed = true
  WHERE id = p_athlete_id;

  -- 3) Known injuries to protect (past/chronic/in_rehab). Current pain is a
  --    gate signal, NEVER auto-converted into an injury row (regola-cardine).
  FOR v_injury IN
    SELECT inj FROM jsonb_array_elements(COALESCE(p_payload->'injuries', '[]'::jsonb)) AS inj
  LOOP
    INSERT INTO public.injuries (athlete_id, body_zone, status, injury_date, notes)
    VALUES (
      p_athlete_id,
      v_injury->>'zone',
      v_injury->>'status',
      COALESCE(NULLIF(v_injury->>'injury_date', '')::date, CURRENT_DATE),
      NULLIF(v_injury->>'note', '')
    );
  END LOOP;

  -- 4) Cycle settings (UNIQUE athlete_id -> upsert; intake fields only).
  IF p_payload ? 'cycle' THEN
    INSERT INTO public.athlete_cycle_settings (athlete_id, pregnancy, cycle_status)
    VALUES (
      p_athlete_id,
      NULLIF(p_payload->'cycle'->>'pregnancy', ''),
      NULLIF(p_payload->'cycle'->>'cycle_status', '')
    )
    ON CONFLICT (athlete_id) DO UPDATE
      SET pregnancy = EXCLUDED.pregnancy,
          cycle_status = EXCLUDED.cycle_status,
          updated_at = now();
  END IF;

  -- 5) Safety-net alerts for the coach (skipped when no coach is linked).
  IF v_profile.coach_id IS NOT NULL THEN
    FOR v_alert IN
      SELECT a FROM jsonb_array_elements(COALESCE(p_computed->'alerts', '[]'::jsonb)) AS a
    LOOP
      INSERT INTO public.coach_alerts (coach_id, athlete_id, type, severity, message, link)
      VALUES (
        v_profile.coach_id,
        p_athlete_id,
        COALESCE(NULLIF(v_alert->>'type', ''), 'risk_alert'),
        COALESCE(NULLIF(v_alert->>'severity', ''), 'medium'),
        v_alert->>'message',
        '/coach/athletes/' || p_athlete_id
      );
    END LOOP;
  END IF;

  -- 6) Audit trail (append-only; metadata is lean and health-free).
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    p_athlete_id,
    'athlete',
    'intake_submitted',
    'profile',
    p_athlete_id,
    COALESCE(p_computed->'audit_metadata', '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  -- Fixed message only — never SQLERRM/DETAIL (art. 9 log hygiene).
  RAISE EXCEPTION 'submit_intake: invalid payload';
END;
$function$;

-- Private function: client roles cannot call it directly. Identity is
-- enforced by the edge function (verified JWT -> p_athlete_id).
REVOKE ALL ON FUNCTION public.submit_intake(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_intake(uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submit_intake(uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_intake(uuid, jsonb, jsonb) TO service_role;
