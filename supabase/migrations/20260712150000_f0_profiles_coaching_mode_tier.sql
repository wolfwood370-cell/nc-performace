-- F0 fondamenta (CORE v2.1 §3/§4): client coaching mode + commercial tier on profiles.
-- Additive only: two new enums + two nullable columns.
-- NOT touched: profiles.subscription_tier (legacy free text, stays as is).

CREATE TYPE public.coaching_mode AS ENUM ('coached', 'autonomous');

-- Assigned by the intake/onboarding slice; NULL until then.
-- NOT the generate-program body param "mode" (new|continue) — different concept (CORE App.C #4).
ALTER TABLE public.profiles ADD COLUMN coaching_mode public.coaching_mode;

CREATE TYPE public.tier AS ENUM ('premium', 'monthly');

ALTER TABLE public.profiles ADD COLUMN tier public.tier;
