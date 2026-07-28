-- =============================================================================
-- 20260728212738_grace_period_athlete_subscriptions.sql
-- =============================================================================
-- Fetta grazia-4a. Periodo di grazia di 14 giorni sull'ACCESSO quando il
-- pagamento di un RINNOVO fallisce: la colonna athlete_subscriptions.grace_until
-- registra la fine della finestra (emissione della fattura non pagata + 14 gg),
-- scritta SOLO da stripe-webhook (invoice.payment_failed, decisione pura
-- graceDecision in _shared/billing.ts) e azzerata da invoice.payment_succeeded.
-- Nessun job pianificato: access_until e' un massimo di istanti fissi, quindi
-- allo scadere della finestra l'accesso si spegne da solo (fail-closed a valle).
--
-- Dipende da 20260721150300 (grant_athlete_access), di cui questo file
-- ridefinisce il corpo con UNA SOLA differenza: il terzo termine nel GREATEST.
-- Il file storico resta com'e'; la modifica vive qui.
--
-- PERCHE' IL TERZO TERMINE (convergenza dei due scrittori di access_until):
-- la concessione manuale resta AUTORITATIVA e puo' avvicinare o allontanare la
-- parte MANUALE della scadenza, ma non puo' cancellare una grazia in corso:
-- senza questo termine il coach, credendo di AGGIUNGERE accesso con una
-- concessione vicina, TOGLIEREBBE i giorni di grazia ancora dovuti all'atleta.
-- I due scrittori di access_until (stripe-webhook via resolveAccessUntil e
-- questa RPC) devono restare CONVERGENTI: entrambi prendono il massimo
-- includendo grace_until di TUTTE le righe dell'atleta, senza filtro sullo
-- stato. Se cambi il massimo qui, cambialo anche in
-- supabase/functions/_shared/billing.ts (e viceversa).
--
-- Nessun indice, nessuna modifica RLS, nessun DEFAULT, nessun backfill.
-- =============================================================================

ALTER TABLE public.athlete_subscriptions
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

COMMENT ON COLUMN public.athlete_subscriptions.grace_until IS
  'Finestra di tolleranza sull''ACCESSO dopo il fallimento di un RINNOVO: = data di emissione della fattura non pagata + 14 giorni. Entra nel massimo di access_until INDIPENDENTEMENTE dallo stato della riga. NULL = nessun episodio aperto, ed e'' la condizione che permette di aprirne uno nuovo. Si azzera quando il pagamento va a buon fine. NON e'' una data di fatturazione e non va confusa con current_period_end.';

-- Corpo IDENTICO a 20260721150300, con la sola aggiunta del terzo termine nel
-- GREATEST (la grazia in corso non e' cancellabile dalla concessione manuale).
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

  -- access_until = max(copertura-abbonamento vigente, questa concessione,
  -- grazia in corso). Stessa formula del ricalcolo del webhook
  -- (_shared/billing.ts resolveAccessUntil), cosi' i due scrittori convergono
  -- sullo stesso valore. La grazia entra nel massimo INDIPENDENTEMENTE dallo
  -- stato della riga (i 14 giorni sono dovuti anche a sottoscrizione chiusa).
  SELECT GREATEST(
           p_until,
           coalesce(
             (SELECT max(current_period_end)
                FROM public.athlete_subscriptions
               WHERE athlete_id = p_athlete_id
                 AND status IN ('active', 'canceling')
                 AND current_period_end IS NOT NULL),
             p_until),
           coalesce(
             (SELECT max(grace_until)
                FROM public.athlete_subscriptions
               WHERE athlete_id = p_athlete_id
                 AND grace_until IS NOT NULL),
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
