-- =============================================================================
-- record_consent — server-authoritative in-app consent grant (+ RLS hardening)
--
-- Context (un-park ai_processing slice, 2026-07-16): the autonomous release
-- gate (release-autonomous-program) requires a granted `ai_processing`
-- consent (art. 22 GDPR). Athletes onboarded BEFORE the intake collected it
-- hit `consentRequired` and need an in-app path to grant it. Writes on
-- `consents` must be server-authoritative: athlete_id = auth.uid(), type
-- whitelisted, version and source pinned server-side.
--
-- Two changes, one security boundary:
--
-- 1) DROP POLICY consents_insert_own — the F0 policy (20260712150002) let any
--    authenticated client INSERT arbitrary consent rows for itself
--    (consent_type/version/source were client-controlled), bypassing any RPC.
--    Verified before this migration: no FE code performs
--    .from('consents').insert()/.upsert() (the only client access is the
--    gate-mirror SELECT in src/hooks/athlete/useProgramRelease.ts). Both
--    writers — submit_intake and record_consent — are SECURITY DEFINER and
--    run as the function owner, so they are unaffected by the drop. After
--    this migration every write on `consents` goes through a server-side RPC.
--
-- 2) New RPC record_consent(p_type) — client-callable (authenticated), grants
--    ONE whitelisted opt-in consent to the caller:
--      * identity: athlete_id = auth.uid(), never a parameter;
--      * whitelist: p_type must be 'ai_processing' (explicit check — the
--        intake-gate consents health_required/non_medical_disclaimer can NOT
--        be re-granted from here);
--      * granted = true fixed: revocation is intentionally NOT expressible
--        via this RPC (art. 7(3) path to be decided with legal — for now the
--        coach handles revocations, like the other optional consents);
--      * version pinned server-side (see v_version below), source = 'in_app';
--      * append-only INSERT (never upsert): consents is a ledger, the latest
--        row per (athlete_id, consent_type) wins (release gate semantics);
--      * audit_log row (append-only, lean metadata — no health values).
--
-- Error hygiene (art. 9 — same rule as submit_intake): controlled outcomes
-- return {ok:false, error:'code'}; any unexpected error is re-raised with a
-- FIXED message, never SQLERRM/DETAIL (they can embed row values).
-- =============================================================================

DROP POLICY IF EXISTS consents_insert_own ON public.consents;

CREATE OR REPLACE FUNCTION public.record_consent(p_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_athlete uuid;
  -- Pinned server-side: bump together with CONSENT_VERSION in
  -- src/features/intake/config/labels.ts at the next legal-copy change.
  v_version constant text := 'hub-v2';
BEGIN
  v_athlete := auth.uid();
  IF v_athlete IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Whitelist: explicit equality check (not just the enum cast) so an
  -- unexpected value never reaches an error path that could echo it.
  IF p_type IS DISTINCT FROM 'ai_processing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_consent_type');
  END IF;

  -- Only athletes hold consents (mirrors the submit_intake pre-check).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_athlete AND role = 'athlete'::public.user_role
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_athlete');
  END IF;

  -- Append-only grant: a new ledger row, never an update of previous ones.
  INSERT INTO public.consents (athlete_id, consent_type, granted, version, source)
  VALUES (v_athlete, 'ai_processing'::public.consent_type, true, v_version, 'in_app');

  -- Audit trail (append-only; metadata is lean and health-free).
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_athlete,
    'athlete',
    'consent_granted',
    'profile',
    v_athlete,
    jsonb_build_object('type', 'ai_processing', 'source', 'in_app', 'version', v_version)
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  -- Fixed message only — never SQLERRM/DETAIL (art. 9 log hygiene).
  RAISE EXCEPTION 'record_consent: failed';
END;
$function$;

-- Client-callable: authenticated only; the identity/whitelist checks live in
-- the function body (GRANT alone is not the security boundary).
REVOKE ALL ON FUNCTION public.record_consent(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_consent(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_consent(text) TO authenticated;

COMMENT ON FUNCTION public.record_consent(text) IS
  'Server-authoritative in-app consent grant: inserts (auth.uid(), p_type, true, <pinned version>, ''in_app'') into the append-only consents ledger + an audit_log row. Whitelist: ai_processing only. Version is pinned server-side: at the next legal-copy bump update BOTH src/features/intake/config/labels.ts (CONSENT_VERSION) and this function. Revocation is intentionally not expressible here (art. 7(3) path pending legal review).';
