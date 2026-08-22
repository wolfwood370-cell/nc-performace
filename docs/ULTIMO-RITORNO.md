# ULTIMO RITORNO — fetta prontezza

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/prontezza` · 2026-08-22 · base `origin/main` = `783378a` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/prontezza) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/prontezza`, 6 commit da `783378a`: `a6c3591` (funzioni pure: `computeCheckinScore` +
`subjectiveReadinessToScore` + `sorenessScoreFromMap`; morta `calculateReadinessScore` rimossa) ·
`cc4ecd9` (il check-in scrive il punteggio calcolato, la costante 85 sparisce) · `8346a3d` (home:
un solo «oggi», assente ≠ zero, store ridotto a preferenze con migrate v1) · `ca0ba5b` (coach: una
conversione sola, 0-100 ovunque) · `d51e355` (chiusi i rilievi confermati della passata
indipendente: worst-3 polarity-aware + dedup migrate + docblock + trattino nel test) · il commit
dei documenti (questo file, HANDOFF, RETRO) è il tip del ramo — un file non può contenere l'hash
del commit che lo introduce.

## 2. Manifesto

**NUOVI:** `src/lib/math/__tests__/checkinScore.test.ts` (12 test: meccanismo, monotonia, casi a
mano 68/41, null, minimo, conversione coach, soreness) · `src/pages/athlete/__tests__/AthleteDashboard.readiness.render.test.ts`
(5 render test: assente ≠ zero con controllo positivo, riga-unica, blob legacy).

**MODIFICATI:** `src/lib/math/readinessMath.ts` (+3 funzioni pure; −`calculateReadinessScore`,
−`ReadinessInputs`, −1 import inutilizzato preesistente; `computeReadiness` INTATTA) ·
`src/pages/athlete/DailyCheckin.tsx` (score calcolato; via la scrittura parallela nello store) ·
`src/pages/athlete/AthleteDashboard.tsx` (card dalla riga di oggi; anello con trattino, mai 0;
«Da registrare»; worst-3 polarity-aware; trend-mock rimossi) · `src/stores/useAthleteReadinessStore.ts`
(sole preferenze; persist v1 + migrate con dedup/troncamento) · `src/hooks/useAthletesRiskOverview.ts`
(canonicalizzazione 0-100 PRIMA di assessRisks) · `src/pages/coach/AthleteDetail.tsx` (la locale
`calculateReadinessScore` passa dall'helper; +1 import) · **⚠ divergenze, file NON elencati dal
mandato (v. §8):** `src/pages/coach/CoachAthletes.tsx` (righe 356-361 + docblock: passthrough, era
la terza conversione) · `src/pages/coach/athlete-detail/OverviewTab.tsx` (1 riga: «Readiness / 100») ·
`docs/HANDOFF.md` · `docs/auto-miglioramento.md` · `docs/ULTIMO-RITORNO.md`.

**NEL PERIMETRO MA NON TOCCATI:** tutto `supabase/**` (zero file) · `src/integrations/supabase/types.ts` ·
la card della seduta e `sessionForDate` (i 12 render test preesistenti della home restano verdi) ·
`computeReadiness` · il contratto di `useSubmitReadinessMutation` (unica differenza: il valore di `score`).

## 3. Le due prove dei permessi (repo di scarto, PRIMA di ogni modifica)

- `git reset --hard` → **rifiutato dal permesso** («Permission to use Bash … has been denied»).
- `git stash drop` → **rifiutato dal permesso** (stesso esito).
- Vicini consentiti: `git status` → passa (stato del repo di scarto stampato) · `git stash list` → passa (vuoto). Entrambi senza prompt.

## 4. Acceptance — comando ed esito

1. **Prova rossa** — v. §5: 5 test rossi con la costante, verdi al ripristino.
2. **Casi a mano** — `npx vitest run src/lib/math/__tests__/checkinScore.test.ts`: sonno 8·stress 2·fatica 6·umore 6·digestione 8 → **68**; sonno 6·stress 8·fatica 6·umore 4·digestione assente → **41** (pesi su 90). Attesi scritti a mano nei commenti del test, mai ricalcolati dalla funzione.
3. **Nessuna risposta → null + controllo positivo** — stesso run: `computeCheckinScore({})` e tutte-null → `null`; render test: senza riga «Da registrare» e nessun `>0<`, con riga «Punteggio Prontezza 68 su 100» **nello stesso test**.
4. **Le due schermate concordano** — test: `subjectiveReadinessToScore(8) = 80 ≥ 40` (niente Low Recovery; prima OGNI 1-10 era `< 40`); grep: helper definito in `readinessMath.ts:283`, chiamato SOLO da `useAthletesRiskOverview.ts:245` e `AthleteDetail.tsx:2848`; `grep "subjective_readiness \* 10\|latestReadiness \* 10" src/` → **zero**.
5. **La home non mostra più metriche di ieri** — render test «lo store legacy non è più un oggi»: blob v0 (valori 11/08) seminato in localStorage + nessuna riga → la card non mostra né nomi-metrica né numeri; controllo positivo con la riga.
6. **Gate** — `npx tsc --noEmit -p tsconfig.app.json` **verde** · `npx vitest run` **323/323 su 25 file** (baseline 306/23 su `783378a`, confermata prima di toccare codice) · `npx eslint .` **81 errori = baseline** (13 warning). Riconfermati da un verificatore indipendente in contesto proprio.
7. **Perimetro** — `git diff origin/main..HEAD --stat`: 13 file = 8 del mandato + 2 divergenze dichiarate (§8) + 3 doc.

## 5. La prova rossa

Rimessa la costante al posto della formula (`return 68;` in testa a `computeCheckinScore`):
**5 test rossi** che nominano i punteggi — «expected 68 not to be 68» (due check-in diversi),
«expected 68 to be less than 68» (monotonia), «expected 68 to be **41**» (caso 01/08),
«expected 68 to be null», «expected 68 to be **6**» (minimo). Ripristinata la formula: 12/12 verdi.

## 6. Il minimo raggiungibile — misurato

**6** (non lo 0, e non l'11 stimato dal brief). Tutte le risposte al peggio coi valori pari del
cursore attuale — sonno 2, stress 10, fatica 10 (energia 1), umore 2, digestione 2 →
`(30+15+10)·(1/9) = 6,11 → 6`. Eseguito dal test «minimo raggiungibile», non stimato. Il massimo
resta 100. È il numero che l'atleta vedrà nel giorno peggiore.

## 7. Non fatto — col perché

- **Wipe al re-submit con form vergine** (rilievo confermato): il form semina solo `has_pain`; un
  re-submit sovrascrive risposte e score con null. PREESISTENTE (prima sovrascriveva le metriche e
  scriveva 85) e dichiarato fuori scope dalla fetta precedente nel file stesso; il contratto di
  questa fetta congela la mutazione salvo `score`. → chip «Seminare il form del check-in».
- **Superfici coach residue** (rilievi confermati, file fuori perimetro): 78 mock in
  `AthleteContextPane.tsx:164` (con didascalia «Dato mock» — attenuante, non assoluzione) · anello
  rosso-vuoto su score null in `AthleteViewerDialog.tsx:425` · `AthleteDetail` non legge mai
  `daily_readiness.score` (gauge su daily_metrics/formula base-70) · precedenza per FONTE non per
  data in `useAthletesRiskOverview.ts:243` (`daily_metrics` ha 0 righe live: impatto nullo oggi).
  → chip «Unificare la prontezza sulle superfici coach residue».
- **«Da registrare» mentre la query è in volo**: pending e assente coincidono (preesistente, anche
  nel Training Hub) — distinguere è una fetta di stato-di-caricamento.
- **Due «oggi» sulla stessa pagina** (UTC per la prontezza, locale per la seduta): la chiave UTC è
  coerente con la chiave di SCRITTURA del hook; unificare i calendari è un cambio di contratto.

## 8. Divergenze — vince la misura

1. **`CoachAthletes.tsx:356-360`** (file non elencato): TERZO punto di conversione non citato dal
   brief — ri-scalava `latestReadiness * 10`. Canonicalizzare nel hook senza toccarlo avrebbe
   mostrato 800/100 nel roster: toccato (passthrough + docblock) per raggiungere il criterio.
2. **`OverviewTab.tsx:141`** (file non elencato): l'etichetta del gauge della scheda atleta vive lì,
   non in `AthleteDetail.tsx` — 1 riga per nominare la scala («Readiness / 100»).
3. **Minimo = 6, non 11** (brief: «il minimo raggiungibile è 11»): la formula confermata dai due
   casi a mano dà 6 — misura in §6.
4. **Trend-su-ieri rimossi dalla card**: lo «ieri» era `MOCK_YESTERDAY` seminato nello store; tolto
   lo store-come-dato, il confronto non ha più una sorgente vera. Meglio nessuna freccia di una
   freccia contro un mock.
5. **Worst-3 polarity-aware** (rilievo di review sul MIO codice, chiuso in `d51e355`): l'ordinamento
   grezzo storico mostrava Stress 2 (rilassato) come prima preoccupazione. Decisione dichiarata:
   «peggiore» = peggior bontà normalizzata secondo le polarità già scritte nel repo — non è policy
   nuova, è la semantica che il repo dichiara (`INVERTED_CHECKIN_KEYS`, ex `POSITIVE_POLARITY`).
6. **Baseline vitest**: 306/23 confermata su `783378a` — nessuna divergenza.

## 9. Resta a Nicolò

- **Merge della PR** ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/prontezza)); post-merge: NULLA (publish FE del normale flusso, zero migration, zero edge).
- **Ratifica del dolore fuori dalla media**: `has_pain` e le zone NON contribuiscono al punteggio —
  un dolore vero mediato con quattro risposte buone uscirebbe tranquillo proprio il giorno in cui
  conta (CORE §0.7). Nulla a valle si aspetta il dolore dentro il punteggio (misurato: nessun
  consumatore di `score` lo deriva dal dolore).
- Le 2 chip aperte (superfici coach residue · seed del form check-in) e la presa d'atto del minimo 6.
