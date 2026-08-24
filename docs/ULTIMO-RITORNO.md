# ULTIMO RITORNO — fetta acwr-unico (C-09)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/acwr-unico` · 2026-08-24 · base `origin/main` = `ed4386f` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/acwr-unico) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/acwr-unico`, da `ed4386f`, 9 commit di codice + il commit dei documenti (tip del ramo):
`7761d95` (modulo unico `src/lib/math/acwr.ts` + 15 test unit) · `ea08b8d` (roster: adapter puro,
bandiere informative, Critico solo dal dolore, LoadLine nella card) · `1ea4354` (dettaglio atleta:
hook su sRPE, AcwrGauge = card-lente, OverviewTab descrittivo, −494 righe di mock in AthleteDetail) ·
`0fa4138` (dashboard: adapter puro, RULE 5 → riga info descrittiva — poi RIMOSSA in `f599746`, v. §8.11) ·
`46286ba` (calendario: chip «Seduta saltata», non più «Spike ACWR») · `bd750ba` (test di parità
cross-superficie) · `ae05cc4` (commenti stantii e vocabolario morto allineati) · `f599746` (chiusura
dei 3 rilievi della passata indipendente: finestra di fetch del modulo, dashboard fuori dal carico) ·
`831295a` (etichette Recente/Abituale dalle costanti).

## 2. Manifesto

**NUOVI:** `src/lib/math/acwr.ts` (modulo puro, unico proprietario di finestra · formula · dato
mancante · fasce descrittive · testi utente) · `src/lib/math/__tests__/acwr.test.ts` (15 test) ·
`src/hooks/__tests__/acwrSurfaces.parity.test.ts` (6 test, la prova del meccanismo).

**MODIFICATI (dichiarati dal prompt):** `src/hooks/useAthletesRiskOverview.ts` ·
`src/hooks/useAthleteAcwrData.ts` · `src/hooks/useCoachDashboardMetrics.ts` ·
`src/components/coach/analytics/AcwrGauge.tsx` · `src/pages/coach/AthleteDetail.tsx` ·
`src/pages/coach/athlete-detail/OverviewTab.tsx` · `src/components/coach/AthleteCard.tsx` ·
`src/pages/coach/CoachAthletes.tsx` · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file.

**MODIFICATI (fatti cadere dalla misura, dichiarati in §8):**
`src/components/coach/calendar/CalendarGrid.tsx` (chip «⚠️ Spike ACWR» su workout saltato) ·
`src/utils/translations.ts` (1 riga RIMOSSA: la voce morta `high_acwr` non ha più un tipo da etichettare) ·
`src/hooks/__tests__/athletesRiskOverview.pain.test.ts` e
`src/components/coach/__tests__/AthleteCard.acwr.render.test.ts` (la nuova firma di `assessRisks`
e la LoadLine li rompevano: adattati al contratto nuovo, invarianti dolore ri-asseriti) ·
`src/components/coach/__tests__/painMarkers.chip.render.test.ts` (2 righe: fixture usava il tipo
rimosso `high_injury_risk`).

**NEL PERIMETRO MA NON TOCCATI:** `supabase/**` · `src/integrations/supabase/types.ts` ·
`computeCheckinScore` / `readinessMath.ts` · `sessionForDate` · `localIsoDate` · le bandiere
`pain_reported` e `low_recovery` (condizioni, label, level identici — ri-asseriti dai test) ·
`package.json` (audit-gate non dovuto) · `CoachHome.tsx` (passthrough puro: zero riferimenti ACWR,
le stringhe pulite arrivano dall'hook) · `MasterCopilot.tsx:18` («Spiegami il concetto di ACWR» è
una domanda educativa, non un verdetto).

## 3. Le due prove dei permessi (repo di scarto in scratchpad, 1 commit)

- `git reset --hard HEAD` → **RIFIUTATO** («Permission to use Bash with command … has been denied») · `git rebase HEAD~1` → **RIFIUTATO** (stesso esito).
- Vicini passati: `git status -sb` → `## master` · `git log --oneline -1` → `cbfde72 commit di prova`.

## 4. IL CONTEGGIO DELLE IMPLEMENTAZIONI — 5 nel frontend, confermate; 0 oltre le cinque

Sweep indipendente su tutto `src/**` (grep acwr/acute/chronic/0.8/1.3/1.5/srpe/rpe_global/Foster,
superfici atleta incluse): **le implementazioni con calcolo erano esattamente le 5 del prompt**.
Per ognuna: cosa faceva del dato mancante e quale scala leggeva —

| #   | dove                                                            | scala letta                                            | dato mancante                                                                            | adesso                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `useAthletesRiskOverview.ts:105-139` + `assessRisks:141-202`    | `srpe ?? rpe_global ?? 0`                              | pesava **0**                                                                             | adapter `riskOverviewAcwr` → modulo; la query non seleziona più `rpe_global`                                                                                                                                                            |
| 2   | `useAthleteAcwrData.ts:60-124`                                  | **solo `rpe_global`** (srpe nemmeno in select)         | seduta **esclusa**; `<0.8` etichettato «Warning»                                         | select su `srpe`, adapter `athleteAcwrFromLogs` → modulo                                                                                                                                                                                |
| 3   | `AthleteDetail.tsx:643-661` (`getAcwrStatus`) + mock `:534-631` | ratio da `generateAcwrTrendData()` = **Math.random()** | — (inventava tutto)                                                                      | mock e monitor RIMOSSI (−494 righe); la tab rende `AcwrGauge` (stesso hook, stessa cache)                                                                                                                                               |
| 4   | `useCoachDashboardMetrics.ts:96-131, 345-359`                   | `srpe ?? rpe_global ?? 5`                              | inventava **RPE 5 × 30 min**; guardia a conteggio ≥7 log                                 | **RIMOSSA del tutto** (`f599746`): la dashboard non calcola né mostra più il carico — l'alert era irraggiungibile (CoachHome rende solo critical/warning) e il suo fetch (`created_at`, righe non completate) non combaciava col roster |
| 5   | `AcwrGauge.tsx:27-69`                                           | leggeva la #2                                          | `ratio ?? 0` + parole proprie («Alto Rischio», «Zona Attenzione», «servono 2 settimane») | card-lente: parole SOLO dal modulo, assenza col motivo                                                                                                                                                                                  |

Fuori dal conteggio, censite e dichiarate: **CalendarGrid.tsx:225** («⚠️ Spike ACWR» per un workout
saltato — verdetto finto su proxy, riparato in `46286ba`) · view DB `analytics_athlete_summary`
(`types.ts:3373-3386`, `current_acwr` server-side **mai letta dal FE** — nominale, non toccata) ·
le due migration server-side del prompt (fusione invertita `20260215193415…sql:52` e
`total_load_au` generata e mai letta `20260112003407…sql:63`) — **fuori perimetro, restano datate**.

## 5. Acceptance — comando e output

1. **Un solo proprietario.**
   `grep -rniE "(ratio|acwr|acute|chronic)[^\"']*(0\.8|1\.3|1\.5)|(0\.8|1\.3|1\.5)[^\"']*(ratio|acwr)" src --include="*.ts" --include="*.tsx" | grep -v "lib/math/acwr" | grep -v __tests__`
   → 7 righe, **nessuna è una soglia su un rapporto di carico**: 2 nutrition (`StrategyContent.tsx:428` carbs×0.8, `:646` kcal/7), 3 classi CSS (`gap-1.5`…), 2 commenti che DOCUMENTANO la rimozione (`useAthletesRiskOverview.ts:12`, `CoachAthletes.tsx` header). Media-7 su media-28: `grep -rnE "/ ?7[^0-9a-zA-Z]|/ ?28[^0-9a-zA-Z]" src/hooks src/pages/coach src/components/coach …` → solo `StrategyContent.tsx:646` (calorie).
2. **Prova rossa sul meccanismo** → §6, rosso che nomina le due superfici e i due valori.
3. **La finestra minima uccide il numero.** Test `acwrSurfaces.parity.test.ts`: «prima seduta utilizzabile a 15 giorni → nessuna superficie mostra un rapporto» (reason `storia_troppo_corta`, 15/28) ✓ · controllo positivo «con una seduta a 30 giorni → tutte lo mostrano, uguale» ✓ (output verboso nel run del 24/08, 6/6 verdi). Prova rossa dedicata in §6.
4. **La scala non si sostituisce.** Stesso file, per ENTRAMBE le superfici del carico (roster e dettaglio; la terza non mostra più il carico — §8.11): «aggiungere una seduta con solo rpe_global non cambia l'esito (prima cambiava in tre modi diversi)» ✓ (ratio/fascia identici, `senzaSrpe` +1) · «cambiare il rpe_global di una seduta già utilizzabile non muove il numero» ✓. In più il dettaglio non SELEZIONA nemmeno `rpe_global`: la sostituzione è impossibile per costruzione.
5. **Nessuna parola di rischio sopravvive.**
   `grep -rniE "Alto Rischio|ACWR spike|Spike ACWR|Zona Attenzione|High Injury|High Risk|Overload Warning|Detraining Risk|ACWR sovraccarico|ACWR detraining|ACWR nella norma|ACWR Elevato|injury risk" src --include="*.ts" --include="*.tsx" | grep -v __tests__`
   → **4 righe, tutte COMMENTI in domini non-carico** (`ProgrammedExerciseCard.tsx:202` e `fmsRiskEngine.ts:286` = FMS, `readinessMath.ts:329` = readiness/file vietato, `movement.ts:22` = screening): sulle superfici del carico, zero. In più il render-test della card asserisce `not.toMatch(PAROLE_DI_RISCHIO)` su tre stati.
6. **Gate.** `npx tsc --noEmit -p tsconfig.app.json` → verde · `npx vitest run` → **386 passed (386) su 35 file** (baseline misurata su `ed4386f` nel worktree pulito: **360/33 esatta**; +16 modulo, +6 parità, +3 card, +1 pain) · `npx eslint .` → **81 errori** (= baseline, non sopra) e 13 warning · `package.json` non toccato → audit-gate non dovuto. Ri-verificati anche da `code-test-verifier` in contesto proprio.
7. **Perimetro.** `git diff origin/main..HEAD --stat` → 16 file (997+/1068−, netto −71), SOLO i dichiarati del §2: gli extra sono i 5 fatti cadere dalla misura, ognuno con motivo in §8.

## 6. Le due prove rosse (rosso incollato, ripristino per copia + `cmp` byte-identico)

**A — meccanismo** (reintrodotta la fabbrica di carico `srpe??5`/`duration??1800` nell'adapter del
dettaglio; eseguita sul TIP del ramo, dopo la chiusura dei rilievi):

```
AssertionError: parità violata: roster (useAthletesRiskOverview.riskOverviewAcwr) → ratio 1.55 (sopra)
· dettaglio (useAthleteAcwrData.athleteAcwrFromLogs) → ratio 1.98 (sopra)
- "acuteLoad": 51,   + "acuteLoad": 80,
AssertionError: parità violata: roster → assenza (nessuna_seduta_utilizzabile, 0/28gg, 2 escluse)
· dettaglio → assenza (storia_troppo_corta, 15/28gg, 0 escluse)
AssertionError: dettaglio: il ratio è cambiato (1.98 → 2.41)
```

Ripristino: `cp` dal backup + `cmp` → `CMP_IDENTICO`, `vitest run` sul file → exit 0.

**B — finestra minima** (cancello del modulo indebolito: `daysCovered < 0`; eseguita sul TIP):

```
FAIL acwrSurfaces.parity.test.ts > prima seduta utilizzabile a 15 giorni → nessuna superficie mostra
un rapporto — AssertionError: expected true to be false
FAIL acwr.test.ts > prima seduta utilizzabile a 15 giorni → assenza 'storia troppo corta' 15/28
(+ altri 2 rossi della stessa famiglia nel test unit)
```

Ripristino: `cp` dal backup + `cmp` → `CMP_IDENTICO`, suite completa → exit 0 (386/386).

## 7. Ogni parola di rischio rimossa — dove stava, cosa c'è adesso

| dove stava                                   | parola                                                                                                                                                                                        | adesso                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useAthletesRiskOverview.ts:151/159/167`     | «High Injury Risk» · «Overload Warning» · «Detraining Risk» (+ details inglesi «injury risk zone»)                                                                                            | bandiere informative con le parole del modulo: «Carico recente sopra/sotto l'abituale», details = caveat                              |
| `useAthleteAcwrData.ts:117-123`              | «Optimal» · «Warning» (anche sotto 0.8) · «High Risk»                                                                                                                                         | il modulo: fascia descrittiva o assenza col motivo                                                                                    |
| `AcwrGauge.tsx:48-70,95`                     | «Alto Rischio» · «Zona Attenzione» · «Zona Ottimale» · zone success/warning/destructive · «Servono almeno 2 settimane di log» (conteggio inventato)                                           | numero + fascia + caveat con token neutri; assenza = `acwrAbsenceText` coi numeri veri                                                |
| `AthleteDetail.tsx:676-679,843-846,928-1052` | «Monitor Sicurezza Allenamento» · «metriche rischio infortunio» · «Alto Rischio/Moderato/Sicuro» (monotonia su mock) · «Sovraccarico (>600)» · «Overreaching» · legenda «Alto Rischio (>1.5)» | l'intera sezione mock è rimossa; la tab rende la card-lente                                                                           |
| `AthleteCard.tsx:382-407`                    | «ACWR spike» · «ACWR sovraccarico» · «ACWR detraining» · «ACWR nella norma» + Flame + amber/sky                                                                                               | LoadLine neutra: fascia del modulo + ratio + caveat, o assenza col motivo                                                             |
| `useCoachDashboardMetrics.ts:357`            | «High injury risk - acute load exceeds chronic capacity» (severity critical/warning)                                                                                                          | l'intera RULE 5 è RIMOSSA: la dashboard non mostra più il carico (e l'alert non alimenta più churnRisk né esclude da healthyAthletes) |
| `CalendarGrid.tsx:225`                       | «⚠️ Spike ACWR» (per un workout SALTATO)                                                                                                                                                      | «Seduta saltata»                                                                                                                      |
| `CoachAthletes.tsx:518`                      | «Nessun atleta presenta flag di rischio moderato o alto.»                                                                                                                                     | «Nessun atleta con dolore dichiarato o recupero basso.»                                                                               |
| `translations.ts:46` (mappa morta)           | «ACWR Elevato»                                                                                                                                                                                | `load_above_habitual: "Carico recente sopra l'abituale"`                                                                              |

Il caveat («Lente di consapevolezza, non una previsione di infortunio.») sta accanto al numero su
card roster, OverviewTab, AcwrGauge/tab avanzata e nel details dell'alert dashboard.

## 8. Non fatto / divergenze (file:riga)

1. **`CalendarGrid.tsx:225`** — fuori dal manifesto file del prompt, dentro il criterio («da nessuna parte compare una parola di rischio»): chip «⚠️ Spike ACWR» acceso da `status==='missed'` senza alcun calcolo. Riparato con la parola vera (`46286ba`).
2. **`translations.ts:46`** — voce morta (`ALERT_TYPE_LABELS` non ha importatori) che etichettava il tipo rinominato: 1 riga aggiornata. Le ALTRE voci morte della stessa mappa (`injury_risk: "Rischio Infortunio"`, `high_strain: "Strain Elevato"`) restano: mappa morta da rimuovere in una fetta di pulizia (chip flaggata).
3. **`high_injury_risk` non esiste più** (tipo rimosso da `RiskType`): era la gradazione >1.5, cioè una soglia che può vivere solo nel modulo — e il modulo, per mandato, non ce l'ha. L'informazione confluisce nella fascia «sopra l'abituale» (`overload_warning` informativa). Se Nicolò vuole tre bandiere distinte, è una parola sua, non una soglia mia.
4. **Fascia ≠ tre bandiere:** i confini descrittivi del modulo sono 0.8/1.3 — gli stessi numeri che le cinque implementazioni già usavano, ora senza parole di rischio e in UN posto solo (dichiarati `ACWR_BAND_LOW/HIGH` in `acwr.ts:26-27`).
5. **Finestra minima vs finestra di fetch — RISOLTA in `f599746` (rilievo n.1 della passata indipendente):** i fetch a 28 giorni-ISTANTE rendevano il cancello dei 28 giorni raggiungibile solo sul bordo, con esito dipendente dall'ora di mount e finestre diverse fra roster e dettaglio. Ora il bound lo emette il modulo — `acwrLookbackStartIso(todayIso)` = confine di GIORNO a `ACWR_LOOKBACK_DAYS` (42, `constants.ts:14`, la costante dichiarata per il lookback ACWR e finora importata da nessuno) — usato da entrambe le query del carico: le sedute a 29-42 giorni aprono la finestra minima in modo stabile e le due superfici fetchano lo stesso universo dato lo stesso «oggi». La regola dei 28 giorni resta nel modulo su `ACWR_BASELINE_DAYS`, come da mandato. Nessuna query nuova: è il bound di due query esistenti. Decisione: usare la costante nel ruolo che il suo commento dichiara non è ricrearla.
6. **Numero minimo di sedute: NON introdotto** (il vecchio `logs.length < 7` della dashboard è stato rimosso, non sostituito). Non mi è sembrato servisse: la finestra-data risponde a «esiste un carico abituale?».
7. **Convenzione-giorno, wrinkle preesistente e dichiarato:** «oggi» è il giorno LOCALE (stessa convenzione su tutte e tre le superfici → la parità regge), il giorno della seduta è il prefisso del timestamp come serializzato (UTC). A cavallo di mezzanotte una seduta può cadere nel giorno accanto: preesistente, uguale per tutte le superfici, da sanare in un'eventuale fetta-fusi (la storia DST di `cucitura` insegna a non toccarlo di sponda).
8. **Realtime rotto preesistente** (`useRealtimeAnalytics.ts:43` invalida `["athlete-acwr"]` ma la chiave è `["athlete-acwr-data"]`, che con `staleTime: Infinity` non si aggiorna mai live) — fuori perimetro, chip flaggata.
9. **Commenti con parole di rischio in domini non-carico** (FMS `fmsRiskEngine.ts:286`, `ProgrammedExerciseCard.tsx:202`; readiness `readinessMath.ts:329`; screening `movement.ts:22`): non toccati — file vietati o domini d'altra fetta.
10. **`generateMockProgressPhotos` (`AthleteDetail.tsx:~1174`)** — mock fotografico preesistente nella tab Foto, fuori dal dominio carico: non toccato, già nel backlog delle fonti-da-costruire.
11. **Passata indipendente (code-reviewer + aura-theme-auditor + code-test-verifier, contesto proprio): 3 rilievi confermati dal reviewer, TUTTI chiusi in `f599746`.** (1) finestra di fetch a istante → v. §8.5; (2) universo-dati della dashboard non allineabile (bound su `created_at`, righe non completate incluse, query condivisa con `pendingReviewCount`/`feedbackItems` quindi non modificabile) e (3) alert info irraggiungibile (`CoachHome.tsx:278` rende solo critical|warning) → risolti insieme RIMUOVENDO la RULE 5: la dashboard non è più una superficie del carico; le superfici della lente sono roster e dettaglio, e il contratto «stesso atleta, stesso oggi, stesso esito» vale su di loro. L'aura-theme-auditor ha trovato UN rilievo, preesistente su main e fuori dal diff (`bg-destructive/8` sul chip dolore, classe non generata): chip flaggata, non toccato qui (adiacente alla bandiera vietata).
12. **Divergenza residua fra roster e dettaglio, preesistente e chippata:** il dettaglio cachea per sempre (`staleTime: Infinity` + invalidazione realtime su chiave sbagliata, `useRealtimeAnalytics.ts:43`) — a dati nuovi il roster può aggiornarsi prima del dettaglio finché la chip realtime non viene chiusa. È un problema di FRESCHEZZA della cache, non del calcolo: a parità di dati l'esito è identico per costruzione.

## 9. Resta a Nicolò

- **Merge della PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/acwr-unico) coi 2 check obbligatori verdi.
- **L'ultimo miglio a occhio (post-merge, 2 schermate):** roster `/coach/athletes` e dettaglio atleta (tab Overview e tab Statistiche avanzate) per lo STESSO atleta → entrambe mostrano **l'assenza con lo stesso motivo** («Nessuna seduta con RPE di sessione registrato…», coi conteggi veri) — perché oggi nessuna riga ha `srpe`: è l'esito ratificato il 24/08, non un bug. Nessuna parola di rischio, nessuna fiamma, nessun «Critico» da carico (il «Critico» resta SOLO per dolore dichiarato).
- **La prossima fetta** (già nella spec §5): far raccogliere al prodotto l'sRPE nella sua colonna, sotto la sua scala — senza, questa lente resta legittimamente vuota. In quella sede: decidere l'allargamento del fetch (v. §8.5).
