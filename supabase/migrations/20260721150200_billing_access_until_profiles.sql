-- =============================================================================
-- 20260721150200_billing_access_until_profiles.sql
-- =============================================================================
-- Fetta F1 "accesso universale", passo 1a (scrittura). Introduce
-- public.profiles.access_until: la cache-AUTORITA' dell'accesso, uguale per
-- tutti (autonomo con abbonamento, prepagato, coached). Un solo dato-data
-- leggibile ovunque, che sostituira' i tre predicati sparsi di oggi.
--
-- ATTENZIONE — 1a NON cambia il comportamento: nessuno legge ancora
-- access_until. Il flip del predicato (src/lib/billing/access.ts + gate
-- server-side in release-autonomous-program) e' la fetta 1b, e va fatta solo
-- dopo aver VISTO questa colonna popolata correttamente in produzione.
--
-- Dipende da 150100 (access_grants): il backfill dei coached, qui sotto, vi
-- inserisce una riga per rendere il valore +90gg una CONCESSIONE tracciata e
-- non un valore-fantasma sul profilo. Vedi il modello in testa a 150100.
--
-- ---------------------------------------------------------------------------
-- IL MODELLO: access_until = max(copertura-abbonamento, ultima-concessione)
-- ---------------------------------------------------------------------------
-- access_until NON e' "il campo dell'ultimo evento": e' il MASSIMO fra due
-- coperture durevoli, la scadenza-abbonamento e l'ultima concessione manuale.
-- Entrambi gli scrittori (webhook e RPC grant) ricalcolano quel massimo da
-- righe durevoli, quindi:
--   - il webhook non puo' cancellare una concessione del coach;
--   - la RPC non puo' cancellare la copertura di un abbonamento;
--   - un prepagato SCADUTO (riga 'active' per sempre, con data passata) non
--     spegne un abbonamento 'canceling' ancora pagato, perche' il max prende
--     la data futura;
--   - e' idempotente (valori fissi da righe durevoli, invariante-webhook 2).
--
-- ---------------------------------------------------------------------------
-- PERCHE' COLONNA + GUARDIA NELLO STESSO FILE (non negoziabile)
-- ---------------------------------------------------------------------------
-- public.profiles ha la policy "Users can update their own profile"
--   FOR UPDATE TO authenticated USING (auth.uid() = id)  -- WITH CHECK NULL
-- che e' una guardia di RIGA, non di COLONNA; e i grant sono UPDATE su TUTTE
-- le colonne (authenticated ha UPDATE su tutte e 31). L'unica difesa e'
-- prevent_profile_privilege_escalation(), DENY-LIST enumerata: ogni colonna
-- nuova nasce SCRIVIBILE DALL'ATLETA finche' non viene aggiunta a mano.
--
-- Una migration che aggiunge la colonna e una successiva che la protegge
-- lascerebbero in produzione una finestra in cui:
--   PATCH /rest/v1/profiles?id=eq.<proprio-uid>  {"access_until":"2099-12-31"}
-- concede accesso a vita. Per questo colonna, backfill e guardia stanno qui,
-- da applicare come UNITA' ATOMICA (una sola apply_migration = una sola
-- transazione): nessun'altra sessione vede mai la colonna priva di guardia.
--
-- ORDINE DELLE ISTRUZIONI: E' PORTANTE. I backfill vengono PRIMA del
-- CREATE OR REPLACE della guardia. Applicato dal connettore la sessione gira
-- come `postgres`, dove current_setting('role', true) vale 'none' e NON matcha
-- il bypass service_role in testa al trigger: con la guardia gia' attiva, il
-- backfill verrebbe respinto da 'Changing access_until is not allowed'.
--
-- ---------------------------------------------------------------------------
-- IL VARCO PER LA RPC — perche' un GUC e non SET LOCAL ROLE service_role
-- ---------------------------------------------------------------------------
-- grant_athlete_access() (150300) deve poter scrivere questa colonna. Non passa
-- dal bypass in testa al trigger: SECURITY DEFINER cambia current_user, NON il
-- GUC `role`, che sotto PostgREST resta 'authenticated'.
--
-- Valutata l'alternativa `SET LOCAL ROLE service_role` dentro la RPC. SCARTATA:
--   1. escala l'INTERO resto della funzione a service_role, quando serve
--      sbloccare una sola colonna in un solo UPDATE;
--   2. il ripristino non e' pulito: RESET ROLE riporta al SESSION user
--      (`authenticator`), non al ruolo 'authenticated' di PostgREST;
--   3. dipende dall'appartenenza di `authenticator` a `service_role`, vera in
--      Supabase ma implicita e non dichiarata nel repo.
-- Il GUC transazione-locale e' least-privilege (sblocca SOLO il ramo
-- access_until) e non e' raggiungibile da un client PostgREST, che valorizza i
-- soli GUC request.* da header/claim e non puo' chiamare set_config() (in
-- pg_catalog, non nello schema esposto) nella stessa transazione della PATCH.
-- Se il pre-flight mostrasse che il varco non tiene, il fallback dichiarato e'
-- SET LOCAL ROLE service_role (vedi 150300).
--
-- ---------------------------------------------------------------------------
-- DEBITO DICHIARATO
-- ---------------------------------------------------------------------------
-- prevent_profile_privilege_escalation() resta una DENY-LIST: fail-open per
-- costruzione (ogni colonna futura nasce scrivibile). La conversione ad
-- ALLOW-LIST e' una fetta hardening dedicata, gia' concordata. Qui il diff e'
-- minimo: una riga in piu', stessa forma delle altre dieci; il SET search_path
-- esistente ('public', senza pg_temp) e' lasciato INVARIATO per non mescolare
-- scope su una funzione di sicurezza.
--
-- ---------------------------------------------------------------------------
-- PRE-FLIGHT (Cowork)
-- ---------------------------------------------------------------------------
--   a) profiles.access_until NON esiste (verificato 2026-07-21);
--   b) il corpo attuale del trigger e' quello di 20260714205824 (10 RAISE);
--   c) conteggio atteso dei backfill su questo dataset: 2 righe di profilo
--      toccate + 1 riga inserita in access_grants (il coached). Nel dettaglio:
--        - 1 atleta autonomo con athlete_subscriptions active, period_end
--          FUTURO 2026-08-21 -> access_until = quella data (via 2a);
--        - 1 atleta coached (subscription_status active, tier premium) senza
--          copertura abbonamento -> access_until = now()+90gg + 1 riga
--          access_grants 'backfill_coached' (via 2b).
--      Se i conteggi non combaciano, FERMARSI.
--
-- VERIFICA POST-APPLY (bloccante — nessun passo successivo senza il verde)
--   1. pg_get_functiondef -> 11 RAISE, bypass service_role e SET search_path
--      preservati, trigger trg_prevent_profile_privilege_escalation abilitato;
--   2. come COACH autenticato (JWT reale, non service_role):
--        PATCH /rest/v1/profiles?id=eq.<proprio-uid> {"access_until": ...}
--      -> DEVE essere RESPINTA ('Changing access_until is not allowed');
--   3. idem come ATLETA autenticato sulla PROPRIA riga -> RESPINTA;
--   4. UPDATE a valore invariato -> PASSA (IS DISTINCT FROM = false);
--   5. select di controllo: i 2 profili attesi hanno access_until valorizzato,
--      0 profili coached con access_until NULL, la riga backfill_coached esiste;
--   6. get_advisors(security): nessun problema nuovo.
--
-- Migration ONE-SHOT: i backfill sono idempotenti sul NULL, ma una
-- ri-esecuzione riaprirebbe 90 giorni a un coached azzerato di proposito e
-- inserirebbe una seconda riga backfill_coached. Non rieseguire.
-- =============================================================================

-- 1. La colonna --------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_until timestamptz;

COMMENT ON COLUMN public.profiles.access_until IS
  'Cache-autorita'' dell''accesso (fetta F1): NULL o nel passato = nessun accesso, per chiunque e senza eccezioni. = max(copertura-abbonamento, ultima-concessione-manuale), ricalcolata da righe durevoli (athlete_subscriptions + access_grants) da stripe-webhook e da grant_athlete_access(). NON confondere con current_period_end, che resta lo specchio del periodo-abbonamento ed e'' scritta a mano dal coach.';

-- 2. Backfill — PRIMA della guardia, vedi l'header ---------------------------
-- Nessuno deve restare chiuso fuori al momento del flip (fetta 1b).

-- 2a. Chi ha una copertura-abbonamento VIGENTE: la scadenza e' un dato reale.
--     - solo righe che danno accesso (active/canceling: canceling e' disdetta
--       programmata ma periodo pagato);
--     - solo period_end nel FUTURO: una riga 'active' stantia con data passata
--       NON deve scrivere una scadenza gia' spirata (romperebbe l'invariante
--       "nessuno perde l'accesso" e non verrebbe recuperata da 2b);
--     - max() per atleta: con piu' righe vince la scadenza piu' lontana, mai
--       una a caso.
UPDATE public.profiles p
   SET access_until = agg.mx
  FROM (
    SELECT athlete_id, max(current_period_end) AS mx
      FROM public.athlete_subscriptions
     WHERE status IN ('active', 'canceling')
       AND current_period_end IS NOT NULL
       AND current_period_end > now()
     GROUP BY athlete_id
  ) agg
 WHERE agg.athlete_id = p.id
   AND p.access_until IS NULL;

-- 2b. I coached SENZA copertura-abbonamento: oggi accedono in virtu' del ramo
--     'coached = accesso gratis' che la fetta 1b rimuove. Non c'e' un dato da
--     cui derivare la scadenza (fatturati fuori piattaforma), quindi si concede
--     un orizzonte esplicito e CORTO: 90 giorni. La scadenza visibile
--     costringe a impostare la data vera con grant_athlete_access() invece di
--     lasciare un accesso perpetuo travestito da data.
--     Il valore e' inserito come CONCESSIONE tracciata (fonte 'backfill_coached'),
--     cosi' access_until resta = max(..., ultima-concessione) anche se un
--     domani un evento Stripe ricalcolasse il profilo di quel coached.
INSERT INTO public.access_grants (athlete_id, granted_by, granted_until, source)
  SELECT id, NULL, now() + interval '90 days', 'backfill_coached'
    FROM public.profiles
   WHERE coaching_mode = 'coached'
     AND access_until IS NULL;

UPDATE public.profiles p
   SET access_until = g.granted_until
  FROM (
    SELECT DISTINCT ON (athlete_id) athlete_id, granted_until
      FROM public.access_grants
     WHERE source = 'backfill_coached'
     ORDER BY athlete_id, created_at DESC
  ) g
 WHERE g.athlete_id = p.id
   AND p.access_until IS NULL;

-- 3. La guardia --------------------------------------------------------------
-- Superset esatto della versione 20260714205824: 10 RAISE invariati, +1.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role / postgres bypass this trigger
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing role is not allowed';
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Changing coach_id is not allowed';
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'Changing subscription_tier is not allowed';
  END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Changing subscription_status is not allowed';
  END IF;
  IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end THEN
    RAISE EXCEPTION 'Changing current_period_end is not allowed';
  END IF;
  -- NEW (2026-07-14): colonne commerciali/di-modalità F0 — server-set all'invito, mai editabili dall'atleta.
  IF NEW.coaching_mode IS DISTINCT FROM OLD.coaching_mode THEN
    RAISE EXCEPTION 'Changing coaching_mode is not allowed';
  END IF;
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'Changing tier is not allowed';
  END IF;
  -- NEW (2026-07-14, fase 2 cutover): campi-sicurezza clinici — server-set via edge fn service_role (bypass sopra), mai editabili dall'atleta post-intake.
  IF NEW.medical_clearance_required IS DISTINCT FROM OLD.medical_clearance_required THEN
    RAISE EXCEPTION 'Changing medical_clearance_required is not allowed';
  END IF;
  IF NEW.red_flags IS DISTINCT FROM OLD.red_flags THEN
    RAISE EXCEPTION 'Changing red_flags is not allowed';
  END IF;
  IF NEW.fms_exclusion_zones IS DISTINCT FROM OLD.fms_exclusion_zones THEN
    RAISE EXCEPTION 'Changing fms_exclusion_zones is not allowed';
  END IF;
  -- NEW (2026-07-21, fetta F1): access_until e' la cache-autorita' dell'accesso.
  -- Scrittori legittimi: (a) service_role — stripe-webhook, gia' coperto dal
  -- bypass in testa; (b) grant_athlete_access(), che apre questo varco con
  -- set_config('app.grant_access','on',true), transazione-locale e non
  -- impostabile da un client PostgREST. Vedi l'header per l'alternativa
  -- SET LOCAL ROLE service_role e perche' e' stata scartata.
  IF NEW.access_until IS DISTINCT FROM OLD.access_until
     AND coalesce(current_setting('app.grant_access', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Changing access_until is not allowed';
  END IF;

  RETURN NEW;
END;
$function$;
