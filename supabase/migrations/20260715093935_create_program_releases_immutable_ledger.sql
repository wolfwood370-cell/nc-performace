-- program_releases: append-only immutable ledger (GDPR art.22). CORE §3.2/§8.
-- Applicata su HUB-PROD via connettore 2026-07-15 (migration 20260715093935). Gemello per il repo.
CREATE TABLE public.program_releases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  released_by      text NOT NULL CHECK (released_by IN ('engine','coach')),
  released_at      timestamptz NOT NULL DEFAULT now(),
  coaching_mode    text NOT NULL CHECK (coaching_mode IN ('coached','autonomous')),
  schema_version   integer NOT NULL CHECK (schema_version >= 1),
  config_version   text NOT NULL,
  program_document jsonb NOT NULL CHECK (jsonb_typeof(program_document) = 'object'),
  safety_context   jsonb NOT NULL CHECK (jsonb_typeof(safety_context) = 'object'),
  supersedes_id    uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_releases_id_athlete_uk UNIQUE (id, athlete_id),
  CONSTRAINT program_releases_supersedes_same_athlete_fk
    FOREIGN KEY (supersedes_id, athlete_id)
    REFERENCES public.program_releases (id, athlete_id) ON DELETE RESTRICT,
  CONSTRAINT program_releases_no_self_supersede
    CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX idx_program_releases_athlete_released
  ON public.program_releases (athlete_id, released_at DESC);
CREATE UNIQUE INDEX uq_program_releases_root_per_athlete
  ON public.program_releases (athlete_id) WHERE supersedes_id IS NULL;
CREATE UNIQUE INDEX uq_program_releases_supersedes
  ON public.program_releases (supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_program_release_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'program_releases e'' append-only: % non consentito', TG_OP
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_program_release_mutation() FROM anon, authenticated, public;

CREATE TRIGGER trg_program_releases_immutable_row
  BEFORE UPDATE OR DELETE ON public.program_releases
  FOR EACH ROW EXECUTE FUNCTION public.prevent_program_release_mutation();

CREATE TRIGGER trg_program_releases_immutable_truncate
  BEFORE TRUNCATE ON public.program_releases
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_program_release_mutation();

ALTER TABLE public.program_releases ENABLE ALWAYS TRIGGER trg_program_releases_immutable_row;
ALTER TABLE public.program_releases ENABLE ALWAYS TRIGGER trg_program_releases_immutable_truncate;

ALTER TABLE public.program_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_releases FORCE ROW LEVEL SECURITY;

CREATE POLICY program_releases_select_own
  ON public.program_releases
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.program_releases FROM anon, authenticated;
REVOKE SELECT ON public.program_releases FROM anon;

COMMENT ON TABLE public.program_releases IS
  'Ledger forense append-only (GDPR art.22). Immutabile (trigger, service_role incluso). Programma attivo = coda non-superata della catena. Erasure: scrub PII in profiles/auth.users, mantieni la riga pseudonima athlete_id.';
