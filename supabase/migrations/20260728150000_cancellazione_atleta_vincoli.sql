-- Cancellazione atleta (slice 2026-07-28): make deletion POSSIBLE, COMPLETE and honest.
-- Spec: docs/prompts/2026-07-28-cancellazione-atleta.md. Decisione di Nick (2026-07-28):
-- the release ledgers KEEP their rows and lose the link — after profile deletion their
-- athlete_id holds a uuid that no longer points at anyone. Not applied by Code: Cowork
-- applies this file VERBATIM with Nick's approval (CLAUDE.md legge #11).
--
-- Re-runnable by construction: DROP CONSTRAINT IF EXISTS before every ADD.
--
-- Deliberately NOT here:
--   * analytics_athlete_progress / analytics_athlete_summary — VIEWS (relkind='v',
--     verified live 2026-07-28): an FK on a view is impossible, and unnecessary — they
--     read from workout_logs/profiles, which already cascade. (Erratum arithmetic:
--     the original CASCADE list had 12 columns, 2 of which are views → 10 CASCADE
--     here; notifications.sender_id SET NULL was always a separate, 11th constraint.)
--   * the append-only machinery of the two ledgers (trg_program_releases_immutable_*,
--     trg_nutrition_releases_immutable_*, prevent_program_release_mutation(),
--     prevent_nutrition_release_mutation()) — UNTOUCHED. Acceptance criterion, to be
--     PROVEN in a rolled-back transaction after apply: DELETE and UPDATE on
--     program_releases are STILL rejected.

-- ── 1. Release ledgers: drop ONLY the FK to profiles, and only BY NAME ──────────────
-- athlete_id sits in TWO constraints per ledger: this simple FK to profiles (the one
-- that made deletion impossible, error 23503) and the composite self-referencing
-- *_supersedes_same_athlete_fk (supersedes_id, athlete_id) → (id, athlete_id), which
-- enforces "a release supersedes one of the SAME athlete". The composite one must
-- SURVIVE: dropping by column instead of by name would dismantle the ledger's
-- integrity. The column itself stays NOT NULL, its rows untouched.

ALTER TABLE public.program_releases
  DROP CONSTRAINT IF EXISTS program_releases_athlete_id_fkey;

ALTER TABLE public.nutrition_releases
  DROP CONSTRAINT IF EXISTS nutrition_releases_athlete_id_fkey;

-- ── 2. Ten CASCADE FKs: deletion becomes declarative ────────────────────────────────
-- Declarative instead of procedural (DELETEs inside the function): no future writer
-- can forget a table, and there is no hand-maintained list to keep in sync. Also the
-- fix for the GDPR hole on athlete_subscriptions open since 2026-07-26. Verified live
-- 2026-07-28: zero orphan rows in every table below, so no backfill is needed — if an
-- orphan appears between now and the apply, the ADD fails loudly and Cowork resolves.

ALTER TABLE public.nutrition_plans
  DROP CONSTRAINT IF EXISTS nutrition_plans_athlete_id_fkey;
ALTER TABLE public.nutrition_plans
  ADD CONSTRAINT nutrition_plans_athlete_id_fkey
  FOREIGN KEY (athlete_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.weekly_checkins
  DROP CONSTRAINT IF EXISTS weekly_checkins_athlete_id_fkey;
ALTER TABLE public.weekly_checkins
  ADD CONSTRAINT weekly_checkins_athlete_id_fkey
  FOREIGN KEY (athlete_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.habit_logs
  DROP CONSTRAINT IF EXISTS habit_logs_athlete_id_fkey;
ALTER TABLE public.habit_logs
  ADD CONSTRAINT habit_logs_athlete_id_fkey
  FOREIGN KEY (athlete_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.athlete_habits
  DROP CONSTRAINT IF EXISTS athlete_habits_athlete_id_fkey;
ALTER TABLE public.athlete_habits
  ADD CONSTRAINT athlete_habits_athlete_id_fkey
  FOREIGN KEY (athlete_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_user_id_fkey;
ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.leaderboard_cache
  DROP CONSTRAINT IF EXISTS leaderboard_cache_user_id_fkey;
ALTER TABLE public.leaderboard_cache
  ADD CONSTRAINT leaderboard_cache_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- ai_usage_tracking.user_id is the PK and ALREADY has an unnamed-inline FK to
-- auth.users ON DELETE CASCADE (20260215171751) whose default name is
-- ai_usage_tracking_user_id_fkey: the profiles FK takes a DISTINCT name so the two
-- coexist and this migration cannot clobber the auth path. In the deletion flow the
-- row dies at the profiles cascade (the profile is deleted BEFORE the auth user).
ALTER TABLE public.ai_usage_tracking
  DROP CONSTRAINT IF EXISTS ai_usage_tracking_user_id_profiles_fkey;
ALTER TABLE public.ai_usage_tracking
  ADD CONSTRAINT ai_usage_tracking_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- support_tickets.user_id (nullable) ALREADY has an unnamed-inline FK to auth.users
-- ON DELETE SET NULL (20260216135707), default name support_tickets_user_id_fkey:
-- distinct name here for the same reason. The profiles path CASCADE is intentional
-- (GDPR erasure of the athlete's tickets); the auth.users SET NULL path remains.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_profiles_fkey;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.athlete_subscriptions
  DROP CONSTRAINT IF EXISTS athlete_subscriptions_athlete_id_fkey;
ALTER TABLE public.athlete_subscriptions
  ADD CONSTRAINT athlete_subscriptions_athlete_id_fkey
  FOREIGN KEY (athlete_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- ── 3. notifications.sender_id: SET NULL, not CASCADE ───────────────────────────────
-- A notification SENT by the athlete has user_id = the coach: it belongs to the coach
-- and must not be destroyed — it only has to stop pointing at someone who is gone.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
