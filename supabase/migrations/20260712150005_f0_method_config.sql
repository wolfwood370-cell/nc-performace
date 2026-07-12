-- F0 fondamenta (CORE v2.1 §7): config-driven scaffolding — method parameters are DATA.
-- Schema only: the real config rows (Nicolò's method = profile #1, RPE table, splits,
-- zoneMap...) are applied by Cowork via connector after merge, never hard-coded here.

CREATE TABLE public.method_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name text NOT NULL,
  version int NOT NULL,
  config jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_name, version)
);

-- At most ONE active version per profile: engines read an unambiguous config.
CREATE UNIQUE INDEX idx_method_config_one_active
  ON public.method_config (profile_name)
  WHERE is_active;

ALTER TABLE public.method_config ENABLE ROW LEVEL SECURITY;

-- Method parameters are not sensitive data; only the active version is visible.
-- No INSERT/UPDATE/DELETE policy: writes only via Cowork connector or migrations.
CREATE POLICY "method_config_select_active"
  ON public.method_config
  FOR SELECT
  TO authenticated
  USING (is_active);
