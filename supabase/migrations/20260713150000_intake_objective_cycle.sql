-- =============================================================================
-- Intake redesign — objective enum + special-population cycle columns
--
-- Additive-only: one new enum + nullable columns. No existing object changes.
-- Twin file of the migration applied by Cowork via connector (same version).
-- =============================================================================

-- profiles.objective — structured training goal selected at intake.
-- Values come VERBATIM from the method source 00-OS/regola-obiettivo-arena.md
-- (validated with Nicolo 2026-07-06): the enum is method data, not an
-- arbitrary list. Required client-side only when coaching_mode = 'autonomous';
-- nullable at the DB level (coached keeps the free-text main_goal narrative).
CREATE TYPE public.objective AS ENUM (
  'estetica',
  'dimagrimento',
  'forza',
  'powerlifting',
  'performance_sport',
  'resistenza',
  'generale',
  'altro'
);

ALTER TABLE public.profiles
  ADD COLUMN objective public.objective;

-- athlete_cycle_settings — intake special-population signals (CORE gate §0).
-- Values VERBATIM from nc-questionnaire docs/intake-contract.md §B2 (source of
-- truth for question enums; already machine-safe snake_case keys).
-- NULL = not asked / not applicable. Column-level CHECKs ignore NULL.
ALTER TABLE public.athlete_cycle_settings
  ADD COLUMN pregnancy text
    CHECK (pregnancy IN ('si', 'no', 'na')),
  ADD COLUMN cycle_status text
    CHECK (cycle_status IN ('regolare', 'irregolare', 'assente_3m', 'menopausa', 'contraccezione_ormonale'));
