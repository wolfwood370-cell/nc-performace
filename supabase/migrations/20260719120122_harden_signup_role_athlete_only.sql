-- Harden public signup: the client-supplied role in raw_user_meta_data is
-- never read anymore. A public signup always creates an athlete profile
-- (onboarding_completed = false); coach accounts are created administratively.
-- Before this migration a public signup could self-elect as coach by passing
-- role='coach' in the signup metadata (privilege escalation).
--
-- The invite branches (meta_coach_id / invite_tokens) are copied VERBATIM
-- from the production definition — only the final branch changes.

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

  -- Public signup (no invite): role is NEVER taken from client metadata.
  chosen_role := 'athlete'::public.user_role;

  INSERT INTO public.profiles (
    id, full_name, role, onboarding_completed
  )
  VALUES (
    NEW.id,
    NULLIF(safe_name, ''),
    chosen_role,
    false
  );

  RETURN NEW;
END;
$function$;
