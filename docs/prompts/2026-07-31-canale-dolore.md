# Task: canale-dolore — riaccendere il canale `has_pain` nel check-in atleta

> Prompt-file trascritto dal blocco «IL PROMPT» di `app/spec-canale-dolore-2026-07-31.md` (Cowork, OK di Nick 2026-07-31).
> Committato da Code come primo atto del branch `claude/canale-dolore`.
> Esiti e decisioni in coda al file (§Aggiornamenti in esecuzione).

**Task:** dare all'atleta un modo esplicito di segnalare dolore nel check-in giornaliero, cablando il campo `daily_readiness.has_pain` che oggi non viene mai inviato. Riaccende due meccanismi di sicurezza già scritti e oggi inerti: l'avviso «Dolore Segnalato» al coach e il gate `safety_capture` del motore nutrizionale. NESSUNA migration. NESSUNA modifica a supabase/functions/\*\*. NESSUNA modifica alla logica dell'avviso al coach.
**Data:** 2026-07-31
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** `claude/canale-dolore`

Lavori sul repo NC Performance Hub (frontend Vite SPA; edge functions = Deno). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice. Il contratto di scrittura non cambia: il campo esiste già ed è già accettato dal hook.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- `src/pages/athlete/DailyCheckin.tsx` — la pagina da modificare. Struttura attuale: card biofeedback (5 metriche 1..5, selezione singola, `biofeedback` in stato locale) + card indolenzimento muscolare (`soreness`, multi-selezione con intensità, :263-285). Il submit è a :342-360 e NON invia `has_pain`. Leggi tutta la funzione di submit prima di toccarla.
- `src/hooks/athlete/useAthleteReadinessHooks.ts:55-70` — `SubmitReadinessInput` prevede già `has_pain?: boolean | null`. :99 lo mappa nel payload con `input.has_pain ?? null`. Non serve modificare questo file: verifica e conferma nel PIANO.
- `src/hooks/useCoachData.tsx:287-300` — l'avviso `pain_reported`. SOLA LETTURA. La condizione è già giusta: oggi è monca perché manca l'ingresso, non perché sia scritta male. Il ramo «Dolore generico» a :300 deve diventare raggiungibile, NON va rimosso.
- `supabase/functions/compute-nutrition-target/target/processAthlete.ts:163-184` — il gate `safety_capture`. SOLA LETTURA, VIETATO MODIFICARE. Serve solo perché tu sappia cosa stai riaccendendo.
- `src/pages/athlete/DailyReadiness.tsx` — esiste ed è nella stessa area. Verifica se è un secondo punto d'ingresso che scrive `daily_readiness`: se lo è, dillo nel PIANO e fermati — non deciderlo da solo. Se è solo di lettura, dichiaralo.
- `src/hooks/useAthleteHealthProfile.ts:125` e `:218` — legge `has_pain` e lo mappa con `r.has_pain || false`. SOLA LETTURA: segnala nel PIANO se quel `|| false` diventa fuorviante ora che il campo sarà valorizzato, ma non cambiarlo in questa fetta.
- Schema REALE verificato il 2026-07-31: `daily_readiness.has_pain` è boolean nullable, già presente nei tipi generati. Nessuna migration serve.

## OBIETTIVO

Nel check-in giornaliero l'atleta trova una domanda esplicita sul dolore, e può rispondere sì anche senza selezionare nessuna zona. La risposta finisce in `daily_readiness.has_pain`.

## UI — dove va e come si comporta

- Posizione: una card propria, PRIMA della card dell'indolenzimento muscolare. Il dolore è la domanda che apre; le zone sono il dettaglio, non il contrario.
- Tre stati, non due: non risposta (null) · sì (true) · no (false). All'apertura la domanda è non risposta, e resta tale finché l'atleta non tocca nulla. Nessun valore preimpostato.
- Testo: italiano, chiaro, non allarmistico, e deve distinguere il dolore dall'indolenzimento normale post-allenamento. Proposta da usare salvo tua obiezione nel PIANO:
  - domanda: «Hai dolore oggi?»
  - riga di aiuto: «Un dolore diverso dal normale indolenzimento dopo l'allenamento.»
- Selezionare una zona NON accende `has_pain`. Sono due segnali distinti e restano distinti: se li unissi, ogni indolenzimento fisiologico dopo una seduta pesante fermerebbe il rilascio nutrizionale e produrrebbe un'escalation al coach — nel giro di due settimane nessuno guarderebbe più quegli avvisi. Questo è un invariante, non una preferenza.
- Accessibilità: la nuova domanda si usa da tastiera (focus visibile, attivabile con Invio/Spazio, etichette collegate). Il progetto ha un debito noto di accessibilità e un varco che blocca il peggioramento: questa fetta non deve farlo salire.

## OUTPUT / CONTRATTO

- Al submit, `submitReadiness.mutate({...})` porta in più SOLO `has_pain`, col valore dello stato a tre vie.
- Nessun'altra chiave cambia. Nessun contratto di funzione cambia. Nessuna scrittura nuova.

## INVARIANTI DA NON ROMPERE

1. Non risposta = null. Mai false per assenza di risposta: il registro forense a valle dichiara esplicitamente che un dato mancante non va forgiato.
2. Indolenzimento non è dolore. Le zone non accendono `has_pain`, e `has_pain` non popola le zone.
3. Nessuna modifica sotto `supabase/functions/**`. Il gate si riaccende dall'ingresso, non toccandolo.
4. Nessuna migration, nessun DDL, nessuna scrittura DB.
5. La logica dell'avviso al coach resta invariata. Deve solo tornare raggiungibile in tutti e due i rami.
6. Il conteggio di eslint non sale rispetto a `.eslint-baseline`.
7. Stringhe utente in italiano. Dati salute = art. 9: niente nuovi campi di testo libero, niente log del valore.
8. RLS invariata.

## FILE

- MODIFICATI: `src/pages/athlete/DailyCheckin.tsx`
- COMMIT SEPARATO E DICHIARATO (facoltativo, stessa sessione): `src/integrations/supabase/types.ts` rigenerato — è il debito delle due migration arretrate, non fa parte di questa fetta
- VIETATI (non aprire per modificarli): tutto `supabase/**` · `src/hooks/useCoachData.tsx` · `src/hooks/useAthleteHealthProfile.ts` · `src/hooks/athlete/useAthleteReadinessHooks.ts` (salvo tu dimostri nel PIANO che serve, con la riga) · `.eslint-baseline` · `.github/**` · niente «già che ci sono»

## COME LAVORI

- Prima il PIANO (dove metti la card, come modelli i tre stati, come provi ogni criterio) → STOP per l'OK di Nick → poi esegui.
- Commit atomici, in italiano, con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Merge/push = Nick, e ora passa da una Pull request: su `main` non si spinge più direttamente.
- A fine fetta, review indipendente prima di dichiararla finita.

---

## Aggiornamenti in esecuzione

> Registro degli scostamenti e delle decisioni, contestuale ai commit (lezione ci-varchi: gli scostamenti si scrivono qui, non solo nei commit message).

1. **[pre-piano] Correzione di realtà — l'avviso coach è dead code.** Panel avversariale (4 lenti) + verifica diretta: `useCoachDashboardData()` (`src/hooks/useCoachData.tsx:109`) e `useCoachData()` (`:516`) non sono esportati e non hanno alcun call-site; l'unico export del file è `useCoachAthletes` (`:87`, importato solo da `CoachAnalytics.tsx:3`). L'avviso «Dolore Segnalato»/«Dolore generico» non è renderizzato da nessuna UI. La superficie coach VIVA di `has_pain` è `useAthleteHealthProfile.ts:289` («Dolore riportato negli ultimi N giorni», finestra 7gg) → `HealthProfileTab.tsx:52`, montata in `AthleteDetail.tsx:3341`. **Decisione Nick (2026-07-31, verificata da lui su `useCoachData.tsx`):** acceptance #3/#4 riformulate sulla superficie viva (v. §Acceptance aggiornata); ricognizione dell'intero strato di avvisi coach non renderizzato = fetta separata (chip flaggata).
2. **[pre-piano] Aggiunta BLOCCANTE di Nick — niente auto-sblocco silenzioso del gate.** L'upsert è full-row: un re-submit lo stesso giorno senza toccare la domanda avrebbe sovrascritto un `has_pain=true` con `null`, spegnendo il gate `safety_capture` in silenzio (CORE §0: mai aggirare in silenzio). Chiusura minima ordinata da Nick: all'apertura della pagina `hasPain` si inizializza dal valore della riga di OGGI se esiste (una lettura, solo quel campo; il precaricamento degli altri campi NON si tocca — il loro azzeramento al re-submit è comportamento pre-esistente e non è un gate: chip flaggata). Nuovo criterio: «sì» → secondo invio senza toccare la domanda → `has_pain` resta `true`; se torna `null` la fetta è bocciata. Deroga dichiarata alla riga «all'apertura la domanda è non risposta»: vale per il primo check-in del giorno; se oggi è già stata data una risposta, la card la mostra (niente stato nascosto).
3. **[pre-piano] Decisioni dichiarate nel PIANO (OK di Nick in blocco):** (a) il seed usa l'hook già esportato `useDailyReadinessQuery(date)` (`useAthleteReadinessHooks.ts:31` — import, nessuna modifica al file: la clausola «salvo tu dimostri che serve» non si attiva); la lettura è la riga di oggi via queryKey già invalidata dal submit; si consuma SOLO `has_pain`. (b) Tre stati senza deselezione, pattern `ScoreScaleRow` replicato (button nativi `role="radio"`/`aria-checked`, soli token, focus outline nativo — il CSS del progetto non lo azzera). (c) «Salva» disabilitato finché la lettura della riga di oggi è in volo, per non spedire `null` in corsa su un giorno già risposto; su errore di rete della lettura il fallback resta `null` (dato mancante non si forgia) — residuo dichiarato. (d) Lo store Zustand locale non modella il dolore e non si tocca: i trend dashboard non lo consumano. (e) `.env.local` NON si copia nel worktree (decisione Nick): verifica da tastiera = statica in-fetta + collaudo di Nick post-merge.
4. **[pre-piano] `DEFAULT false` a schema su `has_pain`** (migration `20260109192244`:51): l'invariante «non risposta = null» è garantito solo dal payload esplicito del hook. La rimozione del DEFAULT è DDL in corsia Cowork, la esegue Nick — fuori da questa fetta.
5. **[pre-piano] `DailyReadiness.tsx` dichiarato:** non è un secondo punto d'ingresso — non tocca Supabase affatto (vista presentazionale, zero query). Secondo scrittore nel codice: `useOfflineSync.ts:242` (modulo dormiente, zero import; il suo payload non porta `has_pain` — chip flaggata per l'eventuale rianimazione).

6. **[post-review] Esito della review avversariale di fine fetta** (19 agenti: 4 lenti → 16 finding grezzi → dedupe semantica → 7 giudicati con 2 refuter ciascuno a voti effettivi): **1 major confermato 2/2** + 2 minor confermati, 4 refutati, 4 note. Il major: il seed anti-auto-sblocco si eludeva con una cache persistita mai rivalidata (`staleTime Infinity` globale: una seconda tab/dispositivo o una sessione precedente tengono `null` «fresco per sempre», nessun refetch al mount, guardia `isFetching` inerte → re-invio sovrascrive `true`). Fix: **refetch una-tantum al mount** (stessa contromisura che il repo usa già in `useLatestNutritionRelease.ts:68-70` e `coachQueries.ts:14-23`) + guardia Salva estesa a `submitReadiness.isPending` (chiude anche la nota doppio-tap). Minor mezzanotte-UTC: il seed di ieri poteva essere forgiato nella riga del giorno nuovo se il tap su Salva arrivava dopo la mezzanotte → il giorno si ri-verifica a submit-time e il seed vale solo se il giorno coincide; **il contratto resta letterale** (nessuna chiave `date` aggiunta al payload: il residuo è la finestra di millisecondi fra il calcolo in `handleSave` e quello interno del hook — dichiarato e accettato). Correzioni di dichiarazioni mie beccate dalla review: (a) la voce 3(b) diceva «soli token» — impreciso: la card replica gli stili LETTERALI delle card esistenti del file (`bg-white`, shadow `rgba`, `text-white`), che token non sono; scelta consapevole di coerenza in-file, la tokenizzazione della pagina atleta è debito preesistente fuori scope; (b) i reflow prettier del commit `4c7a967` sono **7**, non 6 (manca dal conteggio il collasso di `selectedMuscles`). Residuo registrato senza fix (nota, non refutata ma stretta): mutation in volo dopo chiusura-pagina + ri-invio rapido può ancora invertire l'ordine delle scritture — richiede un upsert più lento della lettura successiva; deciso di non aggiungere stato globale per questo.

7. **[post-review, 2° giro] La ri-verifica falsificabile ha smontato il primo fix del major — re-fix con deroga dimostrata sul file del hook.** Due verificatori indipendenti (istruiti a rompere il fix, evidenza sui sorgenti installati di supabase-js/auth-js e @tanstack/query-core 5.90.20) hanno provato che il refetch-al-mount era **inerte**: `useAuth` è stato **per-istanza, non un context** (`useAuth.tsx:30-36`, zero AuthProvider nel repo — verificato anche da me), quindi al mount la query nasce sulla chiave pre-auth `["daily-readiness","anon",data]` con `enabled:false`, il refetch si consumava lì (corto-circuito `if (!user?.id) return null`), e al passaggio alla chiave reale la cache persistita restava «fresca per sempre» → scenari seconda-tab e kill-app ANCORA aperti; il commento «Auth is resolved before mount» era falso. **Re-fix** (commit di questo aggiornamento): (a) deroga sul file VIETATO `useAthleteReadinessHooks.ts` ATTIVATA con la dimostrazione richiesta dalla spec — il fix page-only è provatamente inerte e l'alternativa (invalidate dalla pagina) duplicherebbe la queryKey privata `readinessKey` (`:22-23`); modifica ADDITIVA: `useDailyReadinessQuery(date, opts?: { staleTime?: number })`, altri consumer intatti; (b) il check-in passa `staleTime: 0` → verificato sui sorgenti installati che il fetch scatta sia al cambio chiave anon→reale (`shouldFetchOptionally` gated su `isStale` con lo staleTime dell'OBSERVER — `queryObserver.js:457-461`) sia al mount con dati restaurati; (c) guardia Salva **fail-closed**: `!isFetchedAfterMount || isFetching || isError || isPending` — il baseline di `isFetchedAfterMount` si resetta al cambio query (`:416-418`) quindi è falso per tutta la fase pre-auth e finché il primo fetch sulla chiave reale non si chiude; gli errori flippano il flag (`:328`) da cui l'`isError` esplicito. **Residui dichiarati e accettati**: errore di lettura persistente (incl. lie-fi a retry esauriti) → Salva resta disabilitato senza messaggio dedicato (fail-closed: meglio bloccare il salvataggio che spedire un seed non confermato; si esce riaprendo la pagina) · offline → disabilitato finché il fetch non riesce (la mutation comunque non si accoda: retry 0) · tap esplicito dato a cavallo della mezzanotte UTC → atterra sul giorno nuovo (scelta dell'atleta, mai un default forgiato) · doppio submit con navigate-away nel mezzo (finestra già registrata in voce 6).

8. **[chiusura] Terzo giro di verifica: il re-fix REGGE.** Due verificatori indipendenti (istruiti a romperlo, evidenza sui sorgenti installati query-core 5.90.20 / auth-js): seconda-tab/secondo-device CHIUSO (fetch forzato al cambio chiave, guardia senza frame scoperti: il render dello switch marca `fetching` ottimistico), kill-app CHIUSO, regressione altri consumer CHIUSA (spread di `undefined` = no-op, Dashboard/Training identici a prima), **criterio bloccante di Nick VERIFICATO su tutti i percorsi con un mount o un focus di mezzo**. PARZIALI registrati come residui, non difetti attivi: (a) race hydrate-after-switch — se il restore IDB completa dopo il passaggio alla chiave reale, `isFetchedAfterMount` può flippare presto, ma ogni ramo di danno è oggi sbarrato da barriere collaterali (isFetching ottimistico, isError su lie-fi, mutation retry-0 offline, retryer al refocus): **fragile a refactor futuri — MAI introdurre `retry>0` o mutation resumabili sulle scritture readiness senza rivalutare questo punto**; (b) fail-closed UX-cieco — dopo un errore di lettura persistente Salva resta disabilitato senza messaggio finché un focus/reconnect/remount non rilancia il fetch (comportamento voluto, debito UX registrato); (c) tab-sempre-focused multi-device — senza alcun evento di focus fra la scrittura concorrente e il submit il seed non si aggiorna: inerente al last-write-wins dell'upsert, mitigazione = update condizionale server-side, fuori scope; (d) footgun API dichiarato: `{ staleTime: undefined }` esplicito sovrascriverebbe il default globale (nessun caller lo fa). Il commento della guardia è stato riscritto senza l'overclaim falsificato dal verificatore (ordine normale vs race inversa).

### Acceptance aggiornata (delta rispetto al blocco sopra, decisione Nick 2026-07-31)

- #3 (riformulata): «sì» senza zone → `has_pain=true` e `soreness_map` vuota in riga; nel tab Salute di AthleteDetail (`HealthProfileTab`) il riepilogo diventa rosso con «Dolore riportato negli ultimi N giorni». Il ramo «Dolore generico» di `useCoachData.tsx:300` resta pinnato solo a livello di dato (hook senza consumer, v. Aggiornamento 1).
- #4 (riformulata): solo zone, domanda non toccata → `has_pain` `null`; comportamento coach invariato per costruzione (zero file toccati su quei percorsi).
- NUOVO (bloccante, Aggiornamento 2): risposta «sì», poi secondo invio nello stesso giorno senza toccare la domanda → `has_pain` resta `true`.
