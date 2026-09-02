# Task — checkin-che-non-giudica (C-15) · 2026-09-02

> Prompt-file della fetta, conservato come da spec (`Destinazione nel repo`).
> Fonte: spec-checkin-che-non-giudica-C-15-2026-09-02 (Cowork). Esito in `docs/ULTIMO-RITORNO.md`.

**Task:** il check-in settimanale del coach smette di emettere verdetti e raccomandazioni: al posto di «Indici di rischio elevati … valutare scarico» una **lettura** deterministica — aderenza per prima, sedute oltre la soglia d'attenzione lette dagli avvisi del watchdog, carico in UA — e un testo dell'IA **vagliato** prima di essere salvato. NIENTE DDL. NIENTE scritture nuove: resta il solo `upsert` su `weekly_checkins`. Una lettura in più (`coach_alerts`), dichiarata.
**Data:** 2026-09-02 · **Strumento:** Claude Code · **Branch:** claude/checkin-che-non-giudica · **Base:** `origin/main` = `7111cfb`

🔴 **IL CRITERIO È IL CONTRATTO, i passi sono una proposta:** se il repo contraddice ciò che la spec dice, vince la misura, dichiarata in DIVERGENZE.

## RITUALE D'APERTURA

In un repo di scarto, provare almeno 6 delle 13 `deny` non ancora provate (`git checkout .`, `git checkout -- *`, `git restore <file>`, `git clean -fd`, `git stash drop`, `git stash clear`, `gh pr merge`): per ciascuna «RIFIUTATO» / «PASSATO».

## VERITÀ DI RIFERIMENTO (misurate su `main` = `7111cfb`)

- `src/pages/coach/CoachCheckinInbox.tsx` — `isAnomalous` a `:87-96` (compliance < 50 || avg_rpe ≥ 8) guida filtro «Anomalie» `:103`, tono card `:153`, contatore `:238`, riquadro `:639-658`, tinta compliance `:700`, tinta RPE `:725`. Censiti 10 punti: un undicesimo va dichiarato.
- `supabase/functions/_shared/program/weekAdherence.ts` — modulo puro, 31 test. `WeekReport` (`:73`), `WeekSnapshotFields` (`:61`), `weekDataLines` (`:319`), `weekPaceContext` (`:343`), `fallbackSummaryText` (`:363`). Non si riscrive: si estende.
- `supabase/functions/generate-batch-checkins/index.ts` — tre letture in `Promise.all` (`:181-205`), fail-loud (`:211-213`), prompt (`:290-306`), risposta salvata senza vaglio (`:322-325`), upsert (`:331-341`).
- `src/hooks/useWeeklyCheckins.ts:19-28` — tipo di `metrics_snapshot` (chiavi opzionali).
- Watchdog vivo: `supabase/migrations/20260825103000_riallinea_watchdog_srpe.sql:66-72` scrive `coach_alerts(type='risk_alert', workout_log_id, severity)` quando `srpe >= 9`. **La soglia è SUA e resta lì.**
- DB vivo (01/09): `coach_alerts` ha 2 `risk_alert` del 25/08 su due `workout_log_id` diversi, entrambi nella settimana 24→30 dell'atleta `cfb31e82`; snapshot di quella settimana: `compliance_pct 50 · workouts_scheduled 2 · workouts_completed 1 · sessions_completed 4 · off_plan_sessions 0 · total_volume 9.02 · avg_rpe "8.5" · workouts_missed 1 · workouts_remaining 0`.
- Precedente «modulo condiviso importato dal frontend»: `src/lib/program/gateStatus.ts:17`.

## OBIETTIVO (osservabile)

Sulla settimana 24→30 di `cfb31e82`: **nessun** «Indici di rischio elevati», **nessun** «Valutare scarico»; un blocco **«Lettura della settimana»** con «1 giorno prescritto su 2 non onorato» · «2 sedute oltre la soglia d'attenzione» · «9,02 UA»; la card RPE medio mostra 8,5/10 **senza tinta rossa**; lo snapshot porta `sessions_over_threshold: 2`; la `ai_summary` non contiene «scarico» né alcun rapporto assente dai dati.

## ARCHITETTURA

**NUOVO modulo puro** `supabase/functions/_shared/program/checkinReading.ts` (niente `Date`, rete, `Math.random`), importato dalla edge e dal frontend:

- `ADHERENCE_GATE_PCT = 70` (R6 del metodo, tarabile) · `ADHERENCE_DAYS_WORDING_BELOW = 4` (sotto 4 prescritti la lettura è in giorni).
- `weekReading(report, overThresholdSessions): WeekReading` con `{ adherence: { gate: ok|below|none; text }, overThresholdSessions, load: { ua; text }, attention }`, `attention = gate === "below" || overThresholdSessions >= 1`.
- Regola dell'aderenza in un punto solo: `none` se `prescribedCount === 0` · `below` se `compliancePct < 70` · `ok` altrimenti. Testo in giorni sotto i 4 prescritti («1 giorno prescritto su 2 non onorato»; «2 giorni prescritti su 3 onorati»), in percentuale altrimenti («aderenza 71% (5 su 7)»); con `none`: «nessun giorno prescritto questa settimana».
- `buildCheckinPrompt(reading, report, ctx)`: la lettura IN TESTA ai dati (aderenza → sedute oltre soglia → carico → RPE medio come numero) e le regole testuali: (1) «Usa solo i numeri elencati, così come sono scritti.» (2) «Non comporre rapporti, frazioni o percentuali che non siano nell'elenco.» (3) «Non proporre azioni sul carico: niente scarico, deload, alleggerire o aumentare.» (4) solo con gate `below`: «L'aderenza è sotto la soglia: descrivi la settimana non eseguita e non commentare il carico.» (5) «Scrivi le date in lettere (24 agosto), mai con la barra.»
- `vetSummary(text, report)`: estrae ogni `N su M` (anche con parole in mezzo), `N/M`, `N%` e li confronta con l'insieme ammesso derivato dal report (`honoured su prescribed`, `honoured/prescribed`, `compliance%`, `avg_rpe/10`); cerca `scaric`, `deload`, `allegger`; una violazione → `ai_summary = fallbackSummaryText(report)` e `console.warn` con l'`athlete_id`. Conservativo per disegno (una data «24/08» lo fa scattare): §0.8.

**Le sedute oltre soglia vengono dal watchdog:** `id` nella select dei log; quarta lettura in `Promise.all` su `coach_alerts` (`type = 'risk_alert'`, `workout_log_id` fra gli id dei log della settimana), conteggio sui **`workout_log_id` distinti**; errore di lettura → il batch fallisce. Nuova chiave dello snapshot `sessions_over_threshold` (additiva, sempre presente) e nuova riga in `weekDataLines`.

**Il frontend legge la lettura, non ricalcola:** `isAnomalous` sparisce; `weekReading(...).attention` guida filtro «Anomalie», contatore e tono (warning, non `destructive`). Riquadro «Lettura della settimana»: riga 1 `adherence.text`, riga 2 (solo se > 0) «N sedute oltre la soglia d'attenzione», riga 3 `load.text`. Nessuna azione consigliata, nessuna parola «rischio». La card RPE medio perde la tinta rossa; la card compliance porta la tinta warning solo con gate `below`.

## CONTRATTO / INVARIANTI

Additivo: `metrics_snapshot.sessions_over_threshold` (number); altre chiavi invariate; tipo del hook esteso; stringhe utente in italiano. 1. Contratto di `weekly_checkins` invariato salvo la chiave additiva. 2. La soglia del watchdog non compare nel modulo né nel frontend. 3. Nessuna raccomandazione sul carico scritta dal codice o lasciata passare dal vaglio. 4. Assenza ≠ zero per `compliance_pct`/`workouts_scheduled`/`total_volume`; `sessions_over_threshold` sempre presente. 5. Determinismo. 6. Costanti esportate e nominate. 7. Un errore di lettura fa fallire il batch: mai `data || []`.

## FILE

- **NUOVI:** `supabase/functions/_shared/program/checkinReading.ts` · `src/lib/program/__tests__/checkinReading.test.ts` · questo prompt-file.
- **MODIFICATI:** `weekAdherence.ts` (solo `weekDataLines` e il suo test) · `generate-batch-checkins/index.ts` · `CoachCheckinInbox.tsx` · `useWeeklyCheckins.ts` · `CoachCheckinInbox.render.test.ts` · `docs/ULTIMO-RITORNO.md` · `docs/HANDOFF.md` · `docs/auto-miglioramento.md`.
- **VIETATI (zero righe):** `supabase/migrations/**` · `releaseView.ts` · `acwr.ts` · `analyze-athlete-week/**` · `useCoachAlerts.ts` · `CoachHome.tsx` · `types.ts` · `sessionRpe.ts`.

## ACCEPTANCE

1. `weekReading`: 1/2 → `below` in giorni · 3/4 → `ok` · 0 → `none` · 5/7 → `ok` in percentuale · 2/3 → `below` · `attention` vero con `overThresholdSessions = 1` anche a gate `ok`.
2. `vetSummary` sul report vero della 24→30: boccia «4 sedute su 5 (50% compliance)» nominando il 5 · boccia «valuta uno scarico» · accetta «1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5» · accetta «Aderenza 1/2 (50%). RPE medio 8.5/10» · boccia «9/10».
3. `buildCheckinPrompt`: aderenza prima del carico; regole (1)(2)(3) testuali; (4) solo con gate `below`.
4. Render test: snapshot `{compliance_pct: 50, avg_rpe: "8.5", sessions_over_threshold: 2}` → assente «Indici di rischio elevati», assente «Valutare scarico», presente «Lettura della settimana» e «2 sedute oltre la soglia»; card RPE senza classe di errore; i tre test esistenti verdi.
5. Distinto: due `risk_alert` sullo stesso `workout_log_id` → 1.
6. Perimetro esatto; vietati a 0 righe.
7. Cinque cancelli: tsc 0 · vitest verde · eslint 64 · build · verify:css.

## PROVE ROSSE

R1 `avg_rpe >= 8` come condizione del blocco nel frontend → render test muore nominando «Indici di rischio elevati» · R2 `vetSummary` sempre `{ ok: true }` → il test del «4 su 5» muore · R3 aderenza DOPO il carico nel prompt → il test dell'ordine muore · R4 via il distinto → il test del doppione muore (2 invece di 1). Protocollo: occorrenza unica · `git diff --numstat` non vuoto · ripristino · `git diff --exit-code`.

## COSA RIMANDI INDIETRO

1. Ramo e commit · 2. Manifesto · 3. Acceptance col comando e l'output · 4. Prove rosse · 5. Non fatto · 6. Divergenze `file:riga` · 7. Resta a Nicolò (PR, merge, deploy v35 controllando che la versione salga, collaudo) · 8. Esito del rituale sulle `deny`.
