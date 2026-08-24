# ULTIMO RITORNO — fetta etichette (B-21)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/etichette` · 2026-08-23 · base `origin/main` = `6aa7871` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/etichette) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/etichette`, da `6aa7871`, 11 commit di codice + il commit dei documenti (tip del ramo):
`9c0db73` (roster: badge ACWR classificato via assessRisks, chip sul type, «Ultimo check-in»,
stepper senza step inventati, 2 file di test) · `11763a0` (contesto atleta senza mock: 78%/1.24/
Blocco-Settimana/Oura via, compliance senza 0/0, «saltati» date-only, test) · `410c456` (anello
Prontezza Training Hub null-safe, test) · `28bb332` (etichetta Soreness → «Recupero muscolare»,
mappa di display, chiave store intatta) · `41c82d1` (debrief: assenza ≠ «0 kg / 0 serie», «Serie
Registrate») · `5c48f65` (scheme v1 senza «0 Serie» su documento degenere, byte-identico sul
percorso valido) · `a783a43` (CoachHome: bullet «allenamenti da rivedere» col conteggio pieno,
pulse con sole grandezze misurate) · `92f86e6` (scheda atleta: readiness senza base-70, TDEE
rimosso, «Giorni con allenamento N/M») · `2e87412` (calendario: «+N altri» conta i nascosti veri,
mock Google rimosso) · `40a937b` (inspector: Copilot senza numeri inventati, Last RPE/RIR fedele) ·
`3374b04` (tooltip Stato di Forma dice cos'è il numero) · `ebd185b` (rilievi confermati della
passata indipendente, v. §8.7).

## 2. Manifesto

**NUOVI:** `src/lib/painMarkers.ts` (selezione per type, pura) ·
`src/components/coach/__tests__/AthleteCard.acwr.render.test.ts` (5 test, con la prova rossa) ·
`src/components/coach/__tests__/painMarkers.chip.render.test.ts` (1 test, label vs type) ·
`src/components/coach/messages/__tests__/AthleteContextPane.render.test.ts` (4 test, due stati →
due schermate) · `src/pages/athlete/__tests__/AthleteTraining.ring.render.test.ts` (3 test, anello
con controllo positivo).

**MODIFICATI:** `src/components/coach/AthleteCard.tsx` · `src/pages/coach/CoachAthletes.tsx` ·
`src/components/coach/messages/AthleteContextPane.tsx` · `src/pages/athlete/AthleteTraining.tsx`
(i 4 dichiarati dal prompt) — più i file che **il censimento ha fatto cadere**:
`src/pages/coach/CoachHome.tsx` · `src/hooks/useCoachDashboardMetrics.ts` (2 conteggi additivi,
nessuna query nuova) · `src/pages/coach/athlete-detail/OverviewTab.tsx` ·
`src/pages/coach/AthleteDetail.tsx` · `src/pages/athlete/AthleteDashboard.tsx` ·
`src/pages/athlete/PostWorkoutDebrief.tsx` · `src/lib/program/releaseView.ts` ·
`src/components/coach/program/ProgressionInspector.tsx` ·
`src/components/coach/analytics/AiInsightCard.tsx` ·
`src/components/coach/calendar/CalendarGrid.tsx` · `src/pages/coach/CoachCalendar.tsx` ·
`docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file.

**NEL PERIMETRO MA NON TOCCATI:** `assessRisks` e le soglie (riusate, mai modificate) · le funzioni
pure vietate (`computeCheckinScore`, `sessionForDate`, `localIsoDate`, `sessionRpeRange`) ·
`supabase/**` · `src/integrations/supabase/types.ts` · `package.json`.

## 3. Le due prove dei permessi (repo di scarto in scratchpad, 2 commit)

- `git reset --hard HEAD~1` → **rifiutato dal permesso** («Permission … has been denied») ·
  `git rebase HEAD~1` → **rifiutato dal permesso**.
- `git status -sb` + `git log --oneline` → **passati** (`## master · 49911f6 · 1a5acf2`).

## 4. IL CENSIMENTO — 54 su 54, più 28 aggiunte (82 verificate)

Regola meccanica rieseguita su `main = 6aa7871` (righe citate su quella base). ⚠️ **Divergenza
dichiarata:** il file-campione dichiara i **conteggi** per file (Σ=54) ma non l'elenco per
etichetta che il prompt affermava presente → l'elenco l'ho prodotto io rieseguendo la regola.
Su 5 file su 10 il mio conteggio **coincide** col dichiarato; sugli altri 5 la regola produce
**28 coppie in più** — aggiunte e dichiarate, nessuna tolta. Copertura: **54/54 dichiarate + 28
aggiunte = 82 coppie, tutte coi tre confronti eseguiti**. Cadute totali: **26**. Fan-out: 10 agenti
in sola lettura (1 per superficie), ogni caduta ri-verificata da me alla fonte prima del fix.

### AthleteCard.tsx — 5/5 (3 cadute)

| coppia                                  | (a)(b)(c)    | esito                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Readiness N%» + «Zona ottimale» (:307) | si·si·si     | ok — ramo Optimized oggi irraggiungibile (nessun chiamante passa `weeklyAdherence`), v. §8                                                                                                                                                        |
| «Aderenza settimanale N%» (:319)        | dubbio·si·na | ok ma irraggiungibile; fallback `?? 0` (:299) reso inerte dal gate di deriveState                                                                                                                                                                 |
| «ACWR spike · fuori soglia» (:373)      | si·si·**no** | **CADE (c)** — reso per QUALSIASI numero in stato critical (anche da solo dolore): 0.00 mostrato come spike. Fonte: `useAthletesRiskOverview.ts:135`. **Riparata**: classificazione via `assessRisks` (spike/sovraccarico/detraining/nella norma) |
| stepper «PAR-Q: Mancante…» (:430)       | **no**·si·na | **CADE (a)** — costante `["PAR-Q","Prima sessione"]` resa come stato reale. Fonte: `CoachAthletes.tsx:374`. **Riparata**: nomina il solo fatto misurato («Primo check-in»)                                                                        |
| «Ultima attività» (:469)                | **no**·si·na | **CADE (a)** — il valore è la data dell'ultimo CHECK-IN, non dell'attività. Fonte: `useAthletesRiskOverview.ts:293`. **Riparata**: etichetta e prop → «Ultimo check-in»                                                                           |

### CoachHome.tsx — 6/6 (4 cadute)

| coppia                                             | (a)(b)(c)        | esito                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Hai N avvisi dal sistema» (:169)                  | si·dubbio·na     | ok — satura a 20 (`useCoachAlerts.ts:44`) ma coerente col pannello che elenca la stessa finestra; mai 0 su assenza                                                                                                                                               |
| «Hai N **check-in** in attesa di revisione» (:200) | **no**·**no**·na | **CADE (a,b)** — conta workout log da rivedere (nel vocabolario dell'app «check-in» = daily_readiness) col tetto tacito a 10. Fonte: `useCoachDashboardMetrics.ts:388-393,412`. **Riparata**: «N allenamenti da rivedere» + conteggio pieno pre-slice            |
| «RPE N — Forte/Mod/Facile» (:730)                  | si·si·si         | ok — rpe_global crudo, null non rende, verso coerente                                                                                                                                                                                                            |
| «Completati N/M» (:630)                            | **no**·**no**·na | **CADE (a,b)** — numeratore = coda revisione 28gg, denominatore = `max()` di conteggi non commensurabili. Fonte: `useCoachDashboardMetrics.ts:385-412` + `CoachHome.tsx:272`. **Riparata**: «Completati oggi» = workout_logs completati OGGI, senza denominatore |
| «In corso N» (:640)                                | **no**·**no**·na | **CADE (a)** — nessun segnale «in corso» esiste nei dati. Fonte: `CoachHome.tsx:274`. **Riparata**: rimossa → «Da fare oggi» (misurata)                                                                                                                          |
| «Da iniziare N» (:645)                             | **no**·**no**·na | **CADE (a)** — identicamente 0 per algebra, per ogni input (verificato: entrambi i rami si annullano). Fonte: `CoachHome.tsx:275`. **Riparata**: rimossa → «Da rivedere» (misurata)                                                                              |

### OverviewTab.tsx — 11/11 (3 cadute)

| coppia                                        | (a)(b)(c)    | esito                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Readiness / 100» (:138)                      | **no**·si·na | **CADE (a)** — fallback euristico `score = 70 ± aggiustamenti`: costante resa come misura. Fonte: `AthleteDetail.tsx:2852`. **Riparata**: solo `subjective_readiness` convertita, altrimenti null + arco non disegnato                     |
| «ACWR (Acuto:Cronico)» (:164)                 | si·si·si     | ok — rolling average genuino, insufficient-data → «—»                                                                                                                                                                                      |
| «Acuto: N» (:184) · «Cronico: N» (:187)       | si·si·na     | ok (2 coppie) — medie giornaliere reali, rese solo con dati sufficienti                                                                                                                                                                    |
| «Est. TDEE kcal/day» (:209)                   | **no**·si·na | **CADE (a)** — età fissa 30, formula solo maschile, 800 al posto dell'altezza, attività 1.55 hardcoded; «TDEE Tracker» nomina uno strumento inesistente. Fonte: `AthleteDetail.tsx:2886`. **Riparata**: rimosso, card → «Peso (30 giorni)» |
| «30d Min/Current/30d Max kg» (:257,:263,:269) | si·si·na     | ok (3 coppie) — min/ultimo/max reali su finestra dichiarata, blocco nascosto su serie vuota                                                                                                                                                |
| «Aderenza Settimanale N%» (:339)              | **no**·si·na | **CADE (a)** — misura i giorni trascorsi con un workout completato, non l'aderenza a un piano (i rest day contano da missed). Fonte: `AthleteDetail.tsx:2920`. **Riparata**: «Giorni con allenamento N/M», senza semaforo di giudizio      |
| «+N altri infortuni attivi» (:377)            | dubbio·si·na | ok — «attivi» include `recovering`: lettura colloquiale plausibile, dichiarato                                                                                                                                                             |
| tooltip «Peso» del grafico (:238)             | si·si·na     | ok — kg reale del punto                                                                                                                                                                                                                    |

### AthleteDashboard.tsx — 10 censite (7 dichiarate + 3: le 6 MetricKey enumerate una a una) — 1 caduta

| coppia                                             | (a)(b)(c)        | esito                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Prontezza» + anello (:174)                        | si·si·na         | ok — score 0-100 reale, assenza = «—» e anello vuoto (fetta A-04)                                                                                                                                                                     |
| «SONNO» · «STRESS» · «UMORE» · «DIGESTIONE» (:197) | si·dubbio·na     | ok (4 coppie) — la riscalatura tacita 1-5→×2 avviene **a monte** nel check-in (`DailyCheckin.tsx:323-330`): la card rende fedele la colonna; fetta clinica separata, v. §8                                                            |
| «FATICA» (:197)                                    | dubbio·dubbio·na | ok — mai chiesta: inversione di «Energia» a monte; direzione coerente. Dichiarata, v. §8                                                                                                                                              |
| «SORENESS» (:197)                                  | **no**·dubbio·na | **CADE (a)** — l'aggregato è il COMPLEMENTO (10 = niente indolenzimento): «Soreness 10» si leggeva come massimo dolore. Fonte: `readinessMath.ts:316`. **Riparata**: etichetta di display «Recupero muscolare» (chiave store intatta) |
| «N esercizio/i» (:458)                             | si·si·na         | ok — conteggio reale con plurale corretto                                                                                                                                                                                             |
| «RPE serie 7.5–9» (:465)                           | si·si·na         | ok — quotazione della prescrizione, warm-up esclusi, mai RPE 0                                                                                                                                                                        |
| «N/3 selezionate» (:661)                           | si·si·na         | ok — denominatore = vincolo reale di salvataggio                                                                                                                                                                                      |

### AthleteTraining.tsx — 18 censite (8 dichiarate + 10: lo scheme composito enumerato per etichetta) — 1 caduta

| coppia                                                                   | (a)(b)(c)    | esito                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iniziali L-M-M-G-V-S-D + giorno del mese (:251)                          | si·si·na     | ok — stessa Date, coerenti per costruzione                                                                                                                                                     |
| «N esercizi» (:371)                                                      | si·si·na     | ok                                                                                                                                                                                             |
| «RPE serie» (:377)                                                       | si·si·na     | ok                                                                                                                                                                                             |
| «Prontezza N%» (:445)                                                    | si·si·na     | ok — e l'**anello** accanto (:416), fuori censimento per regola (numero in style), disegnava 0 su assenza: **riparato** (verità 4), ora nessun arco senza misura                               |
| «Fase 1: Main Session» (:490)                                            | dubbio·si·na | ok — ordinale hardcoded ma oggi fedele per struttura del release; dichiarato                                                                                                                   |
| «N Serie» v1 (:537)                                                      | si·**no**·na | **CADE (b)** — documento degenere coercito a 0 e reso «0 Serie × Reps». Fonte: `releaseView.ts:93`. **Riparata**: i campi degeneri restano assenti dallo scheme; percorso valido byte-identico |
| «Reps» v1 (:537)                                                         | si·dubbio·na | ok — etichetta orfana su reps vuota, ora soppressa dallo stesso guard                                                                                                                          |
| «RPE · RIR · % 1RM · rec …s · tempo» v2 uniforme (:537) e per-set (:548) | si·si·na     | ok (11 coppie) — quotazioni per-set sulla scala del coach, 0-sentinella → null, assenza non rende l'etichetta                                                                                  |

### PostWorkoutDebrief.tsx — 5/5 (2 cadute)

| coppia                                  | (a)(b)(c)        | esito                                                                                                                                                         |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Volume Totale N kg» (:97)              | dubbio·**no**·na | **CADE (b)** — query assente (loading/deep-link) rendeva lo 0 di init come misura. Fonte: `:73`. **Riparata**: `rows` assenti → «—»; array vuoto resta 0 vero |
| «Serie Completate N» (:106)             | dubbio·**no**·na | **CADE (b)** + (a) dubbio — conta TUTTE le righe senza filtro is_completed. Fonte: `:72`. **Riparata**: «—» su assenza + rinominata «Serie Registrate»        |
| scala «RPE della Sessione» 1..10 (:163) | si·si·na         | ok — costanti rese come opzioni di input, non come misura                                                                                                     |
| RPE selezionato + descrittore (:180)    | si·si·si         | ok — dichiarazione dell'atleta, versi coerenti (RPE↑ = RIR↓)                                                                                                  |
| durata «1h 15m» (:291)                  | si·dubbio·na     | ok — timer reale; tick congelati in background e 0s su deep-link: dichiarato, v. §8                                                                           |

### ProgressionInspector.tsx — 10 censite (4 dichiarate + 6) — 3 cadute

| coppia                                         | (a)(b)(c)        | esito                                                                                                                                                                                                 |
| ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Settimana N» (:178 e :355)                    | si·si·na         | ok (2 coppie) — order 1-based dallo store                                                                                                                                                             |
| «N serie» (:278) · «Serie N» (:359)            | si·si·na         | ok (2 coppie)                                                                                                                                                                                         |
| teaser «carico +2.5%» (:293)                   | **no**·si·na     | **CADE (a)** — costante nel JSX spacciata per output del «Coach Copilot», che non esiste. **Riparata**: tile senza numeri, dichiara che l'engine non è attivo                                         |
| teaser «media RPE ≤ 7.5» (:294)                | **no**·si·na     | **CADE (a)** — nessuna media RPE è calcolata nel componente. **Riparata**: idem                                                                                                                       |
| «Last RPE» (:361 — **l'ancora di B-21**)       | **no**·**no**·na | **CADE (a,b)** — fallback su `rir_target`: scala documentata INVERSA (RIR 2 ≈ RPE 8, `types/training.ts:62`) sotto etichetta RPE. **Riparata**: l'etichetta segue il dato (Last RPE / Last RIR / «—») |
| «Top %1RM» (:366)                              | si·si·na         | ok — max reale, assenza → «—»                                                                                                                                                                         |
| legenda per-set RPE/RIR/% (:512) · «#N» (:514) | si·si·na         | ok (2 coppie)                                                                                                                                                                                         |

### AthleteContextPane.tsx — 11 censite (6 dichiarate + 5) — 6 cadute

| coppia                                                    | (a)(b)(c)    | esito                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Blocco 1» (:264) · «Settimana 3/4» (:264)                | **no**·si·na | **CADONO (a)** (2 coppie) — costanti JSX: ogni atleta sempre al Blocco 1, settimana 3/4. Fonte: `:264` (TODO ammesso a `:258-260`). **Riparate**: tile rende «—», mock rimosso («Mesociclo Ipertrofia» incluso)                                                                                                                           |
| «ACWR (acuto:cronico) 1.24» + «Zona Ottimale» (:287,:291) | **no**·si·si | **CADE (a)** — `const acwrValue = 1.24`: giudizio clinico su una costante identica per tutti. Fonte: `:184`. **Riparata**: la superficie non lo calcola → «—», nessun verdetto                                                                                                                                                            |
| «Morning Readiness · Oura N%» + «Ottima/Buona…» (:335)    | **no**·si·si | **CADE (a)** — fallback `?? 78` + l'etichetta nomina uno strumento (Oura) che non esiste: la fonte è il check-in manuale. Fonte: `:164`. **Riparata**: «Prontezza · Check-in», arco e numero solo col dato, niente giudizio qualitativo (mappa non validata — stessa decisione del Training Hub), «Nessun check-in registrato» su assenza |
| «Ultimo check-in: data» (:344)                            | si·si·na     | ok — data reale; fallback `?? new Date()` teorico dichiarato                                                                                                                                                                                                                                                                              |
| giorno-del-mese + weekday «Prossimi Allenamenti» (:372)   | si·si·na     | ok — borderline dichiarata, stessa scheduled_date                                                                                                                                                                                                                                                                                         |
| «RPE N» (:419) · «N min» (:438)                           | si·si·na     | ok (2 coppie) — min: colonna non più alimentata dal flusso attivo, dichiarato v. §8                                                                                                                                                                                                                                                       |
| «Completati N/M» (:458) · «N fatti» (:470)                | si·**no**·na | **CADONO (b)** (2 coppie) — `?? 0` rendeva «0/0 · 0 fatti» su query assente/errore. **Riparate**: assenza → «—», riga fatti/saltati solo col dato                                                                                                                                                                                         |
| «N saltati» (:475)                                        | dubbio·si·na | ok dopo fix — il confronto con l'orologio contava la seduta di OGGI come saltata per quasi tutto il giorno: ora date-only                                                                                                                                                                                                                 |

### AiInsightCard.tsx — 2/2 (1 caduta)

| coppia                      | (a)(b)(c)    | esito                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Stato di Forma N%» (:227)  | **no**·si·si | **CADE (a)** — il tooltip prometteva un «indice calcolato su base RPE, VBT e trend di recupero» che nessun codice calcola: è un punteggio qualitativo LLM, con fallback costante 0.5 A MONTE (`supabase/functions/analyze-athlete-week/index.ts:349` — **vietato in questa fetta**, v. §7/§8). **Riparata lato FE**: il tooltip dice cos'è davvero |
| «Settimana del data» (:151) | si·si·na     | ok — inizio reale della finestra analizzata                                                                                                                                                                                                                                                                                                        |

### CalendarGrid.tsx — 4 censite (0 dichiarate + 4) — 2 cadute

| coppia                                              | (a)(b)(c)        | esito                                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «+N altri» (:297)                                   | **no**·**no**·na | **CADE (a,b)** — sottraeva la costante 3 mentre la cella rende 2-5 chip; il totale includeva i 3 slot mock. Fonte: `:149`. **Riparata**: conta gli eventi davvero nascosti dai cap                                               |
| «Google HH:MM - HH:MM» (:514)                       | **no**·si·na     | **CADE (a)** — orari da `MOCK_GOOGLE_BUSY_SLOTS` (`CoachCalendar.tsx:71`), ancorati a oggi, resi come impegni sincronizzati da un'integrazione inesistente. **Riparata**: feed vuoto finché l'integrazione non esiste            |
| colonna «lun 15 ago» (:403) · titolo periodo (:641) | si·si·na         | ok (2 coppie) — stessa Date                                                                                                                                                                                                      |
| ancora `:215` «⚠️ Spike ACWR»                       | —                | **confermata etichetta SENZA numero** (fuori censimento come dichiarato); nomina però una grandezza che nessun codice calcola (trigger = workout `missed`, proxy dichiarato) — se mai porterà un numero cadrà su (a). Backlog §7 |

## 5. Acceptance — i 7 criteri

1. **Censimento chiuso**: §4 — 54/54 + 28 aggiunte, esiti per coppia, cadute con `file:riga` della fonte. ✔
2. **Prova rossa sul meccanismo**: §6 — run rosso incollato con etichetta attesa E ricevuta; due stati → due schermate in tutti i test nuovi. ✔
3. **Nessun numero inventato sopravvive** — comando: `grep -nE "\?\? 78|= 1\.24|Blocco 1 · Settimana|MOCK_GOOGLE|score = 70|5\.7 \* 30|2\.5%|RPE ≤ 7\.5" src/ -r` → **0 righe** (prima: 8 siti). Le costanti legittime residue sono scale di input (RPE 1..10) e soglie di config dichiarate. ✔
4. **Chip sul type** — `painMarkers.chip.render.test.ts`: label tradotta → chip invariato; type cambiato → chip sparisce (controllo positivo nello stesso test). Comando: `npx vitest run src/components/coach/__tests__/painMarkers.chip.render.test.ts` → 1 passed. ✔
5. **L'anello non disegna zero** — `AthleteTraining.ring.render.test.ts`: senza riga di oggi il Training Hub non contiene `stroke-dashoffset` (nessun arco); con la riga l'arco è esattamente a `2π·14·(1−score/100)`; controllo positivo nello stesso test. → 3 passed. ✔
6. **Gate** — `npx tsc --noEmit -p tsconfig.app.json` → exit 0 · `npx vitest run` → **360 passed su 33 file, zero errori** (baseline 347/29 + 13 nuovi in 4 file — v. divergenza ambiente in §8) · `npx eslint .` → **81 errori** (= ratchet, nessun nuovo) · `package.json` NON toccato → audit-gate non dovuto. ✔
7. **Perimetro** — `git diff origin/main..HEAD --stat`: solo i file del manifesto §2. ✔

## 6. La prova rossa

Rimessa l'etichetta fissa (`ACWR_BADGE["high_injury_risk"]` al posto di `classifyAcwr(acwrValue)`):

```
FAIL  AthleteCard.acwr.render.test.ts > 0.5 con dolore → detraining, non spike
AssertionError: expected 'ACWR spike' to be 'ACWR detraining'
Expected: "ACWR detraining"   Received: "ACWR spike"
FAIL  … > 1.0 con dolore → nella norma, non spike
Expected: "ACWR nella norma"  Received: "ACWR spike"
FAIL  … > 1.4 con dolore → sovraccarico
Expected: "ACWR sovraccarico" Received: "ACWR spike"
Tests  3 failed | 2 passed (5)
```

Ripristinato il fix: `360 passed (360)` su 33 file.

## 7. Cosa ho TOLTO invece di riparare (backlog della fetta successiva)

| tolto                                                             | grandezza che il prodotto non misura ancora                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| «Est. TDEE kcal/day» (OverviewTab)                                | TDEE reale: servono età/sesso/attività dall'intake + formula validata                      |
| ACWR nel ContextPane («—»)                                        | l'aggregazione acuto:cronico su quella superficie (riuso di useAthletesRiskOverview o RPC) |
| «Blocco · Settimana» nel ContextPane («—»)                        | wiring della periodizzazione (training_phases) nel pane messaggi                           |
| readiness euristica base-70 (AthleteDetail)                       | una readiness derivata da sleep/HRV richiede un metodo validato                            |
| slot «Google» (CoachCalendar, feed vuoto)                         | l'integrazione Google Calendar                                                             |
| «In corso» del pulse (CoachHome)                                  | un segnale di sessione avviata su quella superficie (started_at)                           |
| numeri del «Coach Copilot» (ProgressionInspector)                 | l'engine di auto-regolazione                                                               |
| giudizio «Ottima/Buona/Media/Bassa» (ContextPane, anche col dato) | una mappa score→parola validata (decisione già presa dal Training Hub, estesa qui)         |

## 8. Non fatto / divergenze (vince la mia misura)

1. **Campione senza elenco per etichetta**: il prompt dice che le altre 50 stanno nel file allegato «con file:riga, testo e variabile» — il file dichiara solo la regola e i conteggi. Elenco riprodotto da me (§4); conteggi combacianti su 5 file, +28 coppie su 5 file (aggiunte, nessuna tolta), CalendarGrid 0 dichiarate → 4 trovate (2 cadute).
2. **Baseline vitest**: 347/29 è giusta ma sul worktree girava 343/28 + 1 unhandled error — `jsdom` irrisolvibile perché la risoluzione risale al `node_modules` del checkout **principale**, fermo 19 commit indietro (jsdom è arrivato con la fetta cucitura). Fix ambiente: `npm ci` NEL worktree (nessun symlink preesistente; bersaglio condiviso verificato DOPO: 522 pacchetti, tsc 5.8.3, vitest 4.1.10 — guardia Fragilità #5). Post-install: 347+13=360/33, zero errori. ⚠️ Per Nicolò: anche il principale avrà bisogno di `npm install` dopo il sync (il build-gate del hook pre-commit gira lì).
3. **Regex del chip**: dichiarata a `CoachAthletes.tsx:363-367`, misurata a `:362-366` (shift 1).
4. **Famiglia «testo come identificatore»**: misurata su tutto `src/` — la regex del chip era l'**unico** membro (`grep -rE "\.test\(.*label|label\.(match|includes)"` → 1 risultato). Nella stessa famiglia semantica ma su TITOLI: `CalendarGrid.tsx:144-145` (regex `rehab|fms|…` sul titolo appuntamento, dichiarata come proxy nel commento) — non toccata, fuori censimento, dichiarata qui.
5. **Vicini di scala NON riparati** (dichiarati, non nascosti): badge «Attivo/Inattivo» e filtro «Attivi» (derivati dal check-in: il copy del filtro lo dichiara — etichette senza numero) · toggle «Mostra Google Calendar» (resta, ora senza dati) · `details` degli alert in inglese su superficie italiana (anomalia di lingua, non B-21). La striscia giorni di OverviewTab (X rossa «missed» su giorni senza piano consultato) era in questa lista: la review l'ha promossa a contraddizione e ora È riparata (`ebd185b` — giorni senza log neutri, card «Allenamenti della settimana»).
6. **Fuori dalla fetta, registrati**: fallback `rpe ?? 5` / `duration ?? 1800` in `useCoachDashboardMetrics.ts:118-119` fabbricano carico dentro l'ACWR degli urgentAlerts (non reso come numero su questa superficie, ma pesa sulla severità del triage) — chip flaggata · riscalatura tacita 1-5→×2 del check-in e «Fatica» derivata da «Energia» (`DailyCheckin.tsx:323-330`) — fetta clinica, non di etichette · fallback `sentiment_score: 0.5` nell'edge function (`analyze-athlete-week/index.ts:349`) — `supabase/**` vietato qui: un valore 0.5 in DB resta indistinguibile lato FE · timer del debrief congelato a tab in background (documentato nello store) · ramo Optimized di AthleteCard irraggiungibile (nessuno passa `weeklyAdherence`) — dead code de facto, da decidere se cablare o potare.
7. **Passata indipendente (3 agenti, sola lettura)**: code-test-verifier ✔ (tsc 0 · 360/33 zero errori · eslint 81 = ratchet) · aura-theme-auditor: **zero bloccanti**, un advisory (il badge ACWR usa classi palette amber/sky/emerald invece di token semantici — idioma già consolidato nello stesso file e in AthleteDetail/ProgramBuilder: scelta deliberata di coerenza col contesto, dichiarata) · code-reviewer: **nessun bloccante**, «committabile sì»; 3 rilievi confermati + 1 minore, TUTTI chiusi in `ebd185b`: (a) «Da rivedere» contava solo il filtro-priorità del feed (note o 24h) → ora conta ogni log completato senza feedback nella finestra fetchata; (b) «Completati oggi» confrontava giorno UTC con giorno locale → date locali su entrambi i lati; (c) la card settimana teneva titolo «Compliance» e X rossa «missed» senza piano consultato → «Allenamenti della settimana», giorni senza log neutri; (d) barra compliance del pane a 0% accanto a «—» → nascosta senza dato. Ha inoltre VERIFICATO senza rilievi: equivalenza di deriveState (critical ⟺ acwr>1.5 o dolore, NaN incluso), selezione del chip identica alla vecchia regex sui dati reali, scheme v1 byte-identico sul ben formato, `hiddenEvents ≥ 0` dimostrabile in ogni ramo, zero query nuove, funzioni pure e invarianti CORE §0 intatti. Gate ri-eseguiti dopo `ebd185b`: tsc 0 · vitest 360/33 · eslint 81 · grep acceptance-3 = 0.

## 9. Resta a Nicolò

- **Merge della PR** ([crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/etichette)) coi 2 check obbligatori verdi.
- **Ultimo miglio dalle due schermate**: il coach apre roster + scheda atleta + messaggi (pane contesto) — niente 78%/1.24/Blocco 1, badge ACWR che dice la classe vera; l'atleta apre il Training Hub senza check-in — «Da registrare», anello vuoto, nessun arco a 0.
- Dopo il sync di `main`: `npm install` nel checkout principale (jsdom per il gate del hook).
- Decidere sul backlog §7 (in ordine di valore: ACWR reale nel ContextPane · periodizzazione nel pane · TDEE con dati veri o card via).
