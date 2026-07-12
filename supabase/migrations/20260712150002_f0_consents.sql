-- F0 fondamenta (CORE v2.1 §6): granular consent ledger (GDPR art. 9).
-- Append-only by design: NO UPDATE/DELETE policy for any role, ever.
-- Current state = most recent row per (athlete_id, consent_type).
-- Machine values in English; Italian labels live in the UI layer.

CREATE TYPE public.consent_type AS ENUM (
  'health_required',
  'nutrition_advice',
  'photos_measurements',
  'medical_sharing',
  'marketing',
  'non_medical_disclaimer',
  'ai_processing'
);

CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type public.consent_type NOT NULL,
  granted boolean NOT NULL,
  version text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consents_athlete_type_created
  ON public.consents (athlete_id, consent_type, created_at DESC);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consents_insert_own"
  ON public.consents
  FOR INSERT
  TO authenticated
  WITH CHECK (athlete_id = (SELECT auth.uid()));

-- Single combined SELECT policy (own OR coach): avoids stacking multiple
-- permissive policies on the same (table, role, action).
CREATE POLICY "consents_select_own_or_coach"
  ON public.consents
  FOR SELECT
  TO authenticated
  USING (
    athlete_id = (SELECT auth.uid())
    OR public.is_coach_of_athlete(athlete_id)
  );
