-- Applicata su HUB-PROD via connettore il 2026-07-17 (version 20260717125453,
-- name nutrition_v1_closed_loop_schema). Questo file e' lo SPECCHIO verbatim
-- dell'SQL as-applied (schema_migrations.statements): NON riapplicare.
-- Il seed method_config 'nicolo_nutrition' NON fa parte di questa migrazione
-- (insert dati separata via connettore Cowork).

-- nutrition_releases: append-only immutable ledger, gemello di program_releases (CORE §3/§8).
CREATE TABLE public.nutrition_releases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  released_by        text NOT NULL CHECK (released_by IN ('engine','coach')),
  released_at        timestamptz NOT NULL DEFAULT now(),
  coaching_mode      text NOT NULL CHECK (coaching_mode IN ('coached','autonomous')),
  schema_version     integer NOT NULL CHECK (schema_version >= 1),
  config_version     text NOT NULL,
  nutrition_document jsonb NOT NULL CHECK (jsonb_typeof(nutrition_document) = 'object'),
  safety_context     jsonb NOT NULL CHECK (jsonb_typeof(safety_context) = 'object'),
  fallback_mode      boolean NOT NULL DEFAULT false,
  cold_start         boolean NOT NULL DEFAULT false,
  supersedes_id      uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_releases_id_athlete_uk UNIQUE (id, athlete_id),
  CONSTRAINT nutrition_releases_supersedes_same_athlete_fk
    FOREIGN KEY (supersedes_id, athlete_id)
    REFERENCES public.nutrition_releases (id, athlete_id) ON DELETE RESTRICT,
  CONSTRAINT nutrition_releases_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX idx_nutrition_releases_athlete_released
  ON public.nutrition_releases (athlete_id, released_at DESC);
CREATE UNIQUE INDEX uq_nutrition_releases_root_per_athlete
  ON public.nutrition_releases (athlete_id) WHERE supersedes_id IS NULL;
CREATE UNIQUE INDEX uq_nutrition_releases_supersedes
  ON public.nutrition_releases (supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_nutrition_release_mutation()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  RAISE EXCEPTION 'nutrition_releases e'' append-only: % non consentito', TG_OP
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END; $fn$;

REVOKE ALL ON FUNCTION public.prevent_nutrition_release_mutation() FROM anon, authenticated, public;

CREATE TRIGGER trg_nutrition_releases_immutable_row
  BEFORE UPDATE OR DELETE ON public.nutrition_releases
  FOR EACH ROW EXECUTE FUNCTION public.prevent_nutrition_release_mutation();
CREATE TRIGGER trg_nutrition_releases_immutable_truncate
  BEFORE TRUNCATE ON public.nutrition_releases
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_nutrition_release_mutation();

ALTER TABLE public.nutrition_releases ENABLE ALWAYS TRIGGER trg_nutrition_releases_immutable_row;
ALTER TABLE public.nutrition_releases ENABLE ALWAYS TRIGGER trg_nutrition_releases_immutable_truncate;

ALTER TABLE public.nutrition_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_releases FORCE ROW LEVEL SECURITY;

CREATE POLICY nutrition_releases_select_own
  ON public.nutrition_releases FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());
CREATE POLICY nutrition_releases_select_coach
  ON public.nutrition_releases FOR SELECT TO authenticated
  USING (is_coach_of_athlete(athlete_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nutrition_releases FROM anon, authenticated;
REVOKE SELECT ON public.nutrition_releases FROM anon;

COMMENT ON TABLE public.nutrition_releases IS
  'Ledger forense append-only per i target nutrizionali (gemello di program_releases). Immutabile (trigger, service_role incluso). Erasure: scrub PII in profiles/auth.users, mantieni la riga pseudonima athlete_id.';

-- Migrazione additiva: nutrition_logs assorbe l'output di analyze-meal-photo (unico scrittore).
ALTER TABLE public.nutrition_logs
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_logs_source_check'
  ) THEN
    ALTER TABLE public.nutrition_logs
      ADD CONSTRAINT nutrition_logs_source_check CHECK (source IN ('manual','photo_ai'));
  END IF;
END $do$;

-- Drop meal_logs: 0 righe, 0 FK entranti, 0 consumer nel codice (verificato live 2026-07-17).
DROP TABLE IF EXISTS public.meal_logs;
