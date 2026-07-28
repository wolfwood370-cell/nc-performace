# Task 2026-07-28 — cancellazione atleta: possibile, completa, onesta

> **Spec sorgente (fuori repo):** `app/spec-cancellazione-atleta-2026-07-28.md` (Cowork/Nick).
> **Branch:** `claude/cancellazione-atleta` · **Esecuzione:** Claude Code, 2026-07-28.
> Ripara i 3 difetti indipendenti della cancellazione: (a) i RESTRICT dei 2 registri la rendevano IMPOSSIBILE per chi ha ricevuto un programma; (b) colonne senza vincolo la rendevano INCOMPLETA in silenzio; (c) nessuna disdetta Stripe = cliente cancellato ma ancora addebitato.

---

## Il prompt (verbatim dalla spec)

```
**Task:** riparare la cancellazione atleta. Tre difetti indipendenti: (a) i vincoli RESTRICT dei due registri la rendono IMPOSSIBILE per chi ha ricevuto un programma; (b) 12 colonne senza vincolo la rendevano INCOMPLETA anche prima, in silenzio; (c) non disdice l'abbonamento Stripe, quindi cancellerebbe un cliente lasciandolo addebitato. NON tocchi il predicato d'accesso, NON tocchi release-autonomous-program, NON tocchi i trigger append-only dei registri, NON tocchi il listino.

## OBIETTIVO
Osservabile: cancellare un atleta che ha ricevuto programmi E ha un abbonamento attivo (1) disdice l'abbonamento su Stripe, (2) fa sparire il profilo e OGNI riga che lo riguarda in tutte le tabelle, (3) lascia intatte le righe del registro dei rilasci, che però non rimandano più a nessuno, (4) e se una qualunque di queste cose non riesce, NON cancella niente e lo dice.

## MIGRATION (una sola)
DROP program_releases_athlete_id_fkey / nutrition_releases_athlete_id_fkey (solo il vincolo;
colonna e trigger append-only intatti) · ADD FK ON DELETE CASCADE sulle colonne senza vincolo
· ADD notifications.sender_id -> profiles(id) ON DELETE SET NULL · ri-eseguibile a vuoto.

## FUNZIONE delete-athlete — ordine obbligato, fallisce chiuso a ogni passo
1 autorizzazione invariata (incl. ramo idempotente) · 2 leggi e conserva gli id Stripe ·
3 disdetta IMMEDIATA verificata rileggendo (502 stripe_cancel_failed, TERMINA SENZA CANCELLARE)
· 4 scrub payload stripe_events del cliente (502 stripe_events_scrub_failed) · 5 DELETE profiles
con commento vero · 6 deleteUser fail-loud (500 auth_user_deletion_failed, profileDeleted:true)
· 7 200 { success, subscriptionCanceled, stripeEventsScrubbed }.

## INVARIANTI
trigger append-only ATTIVI e mordenti dopo la fetta · mai 2xx con lavoro incompiuto · nessun
passo prima della disdetta verificata · ramo idempotente conservato · nessuna policy RLS
allentata · stringhe-utente in italiano, codici d'errore inglesi e stabili.

## VIETATI
release-autonomous-program · stripe-webhook (logica) · _shared/billing.ts · il listino ·
i trigger e la funzione prevent_program_release_mutation.
```

---

## Addendum esecuzione (2026-07-28)

### Decisioni approvate all'OK del piano (Nick)

1. **Erratum VIEW (recepito in spec §1.2):** `analytics_athlete_progress` e `analytics_athlete_summary` hanno `relkind='v'` (verificato live da Nick) — FK impossibile e non necessaria. **Vincoli nuovi = 10 CASCADE + `sender_id` SET NULL, non 12.**
2. **Scrub esteso a `metadata.athlete_id`:** i prepagati possono avere `session.customer` null, ma `create-checkout-session` stampa sempre `metadata.athlete_id`; senza questo matcher quei payload resterebbero con nome ed email.
3. **FE su `auth_user_deletion_failed` + `profileDeleted:true`:** successo-con-avviso — pulizia cache e navigate avvengono comunque (il profilo non esiste più).

### Correzioni di realtà in esecuzione

- **Trappola del DROP (spec §1.2):** `athlete_id` dei registri sta in DUE vincoli — la FK verso `profiles` (droppata) e il composito `*_supersedes_same_athlete_fk` (resta). Drop **per nome**, mai per colonna; la lente scope ha verificato che il composito non compare in alcun DROP.
- **Nomi FK occupati:** `ai_usage_tracking.user_id` e `support_tickets.user_id` hanno già FK inline verso `auth.users` coi nomi default `<table>_user_id_fkey` → le nuove FK verso `profiles` usano `_profiles_fkey` per convivere senza clobber.
- **`isResourceMissing` fail-closed:** solo `code === 'resource_missing'` vale come "già sparita"; un 404 anonimo aborta la cancellazione (verificato sui `.d.ts` reali di stripe@18.5.0).

### Esecuzione

| Commit    | Contenuto                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `8620d55` | migration `20260728150000_cancellazione_atleta_vincoli.sql`                                                            |
| `289e6e0` | `delete-athlete` riscritta: modulo `delete/deleteAthlete.ts` (porte iniettate) + 20 test step-recorder + index sottile |
| `2ee1fda` | FE: body da `error.context`, copy italiana 502, successo-con-avviso                                                    |
| `8dff542` | chiusura review: mai inglese crudo nel toast (fallback + logger), commenti senza overclaim                             |

### Verifica

- Deno **461/461** (baseline 441 misurata col runner + 20 nuovi) · vitest **160/160** · `tsc` verde · `npx deno check --no-lock --node-modules-dir=none` su index verde · diff = 7 file dichiarati, zero VIETATI.
- **Review avversariale: 30 agenti** (5 lenti + 11 mutazioni su copia scratchpad — **11/11 uccise** — + 2 refuter/finding a voti effettivi): 1 difetto distinto confermato (copy inglese per esiti non mappati) chiuso in `8dff542`; il resto refutato con evidenza (scrub parziale = UPDATE non DELETE; stato sub-senza-customer irraggiungibile coi writer reali; flag per-run spec-conformante).

### Post-merge

Ordine vincolante, misura del residuo `stripe_events` inclusa (atteso **>0**): vedi `docs/HANDOFF.md §0`, bullet cancellazione-atleta. `types.ts` si rigenera SOLO dopo l'apply (sessione Code successiva).
