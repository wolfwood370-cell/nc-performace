-- 20260713095855_position_load_polso_mano_forte.sql
-- Fast-follow zoneMap (checkpoint S3): tag front-rack + appoggio-mani wrist-loaders che sfuggono
-- al pattern-gate v18 (push/pull/carry) -> residuo Delta3. 39 righe approvate riga-per-riga da Nick (2026-07-13).
-- Merge-safe: preserva le chiavi position_load esistenti (es. spalla) sulle 14 righe clean.
-- NB: GIA' applicata sul DB Hub via connettore e registrata come 20260713095855. Questo file = GEMELLO per
--     il repo (db-push-safety): 'supabase db push' la vedra' gia' applicata (stessa version).
update public.exercises
set attributes = jsonb_set(
      coalesce(attributes, '{}'::jsonb),
      '{position_load}',
      coalesce(attributes->'position_load', '{}'::jsonb) || '{"polso-mano":"forte"}'::jsonb,
      true),
    updated_at = now()
where id = any(array[
  '011a64ad-d430-4cc8-a722-2aa6615d6bcf',
  '0f564c2c-2b8f-43e9-960a-e72b2b022b8d',
  '15d303e4-7a57-402a-ae8d-7450ae3bdfe0',
  '16e5b2ca-3d99-4a0d-a246-b3d43809b88e',
  '22b4cdf8-579a-4254-9bbc-030e4465ffce',
  '23f93fda-9800-497e-a68a-58f6f5a99772',
  '29946325-8259-45d3-a02a-e3fcd0bba332',
  '35ecf1ef-ef5a-4b21-9cae-90dad78b8eac',
  '4376dfd3-bc06-4745-83ab-75b375ee429c',
  '4c60d9da-ce8d-4543-8050-673bf3c8ade1',
  '524bc0df-4160-4a61-9d96-da688bf65f9c',
  '57855edd-3f04-47ad-b592-fce64a17d42c',
  '60871406-43ed-4af6-ad90-471a6e1e91bb',
  '616c156e-27c7-4447-883b-1b1299b73937',
  '61b5ea4b-2501-4e10-8ab1-450c1b01ac5e',
  '6334513e-462e-43c7-8284-579cdcc24d24',
  '6a160ee3-4f51-43fc-8b71-e13cc4d6b8c0',
  '6ff9f7df-8bd6-4266-94e9-829a8a46bd4b',
  '771107ed-0fd8-43cc-8be4-b9d3f2f59167',
  '85268572-2116-40a5-ae31-78ec176ee02b',
  '8cd44973-1c26-4c53-af59-71dcd11b7962',
  '927c18cc-9516-4068-9fc2-fe1f2951e2ca',
  'a5812f3f-2504-4d2c-a51b-e04e84cfa183',
  'aec4dda5-66ca-4e73-8a28-f971382b713d',
  'b483e125-9eac-4433-957f-44cef07bbacd',
  'b5b98666-cf6b-4f3c-b6ea-5b24697dbe15',
  'b8807cc8-3d4d-4976-afed-1525847e81dc',
  'c62f3a0c-c30c-446b-8ec6-37d8acbc7646',
  'c71d0013-ae89-4092-9ea8-eb3b165a82e1',
  'cd59525d-e475-49a0-8b09-80eaf2ac241b',
  'd582b125-9f16-4530-9b78-52ca6495248b',
  'e043b67b-04a8-4433-98c1-5c12580e5da6',
  'e1aa2431-2be5-4d45-a353-8b53fd89f042',
  'e80b1ebd-afb2-403f-8747-a17a8fde3940',
  'eb301a38-6359-416f-9bb7-9b638d95e0a8',
  'ee4df4f6-ca0d-47f4-a6cb-5c269a586741',
  'ef0c9d89-cb52-44ed-9a42-07e1584485e5',
  'f566c3e7-0660-4145-8255-96c63c51e74f',
  'f9c746fd-9324-46b5-ae76-c133c2700215'
]::uuid[]);
