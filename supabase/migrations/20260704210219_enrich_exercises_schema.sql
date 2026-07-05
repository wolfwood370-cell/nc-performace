create type exercise_family      as enum ('forza','pliometrico','ciclico');
create type execution_mode       as enum ('grind','balistico','isometrico');
create type laterality           as enum ('bilaterale','unilaterale');
create type fatigue_cost         as enum ('basso','medio','alto','scalabile');
create type technical_complexity as enum ('bassa','media','alta');
create type suited_rep_range     as enum ('forza','ipertrofia','entrambi');
create type stability_demand     as enum ('bassa','media','alta');
create type body_position        as enum ('in piedi','seduto','supino','prono','sospeso','in ginocchio','mezzo ginocchio','quadrupedia','decubito laterale');
create type lift_phase           as enum ('prima-tirata','seconda-tirata','transizione','incastro-ricezione','jerk','alzata-completa');

alter table public.exercises
  add column os_id                text unique,
  add column exercise_family      exercise_family,
  add column patterns             text[]  not null default '{}',
  add column execution_mode       execution_mode,
  add column equipment            text[]  not null default '{}',
  add column laterality           laterality,
  add column fatigue_cost         fatigue_cost,
  add column technical_complexity technical_complexity,
  add column suited_rep_range     suited_rep_range,
  add column stability_demand     stability_demand,
  add column body_position        body_position,
  add column lift_phase           lift_phase,
  add column cyclic_modality      text,
  add column source               text[]  not null default '{}',
  add column attributes           jsonb   not null default '{}'::jsonb;

create index exercises_family_idx     on public.exercises (exercise_family);
create index exercises_mpattern_idx   on public.exercises (movement_pattern);
create index exercises_patterns_gin   on public.exercises using gin (patterns);
create index exercises_equipment_gin  on public.exercises using gin (equipment);
create index exercises_muscles_gin    on public.exercises using gin (muscles);
create index exercises_attributes_gin on public.exercises using gin (attributes);
