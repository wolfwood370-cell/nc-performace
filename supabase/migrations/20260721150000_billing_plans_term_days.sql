-- =============================================================================
-- 20260721150000_billing_plans_term_days.sql
-- =============================================================================
-- Fetta F1 "accesso universale", passo 1a. Aggiunge billing_plans.term_days:
-- la DURATA dell'accesso concesso da un piano PREPAGATO (billing_interval =
-- 'one_time'), in giorni.
--
-- Prima delle 4 migration della fetta (ordine per dipendenza):
--   150000  billing_plans.term_days            <- questo file (nessuna dipendenza)
--   150100  access_grants (ledger)
--   150200  profiles.access_until + trigger + backfill (legge access_grants)
--   150300  grant_athlete_access() RPC
--
-- ---------------------------------------------------------------------------
-- PERCHE' UNA COLONNA NUOVA E NON billing_interval / il nome del piano
-- ---------------------------------------------------------------------------
-- tier != durata. `tier` (billing_plans.tier, text con CHECK monthly|premium)
-- dice COSA sblocca il piano, via tier_entitlements. `billing_interval` dice
-- COME si fattura ('month'/'year' ricorrenti, oppure 'one_time'). Per i
-- ricorrenti la scadenza la fornisce Stripe (period end della subscription);
-- per un prepagato NON esiste alcuna subscription e quindi nessun periodo da
-- leggere: la durata e' una proprieta' del PRODOTTO e va scritta come dato.
--
-- Il nome del piano NON e' una fonte: oggi l'unico prepagato a DB si chiama
-- "Percorso Premium 6 Mesi" e i sei mesi vivono solo li'. E' esattamente il
-- motivo per cui tierForPlan() (_shared/billing.ts) rifiuta di leggere
-- plan.name — testo che il coach edita a piacere. Stessa regola qui.
--
-- Config-driven: la fetta costruisce la macchina, non incolla i prodotti.
-- Nessun 90/180/365 compare nel codice; i termini concreti sono dato.
--
-- ---------------------------------------------------------------------------
-- PERCHE' NESSUN CHECK "one_time => term_days NOT NULL"
-- ---------------------------------------------------------------------------
-- Sarebbe il vincolo giusto in astratto, ma la UI coach espone gia' 'Una
-- Tantum' nel form piani (src/pages/coach/CoachBusiness.tsx:222) e la mutation
-- che inserisce (src/hooks/useBillingPlans.ts:63-77) non manda term_days: il
-- vincolo trasformerebbe la creazione di un piano una-tantum in un errore
-- Postgres grezzo dentro un toast generico. Raccogliere term_days nel form e'
-- una fetta UI a se'.
--
-- Finche' quella fetta non c'e', il buco lo chiude il webhook, RUMOROSAMENTE:
-- un checkout one_time su un piano senza term_days scrive comunque la riga
-- (il legame atleta<->piano<->pagamento e' gia' nell'evento firmato e non va
-- perso) e poi SOLLEVA. Stripe ritenta per 3 giorni; l'endpoint risulta
-- failing nella dashboard; appena term_days viene impostato, un retry (anche
-- forzato da "Resend" nella dashboard Stripe) completa la riga da solo.
-- Il difetto e' visibile invece che silenzioso — l'alternativa (900 euro
-- incassati e nessun accesso, senza allarme) e' peggiore.
--
-- ---------------------------------------------------------------------------
-- PRE-FLIGHT (Cowork)
-- ---------------------------------------------------------------------------
--   a) billing_plans NON ha gia' una colonna di durata (verificato 2026-07-21);
--   b) 2 righe in tabella, di cui 1 sola one_time:
--        83b430fd-4ea3-4242-b6e2-beb94cc1592a "Percorso Premium 6 Mesi",
--        one_time, 90000 eur, tier='monthly', active=true, stripe_price_id NULL.
--
-- DOPO L'APPLY, PRIMA DEL DEPLOY DELLA EDGE (a carico di Nick — dato, non codice):
--   UPDATE public.billing_plans SET term_days = 180
--    WHERE id = '83b430fd-4ea3-4242-b6e2-beb94cc1592a';
--   piu' la correzione del tier di quel piano, se 'premium' e' il livello
--   inteso: oggi vale 'monthly', quindi chi lo compra NON sblocca le feature
--   premium (nextProfileTier protegge solo chi e' gia' premium).
--   Senza term_days quel checkout solleva per progetto, vedi sopra.
-- =============================================================================

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS term_days integer;

-- Backstop minimo: una durata c'e' o non c'e', ma non e' mai zero o negativa.
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_term_days_positive;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_term_days_positive
  CHECK (term_days IS NULL OR term_days > 0);

COMMENT ON COLUMN public.billing_plans.term_days IS
  'Durata in giorni dell''accesso concesso da un piano PREPAGATO (billing_interval = ''one_time''): obbligatoria di fatto per quei piani, ignorata per i ricorrenti (dove la scadenza la fornisce Stripe). Letta da stripe-webhook su checkout.session.completed in mode=payment per calcolare access_until. Non vincolata da un CHECK condizionale per non rompere la creazione piani della UI coach — vedi l''header della migration.';
