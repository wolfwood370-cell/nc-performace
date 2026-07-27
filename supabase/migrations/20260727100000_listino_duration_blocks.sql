-- =============================================================================
-- 20260727100000_listino_duration_blocks.sql
-- =============================================================================
-- Fetta listino-3a: la durata di un piano prepagato diventa DURATA IN BLOCCHI
-- (1 blocco = 4 settimane = 28 giorni) e ogni piano dichiara a CHI e' venduto
-- (coaching_mode). term_days diventa colonna GENERATA (duration_blocks * 28):
-- il webhook continua a leggerla senza cambiare una riga (stripe-webhook
-- /index.ts:333-336) e l'errore "180 invece di 168" diventa NON RAPPRESENTABILE
-- — non esiste piu' un posto dove scrivere una durata a mano.
--
-- Questo file richiude anche un drift dichiarato: la guardia temporanea
-- billing_plans_one_time_requires_term fu applicata FUORI-REPO il 2026-07-26
-- (spec listino-3a §2), in contrasto con l'header di 20260721150000 che
-- argomentava contro un CHECK one_time=>term_days finche' il form non scriveva
-- la durata. Da questa fetta il form la scrive (duration_blocks) e l'invariante
-- vive nel passo 9 qui sotto.
--
-- Ri-eseguibile a vuoto: IF EXISTS / IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- CHI APPLICA (COWORK.md r.17/r.60, §4-bis): Cowork via apply_migration,
-- prendendo il contenuto VERBATIM da questo file; Claude Code committa solo il
-- file. Subito dopo il DDL: get_advisors (security + performance).
-- =============================================================================

-- 1. Via la guardia temporanea fuori-repo: da qui in poi l'invariante lo tiene
--    duration_blocks (passo 9).
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_one_time_requires_term;

-- 2. La durata la scrive chi vende. NULL e' legittimo per i piani a rinnovo
--    (Servizio 1): li' il periodo lo detta Stripe.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS duration_blocks integer;

-- 3. Backfill del Percorso Premium 6 Mesi. CORREZIONE DICHIARATA: 180 giorni
--    erano il riflesso "mese = 30"; 6 blocchi = 168 giorni. La riga non ha
--    sottoscrizioni collegate (verificato live il 2026-07-26): accorciarla non
--    toglie accesso a nessuno.
UPDATE public.billing_plans
   SET duration_blocks = 6
 WHERE id = '83b430fd-4ea3-4242-b6e2-beb94cc1592a';

-- 4. term_days diventa GENERATA. Il nome della colonna e' preservato di
--    proposito: e' cio' che lascia il webhook invariato. PERCHE' GENERATA e non
--    calcolata nel codice: non c'e' piu' un posto dove scrivere "180" a mano.
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_term_days_positive;
ALTER TABLE public.billing_plans
  DROP COLUMN IF EXISTS term_days;
ALTER TABLE public.billing_plans
  ADD COLUMN term_days integer GENERATED ALWAYS AS (duration_blocks * 28) STORED;

-- 5. A CHI e' venduto il piano, esplicito. NON dedotto dalla cadenza:
--    'one_time' oggi coincide col premium per caso, non per definizione.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS coaching_mode public.coaching_mode;

-- 6. Backfill (UUID letterali, letti live su HUB-PROD il 2026-07-26).
UPDATE public.billing_plans
   SET coaching_mode = 'autonomous'
 WHERE id = '43ebc3e7-11be-48c1-ba06-91e004c753e3'; -- Programmazione avanzata (mensile in uso dalla fixture)
UPDATE public.billing_plans
   SET coaching_mode = 'coached'
 WHERE id = '83b430fd-4ea3-4242-b6e2-beb94cc1592a'; -- Percorso Premium 6 Mesi

-- 7. Registro del venduto: la riga mensile gia' venduta NON si muta (resta
--    'month', con il suo stripe_price_id: il webhook ri-risolve il piano dal
--    prezzo su customer.subscription.updated e azzerarlo lo orfanerebbe).
--    Si archivia, e il Servizio 1 rinasce come riga NUOVA a cadenza 'block'.
--    Conseguenze verificate: la riga archiviata sparisce dalle liste (coach e
--    atleta filtrano su active=true) ma il nome resta visibile all'abbonato
--    (SubscriptionSection legge il join senza filtro su active);
--    syncProfileFromAthlete smette di RI-scrivere il tier per quel piano
--    (ramo else: logga e basta) mentre access_until continua a essere scritto.
UPDATE public.billing_plans
   SET active = false
 WHERE id = '43ebc3e7-11be-48c1-ba06-91e004c753e3';

--    LA RIGA NUOVA NASCE CON active = false E LA ACCENDE COWORK DOPO IL DEPLOY
--    VERIFICATO di create-checkout-session v26: nella finestra schema-nuovo /
--    funzione-vecchia un checkout su 'block' creerebbe un prezzo Stripe MENSILE
--    e lo PERSISTEREBBE in stripe_price_id. Con active=false il piano non
--    compare in nessuna lista e la finestra e' innocua PER COSTRUZIONE.
--    All'accensione, ri-verificare che stripe_price_id sia ANCORA NULL.
--    UUID fisso letterale (auto-documentante: data della migration) per la
--    ri-eseguibilita' via ON CONFLICT.
INSERT INTO public.billing_plans
  (id, coach_id, name, price_amount, currency, billing_interval,
   coaching_mode, tier, duration_blocks, stripe_price_id, stripe_product_id,
   active, description)
SELECT
  '20260727-0000-4000-8000-000000000001',
  coach_id,
  name,
  price_amount,
  currency,
  'block',
  'autonomous'::public.coaching_mode,
  'monthly',
  NULL,          -- duration_blocks: il rinnovo non ha una durata propria
  NULL,          -- stripe_price_id: lo crea create-checkout-session (v26) alla prima vendita
  NULL,          -- stripe_product_id: idem
  false,         -- vedi sopra: si accende dopo il deploy
  description
FROM public.billing_plans
WHERE id = '43ebc3e7-11be-48c1-ba06-91e004c753e3'
ON CONFLICT (id) DO NOTHING;

-- 8. Dominio CHIUSO della cadenza, coi valori storici: la riga mensile venduta
--    resta 'month' (archiviata) e un dominio a due valori la renderebbe non
--    rappresentabile. Cio' che risolve il difetto non e' escludere 'month' —
--    'month' -> Stripe {month,1} e' una traduzione VERA — ma impedire che un
--    valore LIBERO finisca nel ripiego muto della vecchia funzione.
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_interval_domain;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_interval_domain
  CHECK (billing_interval IN ('block', 'one_time', 'month', 'year'));

-- 9. Sostituisce la guardia temporanea del passo 1: un prepagato senza durata
--    non e' rappresentabile.
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_prepaid_needs_duration;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_prepaid_needs_duration
  CHECK (billing_interval <> 'one_time' OR (duration_blocks IS NOT NULL AND duration_blocks > 0));

-- 10. Una durata, se c'e', e' positiva (vale anche per i piani non prepagati).
ALTER TABLE public.billing_plans
  DROP CONSTRAINT IF EXISTS billing_plans_duration_positive;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_duration_positive
  CHECK (duration_blocks IS NULL OR duration_blocks > 0);

-- 11. Solo DOPO il backfill del passo 6. Fail-closed by construction: se in
--     prod esistessero righe con coaching_mode NULL non previste da questa
--     migration, l'apply si ferma QUI invece di proseguire.
--     (profiles.coaching_mode resta nullable: qui si vincola solo il listino.)
ALTER TABLE public.billing_plans
  ALTER COLUMN coaching_mode SET NOT NULL;

COMMENT ON COLUMN public.billing_plans.duration_blocks IS
  'Durata del servizio venduto in BLOCCHI da 4 settimane (28 giorni). Obbligatoria e positiva per i piani prepagati (billing_interval=''one_time'', CHECK billing_plans_prepaid_needs_duration); NULL per i piani a rinnovo, dove il periodo lo detta Stripe. La scrive il form del coach alla creazione del piano.';

COMMENT ON COLUMN public.billing_plans.term_days IS
  'GENERATA: duration_blocks * 28. Unica versione AUTOREVOLE dei giorni-per-blocco (il 28 in TypeScript e'' solo anteprima del form). Letta da stripe-webhook su checkout.session.completed in mode=payment per calcolare access_until. Non scrivibile: un INSERT/UPDATE che la includa viene rifiutato da Postgres.';

COMMENT ON COLUMN public.billing_plans.coaching_mode IS
  'A CHI e'' venduto il piano: ''autonomous'' (Servizio 1, programmazione a rinnovo) o ''coached'' (Servizio 2, percorso premium prepagato). NON dedotto dalla cadenza. create-checkout-session rifiuta con 403 un checkout il cui atleta ha coaching_mode diverso (o NULL).';
