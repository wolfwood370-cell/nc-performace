-- UP — position_load spalla sulle righe che caricano la spalla per POSIZIONE
-- (overhead/front rack) senza taggare il deltoide. Fonte: dry-run 2026-07-06.
UPDATE public.exercises
SET attributes = coalesce(attributes,'{}'::jsonb)
  || jsonb_build_object('position_load',
       coalesce(attributes->'position_load','{}'::jsonb) || jsonb_build_object('spalla','forte'))
WHERE name = ANY (ARRAY[
  'medicine ball overhead slam',
  'medicine ball half-kneeling overhead slam',
  'medicine ball rotational slam'
]);

UPDATE public.exercises
SET attributes = coalesce(attributes,'{}'::jsonb)
  || jsonb_build_object('position_load',
       coalesce(attributes->'position_load','{}'::jsonb) || jsonb_build_object('spalla','cautela'))
WHERE name = ANY (ARRAY[
  'clean · bilanciere',
  'clean · bilanciere · dai blocchi',
  'clean · bilanciere · dalla power position',
  'clean · bilanciere · sul rialzo',
  'hang clean · bilanciere',
  'hang power clean · bilanciere',
  'power clean · bilanciere',
  'power clean · bilanciere · dai blocchi',
  'power clean · bilanciere · dalla power position',
  'muscle clean · bilanciere',
  'muscle clean · bilanciere · dall''hang',
  'tall clean · bilanciere',
  'keg clean · keg',
  'log clean · log',
  'Tricep Overhead Cable Extension Lengthened Overload',
  'Tricep Cross Cable Behind Head Extension'
]);
-- attesi: 3 righe FORTE + 16 righe CAUTELA = 19 aggiornate.

-- DOWN (reversibile): rimuove solo la chiave spalla
-- UPDATE public.exercises SET attributes = attributes #- '{position_load,spalla}'
-- WHERE attributes #> '{position_load,spalla}' IS NOT NULL;
