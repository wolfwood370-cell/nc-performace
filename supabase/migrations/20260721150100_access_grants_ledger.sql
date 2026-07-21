-- =============================================================================
-- 20260721150100_access_grants_ledger.sql
-- =============================================================================
-- Fetta F1 "accesso universale", passo 1a. Registro append-only delle
-- concessioni di accesso (terza sorgente di profiles.access_until, accanto alle
-- due automatiche del webhook Stripe).
--
-- Creato PRIMA di profiles.access_until (150200) di proposito: il backfill dei
-- coached in 150200 inserisce QUI una riga 'backfill_coached', quindi la
-- tabella deve gia' esistere. Ordine di dipendenza in testa a 150000.
--
-- ---------------------------------------------------------------------------
-- PERCHE' UN LEDGER, E PERCHE' E' LOAD-BEARING (non solo forense)
-- ---------------------------------------------------------------------------
-- profiles.access_until e' una CACHE: dice fino a quando, mai perche' ne' per
-- opera di chi. Ma questa tabella non e' solo un registro forense: e' una delle
-- due sorgenti DUREVOLI da cui access_until viene RICALCOLATO.
--
-- Il modello dell'accesso (fetta F1) e':
--     access_until = max( copertura-abbonamento , ultima-concessione-manuale )
-- dove "copertura-abbonamento" e' la scadenza piu' avanti fra le righe
-- athlete_subscriptions che danno accesso, e "ultima-concessione-manuale" e' il
-- granted_until della riga piu' recente di QUESTA tabella. Entrambi gli
-- scrittori di access_until (il webhook e la RPC grant) ricalcolano quel max da
-- righe durevoli, quindi nessuno dei due puo' cancellare il contributo
-- dell'altro (il difetto "il webhook azzera la concessione del coach" che
-- questa architettura evita). Perche' il ledger e non un contatore sul profilo:
-- un contatore sarebbe read-modify-write e perderebbe la storia; le righe
-- durevoli rendono il ricalcolo idempotente e ricostruibile.
--
-- ---------------------------------------------------------------------------
-- APPEND-ONLY, COME audit_log E consents
-- ---------------------------------------------------------------------------
-- RLS ON e UNA SOLA policy, di SELECT. Le scritture arrivano da
-- grant_athlete_access() (SECURITY DEFINER, 150300) e dal backfill di 150200,
-- entrambi con privilegi di sistema; per authenticated non esiste policy
-- INSERT/UPDATE/DELETE, quindi l'append-only e' ottenuto per ASSENZA di policy.
-- Non si arriva al livello program_releases (trigger anti-mutazione + FORCE
-- RLS): quello e' il grado di un ledger art. 22, questo e' amministrativo.
--
-- Policy singola combinata own-or-coach, con (SELECT auth.uid()) fra parentesi:
-- non aggrava multiple_permissive_policies ne' auth_rls_initplan (pattern F0).
--
-- ON DELETE: athlete_id CASCADE (segue il dato dell'atleta, come consents),
-- granted_by SET NULL (il registro sopravvive alla cancellazione del coach, con
-- l'attore anonimizzato — come audit_log.actor_id; per questo NON e' NOT NULL:
-- una riga di backfill di sistema nasce gia' con granted_by NULL).
--
-- PRE-FLIGHT (Cowork): access_grants NON esiste (verificato 2026-07-21).
-- VERIFICA POST-APPLY: RLS enabled=true, esattamente 1 policy (SELECT), 0 policy
-- di scrittura; get_advisors(security) senza nuovi problemi.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.access_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_until timestamptz NOT NULL,
  source        text NOT NULL,
  payment_ref   text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Backstop: la validazione vera (con messaggio d'errore utile) sta nella RPC.
  CONSTRAINT access_grants_source_len CHECK (length(source) BETWEEN 1 AND 40),
  CONSTRAINT access_grants_payment_ref_len CHECK (payment_ref IS NULL OR length(payment_ref) <= 200)
);

-- Indice sull'accesso "ultima riga per atleta": lo usano sia il ricalcolo del
-- webhook sia quello della RPC per leggere la concessione piu' recente.
CREATE INDEX IF NOT EXISTS idx_access_grants_athlete_created
  ON public.access_grants (athlete_id, created_at DESC);

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

-- Unica policy: lettura own-or-coach. Nessuna INSERT/UPDATE/DELETE = append-only
-- per i client; scrivono solo il backfill di sistema e grant_athlete_access().
DROP POLICY IF EXISTS access_grants_select_own_or_coach ON public.access_grants;
CREATE POLICY access_grants_select_own_or_coach
  ON public.access_grants
  FOR SELECT
  TO authenticated
  USING (
    athlete_id = (SELECT auth.uid())
    OR public.is_coach_of_athlete(athlete_id)
  );

COMMENT ON TABLE public.access_grants IS
  'Registro append-only + SORGENTE DUREVOLE delle concessioni di accesso (fetta F1): chi, a chi, fino a quando, per quale motivo, contro quale pagamento. profiles.access_until = max(copertura abbonamento, granted_until della riga piu'' recente qui). Scritto dal backfill di sistema e da grant_athlete_access(). Le concessioni via Stripe non passano di qui: il loro ledger e'' stripe_events.';
COMMENT ON COLUMN public.access_grants.source IS
  'Provenienza della concessione (es. bonifico, contanti, cortesia, backfill_coached). Testo libero e non un enum: e'' un dato amministrativo che non deve richiedere una migration per accogliere un caso nuovo.';
COMMENT ON COLUMN public.access_grants.payment_ref IS
  'Riferimento del pagamento fuori piattaforma (numero fattura, CRO del bonifico...). Nullable: una concessione di cortesia o di backfill non ne ha uno.';
