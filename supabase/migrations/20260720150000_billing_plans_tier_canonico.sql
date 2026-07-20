-- Tier canonico sul piano commerciale (fetta checkout test-mode, 2026-07-20).
-- Il tier NON si deriva piu' dal NOME del piano (stringa di presentazione, editabile
-- dal coach): diventa un DATO con dominio chiuso, le cui chiavi sono esattamente
-- quelle di tier_entitlements.tier. E' il valore che il webhook Stripe copia su
-- profiles.tier, cioe' cio' che accende gli entitlement dell'atleta.
-- Additiva su tabella a 0 righe. DEFAULT 'monthly' perche' la UI coach di creazione
-- piano non scrive ancora la colonna (fetta UI-piani successiva): la difesa contro un
-- piano premium etichettato monthly e' la guardia anti-declassamento nel webhook
-- (_shared/billing.ts -> nextProfileTier), che non riscrive mai un profilo premium.

ALTER TABLE public.billing_plans
  ADD COLUMN tier text NOT NULL DEFAULT 'monthly'
  CHECK (tier IN ('monthly', 'premium'));

COMMENT ON COLUMN public.billing_plans.tier IS
  'Chiave canonica dell''entitlement commerciale: valori = tier_entitlements.tier. Il nome del piano e'' UI, il tier e'' contratto.';
