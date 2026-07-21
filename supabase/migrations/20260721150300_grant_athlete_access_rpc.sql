-- =============================================================================
-- 20260721150300_grant_athlete_access_rpc.sql
-- =============================================================================
-- Fetta F1 "accesso universale", passo 1a. Terza sorgente di
-- profiles.access_until: la concessione manuale del coach, per gli atleti che
-- pagano fuori piattaforma e per i quali non esiste alcun evento Stripe da cui
-- derivare una scadenza.
--
-- Contratto: grant_athlete_access(p_athlete_id, p_until, p_source, p_payment_ref)
--            -> {"ok": true, "granted_until": "<timestamptz>"}
--            oppure {"ok": false, "error": "<codice macchina>"}
--
-- Dipende da 150100 (access_grants), 150200 (profiles.access_until + varco GUC).
--
-- ---------------------------------------------------------------------------
-- PERCHE' UNA RPC E NON UNA POLICY UPDATE PER IL COACH
-- ---------------------------------------------------------------------------
-- Su public.profiles il coach NON ha alcuna policy UPDATE (le 5 policy sono
-- 3 SELECT, 1 INSERT own, 1 UPDATE own). Aprirne una gli darebbe la scrittura
-- sull'INTERA riga dell'atleta, dove vivono red_flags, medical_clearance_required
-- e fms_exclusion_zones: una policy di riga non distingue le colonne. La RPC
-- concede esattamente un verbo — "porta la scadenza a questa data futura" — e
-- niente altro, con l'autorizzazione dentro il corpo.
--
-- Nota per chi cablera' la UI coach: src/hooks/useCoachBusinessData.ts:222-296
-- fa oggi .from('profiles').update(...) su righe di ATLETI. Senza policy UPDATE
-- per il coach quelle scritture toccano 0 righe e falliscono in SILENZIO.
-- Questa RPC e' il loro rimpiazzo corretto; il rewiring della UI e' fuori fetta.
--
-- ---------------------------------------------------------------------------
-- SEMANTICA: AUTORITATIVA NEL FUTURO, MAI REVOCANTE (non "solo prolungare")
-- ---------------------------------------------------------------------------
-- La concessione e' AUTORITATIVA: fissa la scadenza manuale al valore chiesto,
-- che puo' essere piu' vicino o piu' lontano di una concessione precedente. Non
-- e' monotona: il backfill dei coached mette +90 giorni come segnaposto, e il
-- coach DEVE poterlo correggere alla data reale piu' vicina — una regola
-- "solo prolungare" (GREATEST col valore corrente) glielo impedirebbe.
--
-- L'unica cosa che la RPC NON puo' fare e' REVOCARE: p_until deve cadere nel
-- futuro (p_until > now()), quindi non puo' spegnere l'accesso. Spegnere
-- l'accesso di un coached e' un atto deliberato, non un effetto collaterale di
-- un typo, e non e' esprimibile qui.
--
-- access_until scritto = max(copertura-abbonamento, p_until): la concessione
-- non puo' comunque accorciare la copertura di un abbonamento pagato (il max la
-- preserva), coerente con il ricalcolo del webhook, che usa proprio la riga di
-- access_grants appena inserita come "ultima concessione".
--
-- ---------------------------------------------------------------------------
-- IL VARCO AL TRIGGER
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER cambia current_user, NON il GUC `role`: qui
-- current_setting('role') resta 'authenticated', quindi il bypass service_role
-- in testa a prevent_profile_privilege_escalation() NON scatta.
-- set_config('app.grant_access','on',true) apre il varco per la sola durata
-- della transazione e viene richiuso subito dopo l'UPDATE. Perche' questo
-- meccanismo e non SET LOCAL ROLE service_role: header di 150200.
--
-- ---------------------------------------------------------------------------
-- NESSUN EXCEPTION WHEN OTHERS, DI PROPOSITO
-- ---------------------------------------------------------------------------
-- record_consent() ha un catch-all. Qui NO: se la guardia respingesse l'UPDATE,
-- un catch-all restituirebbe un generico 'internal' e renderebbe AMBIGUO il
-- pre-flight, che deve distinguere "il varco non funziona" da "il coach non e'
-- autorizzato". L'errore del trigger ('Changing access_until is not allowed')
-- e' un messaggio fisso e diagnostico, e non espone contenuto di riga.
--
-- ---------------------------------------------------------------------------
-- PRE-FLIGHT (Cowork): 150100 e 150200 applicate.
--
-- VERIFICA POST-APPLY (bloccante, secondo ramo del pre-flight di Nick)
--   1. come COACH autenticato, sul PROPRIO atleta:
--        select public.grant_athlete_access('<athlete>', now() + interval '30 days',
--                                           'bonifico', 'CRO-test');
--      -> {"ok": true, "granted_until": ...}; profiles.access_until aggiornato;
--         +1 riga in access_grants; +1 riga in audit_log (action access_granted).
--      Se torna 'Changing access_until is not allowed', il varco GUC non tiene:
--      FERMARSI e passare al fallback SET LOCAL ROLE service_role.
--   2. come COACH su un atleta NON suo -> {"ok": false, "error": "forbidden"}, 0 scritture.
--   3. come ATLETA su se stesso -> "forbidden" (non e' coach di nessuno).
--   4. come ATLETA: PATCH diretta su profiles.access_until -> ancora RESPINTA
--      (il varco non deve aver indebolito la guardia).
--   5. p_until nel passato -> "invalid_until", zero scritture.
--   6. concessione con p_until PIU' VICINO di access_until corrente (correzione
--      del segnaposto +90 di un coached) -> access_until scende alla data reale
--      SE non c'e' una copertura-abbonamento piu' lontana. Verifica il max.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_athlete_access(
  p_athlete_id  uuid,
  p_until       timestamptz,
  p_source      text,
  p_payment_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_coach       uuid;
  v_source      text;
  v_payment_ref text;
  v_access      timestamptz;
BEGIN
  v_coach := auth.uid();
  IF v_coach IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Autorizzazione: l'helper canonico del progetto, non un EXISTS inline.
  -- Copre in un colpo il "non sei un coach" e il "non e' un tuo atleta".
  IF NOT public.is_coach_of_athlete(p_athlete_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Fail-closed sugli input: una scadenza nel passato non e' una concessione,
  -- e la revoca NON e' esprimibile qui (vedi header).
  IF p_until IS NULL OR p_until <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_until');
  END IF;

  v_source := btrim(coalesce(p_source, ''));
  IF v_source = '' OR length(v_source) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  v_payment_ref := nullif(btrim(coalesce(p_payment_ref, '')), '');
  IF v_payment_ref IS NOT NULL AND length(v_payment_ref) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payment_ref');
  END IF;

  -- Il registro PRIMA: e' la sorgente durevole "ultima concessione" da cui il
  -- webhook ricalcolera' (la riga appena inserita e' la piu' recente).
  INSERT INTO public.access_grants (athlete_id, granted_by, granted_until, source, payment_ref)
  VALUES (p_athlete_id, v_coach, p_until, v_source, v_payment_ref);

  -- access_until = max(copertura-abbonamento vigente, questa concessione).
  -- Stessa formula del ricalcolo del webhook (_shared/billing.ts resolveAccessUntil),
  -- cosi' i due scrittori convergono sullo stesso valore.
  SELECT GREATEST(
           p_until,
           coalesce(
             (SELECT max(current_period_end)
                FROM public.athlete_subscriptions
               WHERE athlete_id = p_athlete_id
                 AND status IN ('active', 'canceling')
                 AND current_period_end IS NOT NULL),
             p_until)
         )
    INTO v_access;

  -- Varco al trigger anti-escalation, aperto e richiuso attorno alla SOLA
  -- istruzione che ne ha bisogno. Transazione-locale (terzo argomento = true).
  PERFORM set_config('app.grant_access', 'on', true);

  UPDATE public.profiles
     SET access_until = v_access
   WHERE id = p_athlete_id;

  PERFORM set_config('app.grant_access', '', true);

  -- Audit trail (append-only; metadata magra e priva di dati sanitari).
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    v_coach,
    'coach',
    'access_granted',
    'profile',
    p_athlete_id,
    jsonb_build_object('granted_until', p_until, 'access_until', v_access, 'source', v_source)
  );

  RETURN jsonb_build_object('ok', true, 'granted_until', p_until);
END;
$function$;

-- Client-callable: solo authenticated; il controllo d'identita' vive nel corpo
-- della funzione (il GRANT da solo non e' il confine di sicurezza).
REVOKE ALL ON FUNCTION public.grant_athlete_access(uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_athlete_access(uuid, timestamptz, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_athlete_access(uuid, timestamptz, text, text) TO authenticated;

COMMENT ON FUNCTION public.grant_athlete_access(uuid, timestamptz, text, text) IS
  'Concessione manuale di accesso da parte del coach (fetta F1, terza sorgente di profiles.access_until): registra la concessione in access_grants + audit_log e imposta access_until = max(copertura-abbonamento, p_until). Autorizzata da is_coach_of_athlete. Autoritativa nel futuro (puo'' avvicinare o allontanare la scadenza manuale); non puo'' revocare (p_until deve essere futuro).';
