-- F0 fondamenta (CORE v2.1 §4): tier -> feature entitlement map as config DATA, not code.
-- Clients read only; writes happen via Cowork connector or migrations, never from the app.

CREATE TYPE public.entitlement_feature AS ENUM (
  'training_autonomous',
  'training_coached',
  'nutrition',
  'coach_messaging',
  'fms',
  'calendar',
  'gamification',
  'cycle_optimization'
);

CREATE TABLE public.tier_entitlements (
  tier public.tier NOT NULL,
  feature public.entitlement_feature NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tier, feature)
);

ALTER TABLE public.tier_entitlements ENABLE ROW LEVEL SECURITY;

-- App-side configuration, not sensitive data: readable by any authenticated user.
-- No INSERT/UPDATE/DELETE policy: deny-by-default for clients.
CREATE POLICY "tier_entitlements_select_authenticated"
  ON public.tier_entitlements
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed (CORE §4) — deterministic config data.
-- 'calendar' intentionally not seeded for either tier (not enabled at launch).
INSERT INTO public.tier_entitlements (tier, feature) VALUES
  ('monthly', 'training_autonomous'),
  ('monthly', 'nutrition'),
  ('monthly', 'gamification'),
  ('premium', 'training_autonomous'),
  ('premium', 'training_coached'),
  ('premium', 'nutrition'),
  ('premium', 'coach_messaging'),
  ('premium', 'fms'),
  ('premium', 'cycle_optimization'),
  ('premium', 'gamification');
