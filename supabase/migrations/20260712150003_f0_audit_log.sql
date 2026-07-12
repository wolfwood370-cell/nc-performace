-- F0 fondamenta (CORE v2.1 §6): general audit log (art. 22 validations,
-- autonomous applications, health-data access).
-- Append-only, tamper-proof client-side: writes come ONLY from edge functions
-- with service role (RLS bypass); no INSERT/UPDATE/DELETE policy for clients.
-- actor_id ON DELETE SET NULL: the log survives account deletion, actor anonymized.

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor_created
  ON public.audit_log (actor_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Single combined SELECT policy (own OR coach): avoids stacking multiple
-- permissive policies on the same (table, role, action).
CREATE POLICY "audit_log_select_own_or_coach"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    actor_id = (SELECT auth.uid())
    OR public.is_coach_of_athlete(actor_id)
  );
