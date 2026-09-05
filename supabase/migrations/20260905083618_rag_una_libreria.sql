-- ============================================================================
-- RAG — una libreria sola: match_knowledge_chunks indipendente dal search_path,
-- eseguibile solo da chi è autenticato; match_documents e coach_knowledge_base
-- spariscono.
-- ----------------------------------------------------------------------------
-- Misura di Cowork (2026-09-02, DB vivo CHIAMATO, main = ccf1450):
--   1. match_knowledge_chunks e match_documents falliscono entrambe alla
--      RETURN QUERY con 42883 «operator does not exist» sull'operatore coseno
--      fra due extensions.vector: l'operatore vive nello schema `extensions`,
--      le due funzioni hanno `search_path = public, pg_temp`. Rotto dal 25/05.
--   2. Causa: 20260525120100_security_advisor_definer_hardening.sql:45-80 pinna
--      `search_path = public, pg_temp` su OGNI SECURITY DEFINER; il repo per
--      match_knowledge_chunks diceva `public, extensions` (20260430125629:105).
--      Il controllo finale di quella migrazione (:86-107) guarda solo che un
--      search_path esista.
--   3. Porta: REVOKE FROM PUBLIC + GRANT authenticated (:71-72) non tocca
--      `anon`, che ha EXECUTE ESPLICITO dai default privileges di Supabase
--      (ACL di entrambe: anon=X, authenticated=X, service_role=X);
--      match_documents prende il coach come PARAMETRO, senza auth.uid().
--
-- Esito, nell'ordine: (a) stesso corpo di oggi con l'operatore QUALIFICATO in
-- ogni occorrenza — OPERATOR(extensions.<=>) — così nessun pin futuro del
-- search_path lo rompe più; `public, pg_temp` resta (era la parte giusta
-- dell'hardening). (b) EXECUTE tolto a PUBLIC e anon, dato a authenticated e
-- service_role, ESPLICITO: CREATE OR REPLACE conserva l'ACL vecchia.
-- (c) match_documents e coach_knowledge_base (0 righe, nessuno scrittore nel
-- repo) vengono rimosse — la tabella solo se è ANCORA vuota al momento
-- dell'apply: la libreria viva è knowledge_documents + knowledge_chunks,
-- letta da questa sola funzione.
-- ============================================================================

-- (a) match_knowledge_chunks — corpo invariato, operatore qualificato
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding  extensions.vector(1536),
  match_threshold  FLOAT DEFAULT 0.7,
  match_count      INT   DEFAULT 5
)
RETURNS TABLE (
  id             UUID,
  document_id    UUID,
  document_title TEXT,
  content        TEXT,
  similarity     FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_target_coach UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    CASE
      WHEN p.role = 'coach'   THEN p.id
      WHEN p.role = 'athlete' THEN p.coach_id
      ELSE NULL
    END
  INTO v_target_coach
  FROM public.profiles p
  WHERE p.id = v_caller_id;

  IF v_target_coach IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kd.title AS document_title,
    kc.content,
    1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kc.coach_id = v_target_coach
    AND kd.status = 'processed'
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
END;
$$;

-- (b) ACL esplicita: CREATE OR REPLACE conserva quella vecchia (anon=X)
REVOKE EXECUTE ON FUNCTION public.match_knowledge_chunks(extensions.vector, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(extensions.vector, double precision, integer) TO authenticated, service_role;

-- (c) la libreria morta: funzione col coach come parametro, tabella a 0 righe
DROP FUNCTION public.match_documents(extensions.vector, uuid, double precision, integer);

-- Cancello prima del DROP: «0 righe» è la misura del 02/09, la migrazione gira
-- giorni dopo sul DB vivo e la policy INSERT del coach resta viva fino a qui.
-- Se nel frattempo è entrato qualcosa, fallisce forte (db push annulla
-- l'intera migrazione) invece di cancellarlo in silenzio: si rimisura, poi si decide.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.coach_knowledge_base) THEN
    RAISE EXCEPTION 'coach_knowledge_base non è vuota: rimisurare prima di rimuoverla';
  END IF;
END $$;
DROP TABLE public.coach_knowledge_base;
