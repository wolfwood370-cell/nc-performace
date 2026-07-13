-- =============================================================================
-- handle_new_user — persist coaching_mode + tier from invite metadata
--
-- The invite-athlete edge function now embeds `coaching_mode` and `tier` in
-- user_metadata (server-set via auth.admin.generateLink), so the mode is known
-- from the athlete's first screen and bound to the record. Invalid or absent
-- labels fall back to NULL (both columns are nullable — F0).
--
-- Base: LIVE definition verified 2026-07-13 (lineage 20260509144153 + definer
-- hardening: search_path includes pg_temp). Only the two metadata reads and
-- the two INSERT column lists change; everything else is verbatim.
--
-- NOTE (residual risk — rls-auditor warning 1, 2026-07-13): raw_user_meta_data
-- is client-settable on self-serve signups. coaching_mode/tier are honored
-- ONLY in the meta_coach_id branch — the same trust boundary as the
-- pre-existing coach_id attach path (a self-signup that knows a coach UUID
-- could already attach itself; it can now also claim a tier). The
-- invite_tokens branch and the self-signup fallback intentionally do NOT
-- honor them (the legacy token flow never sets this metadata server-side).
-- Metadata-trust hardening (e.g. gating on admin-created users) is tracked as
-- a follow-up slice — decision Nick.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  safe_name      TEXT;
  user_email     TEXT;
  meta_coach_id  UUID;
  meta_mode      public.coaching_mode;
  meta_tier      public.tier;
  invite_record  RECORD;
  chosen_role    public.user_role;
  coach_exists   BOOLEAN;
BEGIN
  safe_name := COALESCE(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
  safe_name := LEFT(safe_name, 100);
  safe_name := regexp_replace(safe_name, E'[\\x00-\\x1F\\x7F]', '', 'g');

  user_email := NEW.email;

  BEGIN
    meta_coach_id := NULLIF(NEW.raw_user_meta_data->>'coach_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    meta_coach_id := NULL;
  END;

  -- coaching_mode / tier from invite metadata: invalid label -> NULL.
  BEGIN
    meta_mode := NULLIF(NEW.raw_user_meta_data->>'coaching_mode', '')::public.coaching_mode;
  EXCEPTION WHEN invalid_text_representation THEN
    meta_mode := NULL;
  END;

  BEGIN
    meta_tier := NULLIF(NEW.raw_user_meta_data->>'tier', '')::public.tier;
  EXCEPTION WHEN invalid_text_representation THEN
    meta_tier := NULL;
  END;

  IF meta_coach_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = meta_coach_id
        AND role = 'coach'::public.user_role
    ) INTO coach_exists;

    IF coach_exists THEN
      INSERT INTO public.profiles (
        id, full_name, role, coach_id, coaching_mode, tier, onboarding_completed
      )
      VALUES (
        NEW.id,
        NULLIF(safe_name, ''),
        'athlete'::public.user_role,
        meta_coach_id,
        meta_mode,
        meta_tier,
        false
      );
      RETURN NEW;
    END IF;
  END IF;

  SELECT *
  INTO invite_record
  FROM public.invite_tokens
  WHERE email = user_email
    AND used = false
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    -- Legacy token flow: coaching_mode/tier stay NULL — invite_tokens carries
    -- neither, and metadata here would be client-supplied (untrusted).
    INSERT INTO public.profiles (
      id, full_name, role, coach_id, onboarding_completed
    )
    VALUES (
      NEW.id,
      COALESCE(NULLIF(safe_name, ''), invite_record.full_name),
      'athlete'::public.user_role,
      invite_record.coach_id,
      false
    );

    UPDATE public.invite_tokens
       SET used = true
     WHERE id = invite_record.id;

    RETURN NEW;
  END IF;

  BEGIN
    chosen_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    chosen_role := 'athlete'::public.user_role;
  END;

  IF chosen_role IS NULL THEN
    chosen_role := 'athlete'::public.user_role;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, role, onboarding_completed
  )
  VALUES (
    NEW.id,
    NULLIF(safe_name, ''),
    chosen_role,
    (chosen_role = 'coach'::public.user_role)
  );

  RETURN NEW;
END;
$function$;
