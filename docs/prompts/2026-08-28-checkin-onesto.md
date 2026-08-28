# Task — checkin-onesto (C-15) · 2026-08-28

> Prompt-file della fetta, conservato come da spec (`Destinazione nel repo`).
> Fonte: spec-checkin-onesto-C-15-2026-08-28 (Cowork). Esito in `docs/ULTIMO-RITORNO.md`.

**Task:** far sì che il check-in settimanale del coach conti la settimana vera — le sedute prescritte dal documento di rilascio come denominatore, `completed_at` come numeratore — e che, quando non c'è nulla da contare, dichiari l'assenza invece di scrivere `0%`. NIENTE DDL, NIENTE migrazioni, NESSUNA scrittura su `workout_logs`.
**Data:** 2026-08-28 · **Strumento:** Claude Code · **Branch:** claude/checkin-onesto

🔴 **IL CRITERIO È IL CONTRATTO.** «Fatto» significa: per l'atleta `cfb31e82`, nella settimana 24→30 agosto 2026, il check-in dice **Compliance 50% · Sessioni 1/2 · Volume 9,02 UA · RPE medio 8,5**, senza il riquadro «Indici di rischio elevati»; e per una settimana **senza sedute prescritte** la chiave `compliance_pct` **non compare affatto** nello snapshot.

## LA MISURA (Cowork, 28/08, sul database VIVO e su `main` = `3bbf063`)

- `workout_logs`: 16 righe · `scheduled_date` NON NULL su 0 · `completed_at` su 6 · status `scheduled` su 0
- `workouts` / `program_workouts` / `program_days` / `program_weeks` / `program_plans`: 0 righe (catena vuota per cinque tabelle)
- `program_releases`: 4 righe, di cui 1 `schema_version=2` con `start_date` e `days[].date` — date prescritte 2026-08-22 · 23 · 24 · 25
- settimana corrente (Rome) 24/08→30/08 · prescritte in finestra: 2 · onorate: 1 · sedute completate in finestra: 4 (tutte il 25/08) · carico 9,02 UA · sRPE medio 8,5
- `weekly_checkins`: 0 righe · `pg_cron` non installato

## OBIETTIVO

1. Denominatore dell'aderenza dal **documento di rilascio più recente** (`program_releases`, `released_at` desc), non da `scheduled_date`.
2. Numeratore, volume e sforzo da `completed_at`.
3. Nessun giorno prescritto in finestra → aderenza **assente**, mai `0%`.
4. Nessuna riga creata, nessuna migrazione.

## ARCHITETTURA

Modulo PURO `supabase/functions/_shared/program/weekAdherence.ts` (niente `new Date()`, `Date.now`, `Math.random`, rete):

- `prescribedDatesInWindow(document, fromIso, toIso): string[]` — ordinate, senza duplicati; v2 = date del documento in finestra; v1 = stessa mappatura giorno-della-settimana di `sessionForDate` (semantica EREDITATA); documento illeggibile → `[]`.
- `weekAdherence({prescribed, completedDates})` → `{prescribedCount, honouredCount, offPlanCount, compliancePct: number | null}` — `null` ⇔ `prescribedCount === 0`.
- `compliancePct: null` diventa chiave **ASSENTE** nello snapshot (mai `null`, mai `0`).
- L'aderenza si conta sui **giorni prescritti onorati**, mai sulle sedute (4 sedute su 1 giorno ≠ 200%); le sedute restano dichiarate a parte (`sessions_completed`, `off_plan_sessions`).

## COSA CAMBIA

- **Edge `generate-batch-checkins`**: query su `completed_at` (confini del giorno di Roma, giorno civile via Intl e mai `toISOString`), `.eq("status","completed")`, lettura batch di `program_releases`; `missed`/`remaining` derivati dal documento vs `todayStr`; snapshot con `compliance_pct`/`workouts_scheduled` assenti a zero prescritti + `sessions_completed`/`off_plan_sessions` additivi; `workouts_completed` = giorni onorati; prompt del modello e ripiego non-IA senza `0%` né `(0/0)` sull'assenza.
- **FE**: via i due `?? 0` da `CoachCheckinInbox.tsx:480`/`:705` (assenza → «—»); tipo di `metrics_snapshot` in `useWeeklyCheckins.ts` allineato, tutto opzionale.

## INVARIANTI

Contratto request/response invariato · nessun INSERT/UPDATE/DDL · determinismo dei moduli puri · stringhe-utente in italiano · RLS invariata · IA in gabbia (CORE §0.11).

## FILE

- **NUOVI:** `supabase/functions/_shared/program/weekAdherence.ts` · `src/lib/program/__tests__/weekAdherence.test.ts` · `src/lib/program/__tests__/weekAdherence.parita.test.ts` · test di render sulla card dell'inbox
- **MODIFICATI:** `supabase/functions/generate-batch-checkins/index.ts` · `src/pages/coach/CoachCheckinInbox.tsx` · `src/hooks/useWeeklyCheckins.ts`
- **VIETATI (zero diff):** `releaseView.ts` · `coachRelease.ts` · `src/hooks/athlete/**` · `acwr.ts` · `sessionRpe.ts` · `analyze-athlete-week/**` · `AthleteContextPane.tsx` · `CoachCalendar.tsx` · `supabase/migrations/**` · `types.ts`

## ACCEPTANCE (sintesi — testo integrale nella spec)

1. Settimana vera (2 prescritti, 1 onorato, 50%, 4 sedute, 9,02, 8,5) · 2. mai oltre 100% · 3. assenza = chiave assente + prompt senza `0%`/`(0/0)` · 4. UI senza denominatore fabbricato · 5. parità fra le due porte su 28 giorni (v1 e v2) · 6. determinismo + grep · 7. nessuna scrittura · 8. i 5 cancelli (tsc 0 · vitest · eslint 64 · build · verify:css 245/245) · 9. perimetro esatto.

## PROVE ROSSE

R1 filtro su `scheduled_date` → rosso che nomina 4 vs 0 e 9,02 vs assente · R2 `: 0` al posto di `null` → muoiono il test dell'assenza-della-chiave E quello su `isAnomalous` · R3 mappatura v1 spostata di un giorno → il test di parità muore nominando la data.
