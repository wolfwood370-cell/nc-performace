-- F0 fondamenta (CORE v2.1 §5): webhook idempotency ledger for Stripe.
-- Born empty here; wired by the F3 slice (stripe-webhook inserts, duplicate
-- stripe_event_id -> 23505 -> "already processed").
-- RLS enabled with ZERO policies: no anon/authenticated access, service role only.

CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
