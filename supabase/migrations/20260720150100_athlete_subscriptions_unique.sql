-- Unicita' strutturale su athlete_subscriptions (fetta checkout test-mode, 2026-07-20).
-- La tabella nasce senza alcun UNIQUE: solo PK(id) e due indici NON unici. I due
-- percorsi di scrittura fanno pero' read-then-insert senza transazione
-- (create-checkout-session su (athlete_id, plan_id)) e il webhook risolve la riga
-- per stripe_subscription_id: due righe gemelle rendono ambiguo ogni lookup.
-- PERCHE' ORA: il webhook v22 controlla ogni errore di supabase-js e risponde 500,
-- cosi' Stripe ritenta. Con righe duplicate il lookup fallisce in modo deterministico
-- e il 500 diventa un loop fino all'esaurimento dei retry, con l'abbonamento pagato
-- e mai attivato. Il vincolo chiude la classe alla radice.
-- Additivo, su tabella a 0 righe. Pre-flight a carico di chi applica: verificare che
-- non esistano gia' duplicati su nessuna delle due chiavi.

-- Un atleta ha al massimo UNA riga per piano: e' la chiave che create-checkout-session
-- usa per non duplicare la riga 'incomplete' al doppio click.
CREATE UNIQUE INDEX athlete_subscriptions_athlete_plan_uidx
  ON public.athlete_subscriptions (athlete_id, plan_id);

-- Parziale: le righe 'incomplete' nascono senza subscription Stripe (NULL non e'
-- soggetto al vincolo), ma un id di subscription non puo' mai appartenere a due righe.
CREATE UNIQUE INDEX athlete_subscriptions_stripe_sub_uidx
  ON public.athlete_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
