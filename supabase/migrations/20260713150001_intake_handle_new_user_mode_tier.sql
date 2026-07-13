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
-- NOTE (residual risk, accepted 2026-07-13): raw_user_meta_data is
-- client-settable on self-serve signups — same trust boundary as the
-- pre-existing coach_id attach path. The self-signup fallback branch
-- intentionally does NOT honor coaching_mode/tier (commercial fields are set
-- only through the coach invite path). Metadata-trust hardening is tracked as
-- a follow-up slice.
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
    INSERT INTO public.profiles (
      id, full_name, role, coach_id, coaching_mode, tier, onboarding_completed
    )
    VALUES (
      NEW.id,
      COALESCE(NULLIF(safe_name, ''), invite_record.full_name),
      'athlete'::public.user_role,
      invite_record.coach_id,
      meta_mode,
      meta_tier,
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
