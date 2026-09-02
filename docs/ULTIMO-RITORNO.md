# ULTIMO RITORNO — coda checkin-numeri-dal-prompt (due code, stesso ramo)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git.
> Coda: `claude/checkin-numeri-dal-prompt` · 2026-09-02 · base `origin/main` = `ccf1450` (la stessa
> del collaudo di Cowork delle 15:03) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/checkin-numeri-dal-prompt)
> — `gh` non installata e credenziali negate all'agente, come dal 20/08).
> **Seconda coda (sera del 02/09), in coda al primo commit:** la settimana VUOTA (zero giorni
> prescritti E zero sedute concluse) **non chiama il modello** — tutto ciò che la riguarda è marcato
> **(coda 2)** in §1, §2, §3, §4, §5, §6, §8, §9.

## 1. Ramo e commit

`claude/checkin-numeri-dal-prompt`, da `ccf1450`: **due commit**, uno per coda, entrambi «un commit
solo» come da task.

- `290ce2a` — **i numeri dal prompt**: il vaglio boccia ogni numero che il prompt non ha dato, e il
  prompt dà la data di oggi in lettere (modulo, test, edge, questo file).
- **(tip) (coda 2) la settimana vuota non chiama il modello**: `isEmptyWeek` + `emptyWeekText` nel
  modulo puro, la guardia nella edge PRIMA del `fetch` (che ora sta DENTRO il ramo non-vuoto), 7
  test (i 4 dell'acceptance, il legame strutturale con la edge, e i due vicini (b') (c') nati dalla
  passata), questo file. Come per il primo, l'hash non può stare dentro il file che il commit contiene:
  è il tip del ramo (`git log --oneline -1 claude/checkin-numeri-dal-prompt`) ed è riportato nel
  messaggio di chiusura della sessione e nella PR.

**PR: non aperta.** Motivo misurato: `gh` assente; la via API col token del credential manager è
negata dal classificatore dal 20/08 (memoria di progetto). Nicolò la apre dal link in testa: la PR
porta i due commit insieme.

## 2. Manifesto

**MODIFICATI** (`git diff ccf1450 --numstat`, tree pre-commit):

```
269	24	src/lib/program/__tests__/checkinReading.test.ts   (39 → 54 `it`, +15)
132	26	supabase/functions/_shared/program/checkinReading.ts (329 → 435 righe)
7	2	supabase/functions/generate-batch-checkins/index.ts  (todayIso · prompt.text · chooseSummary col prompt)
```

più `docs/ULTIMO-RITORNO.md` (questo file). Nessun file nuovo.

**VIETATI, misurati a zero righe di diff** (`git diff HEAD -- <f> | wc -l`, uno per uno):
`src/pages/coach/CoachCheckinInbox.tsx` · `supabase/functions/_shared/program/weekAdherence.ts` ·
`supabase/migrations/**` · `src/lib/program/releaseView.ts` · `src/lib/math/acwr.ts` ·
`supabase/functions/analyze-athlete-week/**` · `src/hooks/useCoachAlerts.ts` ·
`src/pages/coach/CoachHome.tsx` · `src/integrations/supabase/types.ts` ·
`src/lib/effort/sessionRpe.ts` → tutti **0**.

**Il perimetro della edge è quello dichiarato:** `git diff HEAD -- supabase/functions/generate-batch-checkins/index.ts`
= una riga `todayIso: todayStr,` nel contesto del prompt · `content: prompt` → `content: prompt.text` ·
`chooseSummary(…, report)` → `chooseSummary(…, report, prompt)`. Nessun commento toccato, nessuna
lettura nuova, l'upsert è quello di prima.

**(coda 2) MODIFICATI** (`git diff 290ce2a --numstat`, tree in stage):

```
146	3	src/lib/program/__tests__/checkinReading.test.ts   (54 → 61 `it`, +7; 729 → 872 righe)
33	2	supabase/functions/_shared/program/checkinReading.ts (435 → 466 righe)
68	53	supabase/functions/generate-batch-checkins/index.ts  (429 → 444; con -w, cioè senza la
                                                            re-indentazione del ramo: 16 1)
```

più `docs/ULTIMO-RITORNO.md` (questo file). Nessun file nuovo. **VIETATI ri-misurati a zero**
(`git diff --cached -- <f> | wc -l`, gli stessi dieci di sopra, `weekAdherence.ts` e
`CoachCheckinInbox.tsx` in testa) → tutti **0**: `fallbackSummaryText` non è stata toccata, resta la
strada della bocciatura per le settimane CON dati.

**(coda 2) Il perimetro della edge, con le righe** (`git diff --cached -w -U2`; il diff pieno è lo
stesso più la re-indentazione delle 40 righe del prompt e della chiamata, entrate nel ramo `else`):

```diff
@@ -12,4 +12,6 @@ import {
   chooseSummary,
   countSessionsOverThreshold,
+  emptyWeekText,
+  isEmptyWeek,
   weekReading,
 } from "../_shared/program/checkinReading.ts";
@@ -327,4 +329,17 @@
             };

+            let aiSummary: string;
+            if (isEmptyWeek(report)) {
+              // Nothing to describe — zero prescribed days in the window AND
+              // zero completed sessions, both read from the report: the model
+              // is NOT called. […]
+              console.info(
+                `[isEmptyWeek] atleta ${athlete.id}: settimana vuota: nessuna chiamata al modello`,
+              );
+              aiSummary = emptyWeekText();
+            } else {
               // The reading first, then the data, then the rules the model must
               // obey (no invented ratios, no load actions): checkinReading.ts.
@@ -357,5 +372,4 @@
               });

-            let aiSummary = "";
               if (aiResponse.ok) {
                 const aiData = await aiResponse.json();
@@ -384,4 +398,5 @@
                 aiSummary = fallbackSummaryText(report);
               }
+            }

             const { error: upsertError } = await supabase.from("weekly_checkins").upsert(
```

Righe nel file finale: import `index.ts:14-15` · `let aiSummary: string` `:331` · guardia
`if (isEmptyWeek(report))` `:332` · `console.info` `:339-341` · `aiSummary = emptyWeekText()` `:342`
· `} else {` `:343` · `buildCheckinPrompt` `:346` · **il `fetch` a OpenAI `:361`, dentro il ramo**
· chiusura del ramo `:400` · upsert `:402` invariato. Il prompt si costruisce SOLO nel ramo non-vuoto
(prima la guardia, poi il prompt): su una settimana vuota non esiste un prompt mai inviato.
`metricsSnapshot` (`:325-329`) e l'upsert (`:402-412`) sono byte-identici a `290ce2a`; la verifica di
`OPENAI_API_KEY` prima del loop (`:263-269`) resta com'era, anche se tutte le settimane fossero vuote.

## 3. Le firme scelte (punto 2 del task: «la forma la decidi tu, dichiarandola»)

```ts
export interface CheckinPrompt {
  text: string; // il testo che il modello riceve
  dataBlock: string; // il blocco-dati, VERBATIM dentro `text`: l'unica sorgente dei numeri ammessi
}
export function buildCheckinPrompt(reading, report, ctx: PromptContext): CheckinPrompt;
export function vetSummary(
  text,
  report,
  prompt: CheckinPrompt,
): { ok: true } | { ok: false; reasons };
export function chooseSummary(candidate, report, prompt: CheckinPrompt): { text; reason };
```

- **Perché l'oggetto e non il blocco nudo.** La edge fa `const prompt = buildCheckinPrompt(…)`, manda
  `prompt.text` e vaglia con `prompt`: la sorgente del vaglio è per costruzione il prompt inviato,
  non un secondo argomento che potrebbe venire da un'altra chiamata con un altro contesto.
- **Una funzione produce il blocco** (`promptDataBlock`, privata): contesto temporale (con la data
  in lettere) · le quattro righe della lettura · `weekDataLines` · calorie · `paceContext`.
  `buildCheckinPrompt` la interpola nel testo; il vaglio la legge da `prompt.dataBlock`. Il test che
  lega le due sorgenti: `p.text` contiene `p.dataBlock` per entrambi i prompt della fixture, e il
  blocco NON contiene «NOTA IMPORTANTE», «24 ore», «Regole:», «24 agosto», «280 caratteri» (che il
  testo completo invece porta).
- **`PromptContext.todayIso`** (civil `YYYY-MM-DD` di Roma, la edge lo aveva già come `todayStr`,
  `index.ts:66`): `dateInWords` (privata) lo scrive «2 settembre 2026» con la tabella `MONTHS_IT`
  dei dodici nomi; una stringa che non è una data di calendario (`isIsoDate` di `coachRelease.ts`)
  resta com'è: nessuna data inventata, e le sue cifre restano comunque nel blocco.
- **Il token numerico** `NUMBER_TOKEN = /\d+(?:[.,:]\d+)?/g` legge il candidato E il blocco (la stessa
  regex, come chiesto), con la forma canonica `canonicalNumber`: «06» ≡ «6», «8,5» ≡ «8.5» ≡ «8.50»,
  un orario («15:03») è uguale solo a sé stesso (v. §8.1), e così un token con tre cifre dopo il
  separatore («1.000», mille: `THOUSANDS_SHAPE`, v. §6 e §8.9). L'insieme ammesso è
  `allowedNumbers(prompt.dataBlock)` + `RPE_SCALE = 10`. Ogni numero estraneo dà UNA ragione
  «numero «3» assente dal prompt», dopo le ragioni dei controlli esistenti (rapporti, percentuali,
  parole vietate: restano tutti, e `allowedRatios` usa la stessa costante `RPE_SCALE`).
- **Costanti nuove:** `RPE_SCALE`, `MONTHS_IT`, `NUMBER_TOKEN` (private). Nessuna esportazione nuova
  oltre a `CheckinPrompt`; il frontend (`CoachCheckinInbox.tsx`) importa solo `overThresholdText`,
  `readingSourceFromSnapshot`, `weekReading`, `WeekReading`: firme invariate, zero righe di diff.

**(coda 2) Le due funzioni pure e la costante** (`checkinReading.ts:443-466`, sezione «the empty
week: nothing to describe, so the model is not called»; l'intestazione del modulo passa da «Three
things» a «Four things» con il punto 4, `:5` e `:26-31`):

```ts
export const EMPTY_WEEK_TEXT =
  "Nessun giorno prescritto e nessuna seduta conclusa questa settimana.";
export function isEmptyWeek(report: WeekReport): boolean {
  return report.adherence.prescribedCount === 0 && report.snapshot.sessions_completed === 0;
}
export function emptyWeekText(): string {
  return EMPTY_WEEK_TEXT;
}
```

- `isEmptyWeek` legge DUE campi del report e non ricalcola nulla: `adherence.prescribedCount` (i
  giorni prescritti nella finestra, dal documento) e `snapshot.sessions_completed` (le sedute
  concluse nella finestra, per giorno civile di Roma). `&&`, non `||`: «zero prescritti ma sedute
  fuori programma» e «prescritti ma zero sedute» NON sono vuote — lì i dati ci sono e il modello si
  chiama ancora (test (b) e (c), prova rossa M5).
- `emptyWeekText()` restituisce la costante: una frase sola, nessuna cifra, nessun «N/A» (test (d)).
  La costante è esportata perché il test la leghi alla edge per nome. La riga della bocciatura
  (`fallbackSummaryText`, due «N/A» sulla stessa settimana) non cambia: è la strada delle settimane
  CON dati e il test (d) lo inchioda (`fallbackSummaryText(reportVuoto)` contiene «N/A» e non è
  uguale alla frase).
- Il modulo resta puro: il test di determinismo (nessun `Date.now`, `new Date(`, `Math.random`,
  `fetch(`, `Intl.` nel sorgente) passa com'era. Sale a 466 righe (convenzione delle 300: la chip
  «spezzare `checkinReading.ts`» resta aperta, §9).

## 4. Acceptance — ogni criterio col suo comando e l'output

Tutto eseguito nel worktree `.claude/worktrees/checkin-numeri-dal-prompt` sul tree in stage (baseline
su `ccf1450` pulito, dalla fetta precedente: vitest 534/534 in 51 file · eslint 64 · verify:css 243/243 ·
deno `_shared/program` 13/13).

**1. `npx vitest run src/lib/program/__tests__/checkinReading.test.ts` → 54/54** (39 + 15 nuovi, di
cui 1 dalla passata: le migliaia, §6).
Fixture nuova: il report della settimana VUOTA (documento del 22/08 coi giorni 22–25/08, finestra
31/08→06/09, `todayIso` `2026-09-02`, zero log → 0 prescritti, `compliancePct null`, 0 sedute,
RPE `N/A`) e il contesto `mercoledì · 15:03 · 2026-08-31 → 2026-09-06` con il `weekPaceContext`
della settimana senza prescrizione.

- **(a)** la frase viva del 02/09 («Settimana 31 agosto 2026–6 settembre 2026: nessuna seduta
  programmata e sedute concluse: 0. A oggi mercoledì 3 settembre, …») → **bocciata**, ragioni
  esattamente `["numero «3» assente dal prompt"]`; e `chooseSummary` la manda sulla riga
  deterministica con quella ragione.
- **(b)** la stessa frase con «2 settembre» → **passa** (`{ ok: true }`): 31, 2026, 6 (da «06»),
  0 e 2 (da «2 settembre 2026») stanno nel prompt.
- **(c)** «Settimana conclusa: 4 sedute su 5 (50% compliance), 1 giorno saltato…» sul report vero
  della 24→30 → **resta bocciata**: `rapporto «4 sedute su 5» assente dai dati` + `numero «5»
assente dal prompt` (una sola ragione numerica: 4, 50 e 1 sono nel prompt).
- **(d)** «RPE medio 8.5/10» → **passa** (8.5 nel prompt, 10 = scala); anche «8,5/10» e «8,50».
- **(e)** il prompt costruito con `todayIso` `2026-09-02` contiene «mercoledì 2 settembre 2026» e la
  riga intera «Contesto temporale: Oggi è mercoledì 2 settembre 2026, ore 15:03 (fuso orario:
  Europe/Rome). Settimana dal 2026-08-31 al 2026-09-06.»; gennaio e dicembre dalla tabella
  («5 gennaio 2026», «31 dicembre 2026»); `2026-02-30` resta `2026-02-30`, nessun «undefined».
- In più: l'ora è un token solo («Analisi delle ore 15:03.» passa; «Alle 15 e al minuto 3.» boccia
  15 e 3) · un numero estraneo è nominato una volta anche se ricorre · «Ci sono ancora 2
  allenamenti in programma» del `paceContext` è un dato (il 2 passa su una settimana aperta) · sulla
  settimana vuota «24 agosto» e «280 caratteri» sono bocciati nominando 24 e 280 · il sorgente del
  modulo non contiene `Date.now`, `new Date(`, `Math.random`, `fetch(` **né `Intl.`**.

**2. Il test che lega le due sorgenti** (`CheckinPrompt — il blocco-dati che il vaglio legge compare
verbatim nel testo inviato`): per `promptVero` e `promptVuoto`, `p.dataBlock.length > 0` e
`p.text` contiene `p.dataBlock`. Prova rossa M3 in §5.

**3. Prove rosse:** le tre del task nelle due direzioni, più la quarta nata dalla passata, in §5 —
ogni ripristino byte-identico e `git diff --exit-code` = 0.

**4. I cinque cancelli** (tree in stage, prima del commit):

```
TSC_EXIT=0
VITEST: Test Files 51 passed (51) · Tests 549 passed (549)     [baseline 534: +15, tutti nel modulo]
ESLINT: files 456 · errors 64 · warnings 13                      ← 64 = .eslint-baseline
BUILD_EXIT=0 (vite: ✓ built in 8.96s)
VERIFYCSS: ✓ … 243 classi con modificatore di alpha tutte emesse e a canali · VERIFYCSS_EXIT=0
           ℹ 2 note preesistenti (bg-error-container/30 e /20 «da togliere da EXPECTED», chip aperta il 02/09)
DENO: npx deno test --no-lock supabase/functions/_shared/program/ → ok | 13 passed | 0 failed
      npx deno check --no-lock …/checkinReading.ts → pulito
      npx deno check --no-lock …/generate-batch-checkins/index.ts → SOLO il preesistente TS18046
        («'error' is of type 'unknown'», ora a :424; su origin/main è la stessa riga a :419)
      suite Deno intera come in CI (--allow-all --no-check supabase/functions/) → ok | 496 passed | 0 failed
```

**(coda 2) Acceptance — il blocco `isEmptyWeek — vuota se e solo se zero prescritti E zero sedute
concluse` (`checkinReading.test.ts:736-872`), `npx vitest run src/lib/program/__tests__/checkinReading.test.ts` → 61/61** (54 + 7):

- **(a)** `reportVuoto` — finestra 31/08→06/09, `DOC_V2` (il documento del 22/08 coi giorni 22–25/08:
  nessuno nella finestra; il task dice «solo il 24 e 25», sono i due che cadono nella finestra di
  (b), il documento è lo stesso della fixture viva), zero log → `prescribedCount 0`,
  `sessions_completed 0`, `isEmptyWeek` **true** ✓
- **(b)** stesso documento, finestra 24→30/08, zero log → `prescribedCount 2`, `sessions_completed 0`,
  `isEmptyWeek` **false** («prescritta ma non eseguita: i dati ci sono») ✓
- **(c)** finestra 31/08→06/09, un log `completed` il 02/09, nessun giorno prescritto →
  `prescribedCount 0`, `sessions_completed 1`, `offPlanCount 1`, `isEmptyWeek` **false** («fuori
  programma: la seduta è un dato») ✓
- **(d)** `emptyWeekText()` === `EMPTY_WEEK_TEXT` === «Nessun giorno prescritto e nessuna seduta
  conclusa questa settimana.», `not.toMatch(/\d/)`, `not.toContain("N/A")`; e
  `fallbackSummaryText(reportVuoto)` contiene «N/A» e NON è quella frase ✓
- **(b') (c') — i due vicini nati dalla passata (§6)**: la 24→30 vista dal lunedì 24 (2 prescritti
  tutti avanti, `missedCount 0`, `remainingCount 2`, 0 concluse) → **false**; una seduta conclusa il
  02/09 SENZA carico né sRPE (`totalVolume null`, `avgRpe "N/A"`, `sessions_completed 1`) → **false**
  («la seduta è un dato anche senza numero») ✓ — sono i due mutanti di `isEmptyWeek` che (a)(b)(c)
  lasciavano vivi (M9, M10 in §5).
- **(legame con la edge)** il test legge il sorgente di `index.ts` (commenti a riga intera tolti) e
  inchioda: la guardia `if (isEmptyWeek(report))` esiste · poi un `} else {` · poi l'URL di OpenAI
  DOPO l'`else` **e PRIMA della graffa che chiude l'intero if/else** (`fineIfElse`, contando le
  graffe: la `}` di «} else {» riapre) · fra guardia ed `else` stanno `aiSummary = emptyWeekText()`
  e «nessuna chiamata al modello», e NON stanno `await` né `openaiKey` · `openaiKey`, dalla guardia
  in poi, compare SOLO fra `else` e chiusura · **una sola** occorrenza di `fetch(` nel file ✓. È un
  test STRUTTURALE (la edge non ha test): lo dichiaro in §8, con ciò che non vede.

**(coda 2) I cinque cancelli** (tree in stage, prima del commit; ri-misurati dopo la passata):

```
TSC_EXIT=0
VITEST (file): 61 passed (61)   ·   VITEST (suite): Test Files 51 passed (51) · Tests 556 passed (556)   [549 → 556: +7, tutti nel modulo]
ESLINT: files 456 · errors 64 · warnings 14        ← 64 = .eslint-baseline; warning 13 → 14: il console.info
        (index.ts:339, no-console «Only these console methods are allowed: warn, error») — chiesto dal task, dichiarato in §8
BUILD_EXIT=0 (vite: ✓ built in 3.05s)
VERIFYCSS: ✓ … 243 classi con modificatore di alpha tutte emesse e a canali · VERIFYCSS_EXIT=0 (le 2 note preesistenti)
DENO: npx deno test --no-lock supabase/functions/_shared/program/ → ok | 13 passed | 0 failed
      npx deno check --no-lock …/checkinReading.ts → pulito
      npx deno check --no-lock …/generate-batch-checkins/index.ts → SOLO il preesistente TS18046 (ora a :439)
PRETTIER --check sui tre file → «All matched files use Prettier code style!»
```

## 5. Le prove rosse — tre del task più una della passata (protocollo 29/08: occorrenza unica · `git diff --numstat` · vitest sul file · ripristino per copia dal backup · byte-identico · `git diff --exit-code` = 0)

Eseguite sul tree in stage (le tre modifiche erano in index: `git diff --exit-code` misura
worktree-contro-index, 0 prima e dopo ogni mutazione). Runner e log in scratchpad
(`mutazioni/runner.py`, `M1..M3.log`, `summary.json`).

| #   | mutazione (una occorrenza)                                                                                                                            | numstat | esito                     | il rosso nomina…                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | via il blocco del controllo dei numeri da `vetSummary` (8 righe) → (a) **diventa verde**                                                              | 0 8     | **ROSSO** (6 su 53 morti) | «(a) boccia la frase viva del 02/09 nominando il «3»» · «chooseSummary manda la frase viva del 02/09 sulla riga deterministica» · «l'ora è un token solo» · «un numero estraneo è nominato una volta sola» · «24 e 280 restano fuori» · «(c) … nominando il 5» (la ragione numerica) |
| M2  | via la data dal contesto temporale (`Oggi è ${dayName} ${dateInWords(todayIso)}` → `Oggi è ${dayName}`)                                               | 1 1     | **ROSSO** (5 su 53 morti) | «(e) con todayIso 2026-09-02 il contesto temporale dice «mercoledì 2 settembre 2026»» · i dodici mesi · la todayIso non di calendario · «il blocco porta contesto temporale…» · **(b)**: senza la data il «2» di «2 settembre» non è più nel prompt                                  |
| M3  | blocco-dati alterato in un punto solo: nel testo `${dataBlock.replace("Sedute concluse: 0", "Sedute concluse: 3")}` (il modello legge 3, il vaglio 0) | 1 1     | **ROSSO** (1 su 54 morto) | «il blocco-dati compare verbatim nel prompt costruito con gli stessi argomenti» — esattamente il test 2, e solo quello                                                                                                                                                               |
| M4  | (dopo la passata) via la guardia delle migliaia: `THOUSANDS_SHAPE.test(token)` tolto da `canonicalNumber` → «1.000» torna a valere 1                  | 1 1     | **ROSSO** (1 su 54 morto) | ««1.000» è mille, non 1: tre cifre dopo il separatore restano letterali» — e solo quello                                                                                                                                                                                             |

Le quattro rieseguite insieme sul codice finale (54 test): M1 **7 su 54** morti (si aggiunge il
test delle migliaia, che dipende dal controllo), M2 5, M3 1, M4 1. Dopo ognuna: `ripristino
byte-identico: True · git diff --exit-code: 0`; a fine runner `git status --short` = le tre `M` in
stage, nient'altro.

**(coda 2) M5–M10 — la prova rossa del task, due sulla edge, e le tre nate dalla passata** (stesso
protocollo: tree in stage, `git add` PRIMA del runner così `git diff --exit-code` misura
worktree-contro-index; runner `mutazioni/runner.cjs` in scratchpad, log `M1..M6.log` e
`summary.json` lì — numerazione del runner M1–M6, qui M5–M10 per continuare la tabella; 61 test):

| #   | mutazione (una occorrenza)                                                                                                                                        | numstat | esito               | il rosso nomina…                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5  | `&&` → `\|\|` in `isEmptyWeek` (basta UNA delle due assenze) — **la prova del task**                                                                              | 1 1     | **ROSSO** (4 su 61) | **(b)** «2 prescritti, 0 concluse → false — prescritta ma non eseguita: i dati ci sono: expected true to be false» e **(c)** «fuori programma → false — la seduta è un dato: expected true to be false», più i due vicini (b') e (c'). (a) e (d) restano verdi, come devono. Prima di (b')(c') erano esattamente 2 su 59: (b) e (c) |
| M6  | **la guardia TOLTA dalla edge**: `index.ts` riportato com'era a `290ce2a` (il `fetch` parte sempre, `git show HEAD:… > index.ts`)                                 | 53 68   | **ROSSO** (1 su 61) | «la edge chiama il modello solo nel ramo non-vuoto … — la edge non chiede isEmptyWeek(report): expected -1 to be greater than -1»                                                                                                                                                                                                   |
| M7  | la settimana vuota prende la riga della bocciatura: `aiSummary = emptyWeekText();` → `aiSummary = fallbackSummaryText(report);`                                   | 1 1     | **ROSSO** (1 su 61) | lo stesso test: «expected 'if (isEmptyWeek(report)) {…' to contain 'aiSummary = emptyWeekText()'»                                                                                                                                                                                                                                   |
| M8  | **il mutante della passata**: ramo `else` svuotato (`aiSummary = ""`), prompt + `fetch` + gestione spostati DOPO la graffa che chiude l'if/else (chiamata sempre) | 55 54   | **ROSSO** (1 su 61) | lo stesso test: «il fetch a OpenAI deve stare DENTRO il ramo non-vuoto: expected 10949 to be less than 10341» — prima della stretta (§6) questo mutante passava                                                                                                                                                                     |
| M9  | `isEmptyWeek` legge il carico invece delle sedute: `snapshot.sessions_completed === 0` → `totalVolume === null`                                                   | 1 1     | **ROSSO** (1 su 61) | **(c')** «una seduta conclusa SENZA carico né sRPE è ancora una seduta → false — la seduta è un dato anche senza numero: expected true to be false» — e solo quello: (a)(b)(c) lo lasciavano vivo                                                                                                                                   |
| M10 | `isEmptyWeek` legge i saltati invece dei prescritti: `adherence.prescribedCount === 0` → `missedCount === 0`                                                      | 1 1     | **ROSSO** (1 su 61) | **(b')** «la 24→30/08 vista dal lunedì 24: 2 prescritti tutti avanti, 0 saltati, 0 concluse → false — prescritta e non ancora iniziata: c'è un programma: expected true to be false» — e solo quello                                                                                                                                |

Dopo ognuna: `ripristino byte-identico: true`; il `git diff --exit-code` della corsa intermedia era
1 SOLO perché questo file era ancora fuori dallo stage (` M docs/ULTIMO-RITORNO.md`, come i refuter
hanno notato); la corsa finale a stage completo, riportata sotto, chiude a 0. Output del runner,
testuale (corsa finale, tutto in stage):

```
=== M1 — isEmptyWeek: «&&» → «||» (basta UNA delle due assenze)
  numstat: 1	1	supabase/functions/_shared/program/checkinReading.ts
  vitest: 4 rossi su 61 (57 verdi)
    ✗ … (b) lo stesso documento sulla 24→30/08 senza log: 2 prescritti, 0 concluse → false
        AssertionError: prescritta ma non eseguita: i dati ci sono: expected true to be false
    ✗ … (c) sulla 31/08→06/09 una seduta conclusa il 02/09 fuori programma → false
        AssertionError: fuori programma: la seduta è un dato: expected true to be false
    ✗ … (b') la 24→30/08 vista dal lunedì 24: 2 prescritti tutti avanti, 0 saltati, 0 concluse → false
        AssertionError: prescritta e non ancora iniziata: c'è un programma: expected true to be false
    ✗ … (c') una seduta conclusa SENZA carico né sRPE è ancora una seduta → false
        AssertionError: la seduta è un dato anche senza numero: expected true to be false
=== M2 — la guardia TOLTA dalla edge: index.ts com'era a HEAD (il fetch parte sempre)
  numstat: 53	68	supabase/functions/generate-batch-checkins/index.ts
  vitest: 1 rossi su 61 (60 verdi)
    ✗ … la edge chiama il modello solo nel ramo non-vuoto: la guardia, poi «else», poi il fetch, poi la chiusura
        AssertionError: la edge non chiede isEmptyWeek(report): expected -1 to be greater than -1
=== M3 — la settimana vuota prende la riga della bocciatura (due «N/A») invece della frase sola
  numstat: 1	1	supabase/functions/generate-batch-checkins/index.ts
  vitest: 1 rossi su 61 (60 verdi)
    ✗ … la edge chiama il modello solo nel ramo non-vuoto …
        AssertionError: expected 'if (isEmptyWeek(report)) {…' to contain 'aiSummary = emptyWeekText()'
=== M4 — il ramo else svuotato e prompt+fetch+gestione spostati DOPO la chiusura dell'if/else (chiamata incondizionata) — il mutante della passata
  numstat: 55	54	supabase/functions/generate-batch-checkins/index.ts
  vitest: 1 rossi su 61 (60 verdi)
    ✗ … la edge chiama il modello solo nel ramo non-vuoto …
        AssertionError: il fetch a OpenAI deve stare DENTRO il ramo non-vuoto: expected 10949 to be less than 10341
=== M5 — isEmptyWeek legge il carico invece delle sedute: sessions_completed === 0 → totalVolume === null
  numstat: 1	1	supabase/functions/_shared/program/checkinReading.ts
  vitest: 1 rossi su 61 (60 verdi)
    ✗ … (c') una seduta conclusa SENZA carico né sRPE è ancora una seduta → false
        AssertionError: la seduta è un dato anche senza numero: expected true to be false
=== M6 — isEmptyWeek legge i saltati invece dei prescritti: prescribedCount === 0 → missedCount === 0
  numstat: 1	1	supabase/functions/_shared/program/checkinReading.ts
  vitest: 1 rossi su 61 (60 verdi)
    ✗ … (b') la 24→30/08 vista dal lunedì 24: 2 prescritti tutti avanti, 0 saltati, 0 concluse → false
        AssertionError: prescritta e non ancora iniziata: c'è un programma: expected true to be false
(dopo ognuna) ripristino byte-identico: true · git diff --exit-code: 0
```

**La guardia tolta dalla edge, dichiarata con le righe** (il task lo chiede perché la edge non ha
test; qui lo vede anche il test strutturale, M6): senza il ramo, `index.ts:331-343` non esistono, il
`fetch` di `:361` torna a `:346` fuori da ogni condizione e parte su ogni atleta, settimana vuota
compresa — è `290ce2a`, il comportamento che il collaudo delle 15:03 ha misurato.

## 6. Passata indipendente (workflow: 3 auditor di progetto + 3 refuter per rilievo + 4 cacciatori)

**Workflow: 52 agenti, 0 errori, 15 minuti.** Tre auditor di progetto (`supabase-rls-auditor`,
`code-reviewer`, `code-test-verifier`; `aura-theme-auditor` non richiesto: nessuna UI toccata) →
23 rilievi grezzi (7 + 5 + 11), i primi 5 per auditor passati ciascuno a 3 refuter (lenti repro ·
contratto · base) con mandato di CONFUTARE = 45 voti, 26 confutazioni; 4 cacciatori di numeri che
sfuggono (lettere/ordinali · formati · coincidenze · settimana piena), con l'obbligo di eseguire
ogni candidato via script Deno sul modulo del worktree.

**Verdetti.** rls: «VERDE condizionato — checklist §5 piena sulla edge (CORS/auth/role/ownership/
secret server-side, nessun ID da payload), nuova firma coerente (una sola sorgente per costruzione),
modulo deterministico verificato; restano due limiti del vaglio da dichiarare (numeri in lettere;
«1.000» ≡ «1» via Number())» · reviewer: «VERDE condizionato — il codice è committabile (scope
pulito, cancelli verdi verificati, nessun test indebolito, il vaglio si stringe soltanto); la
condizione è il commit dei documenti che aggiorna ULTIMO-RITORNO» · tests: «VERDE — tutti i
cancelli passano, copertura a-b-c-d-e completa, falsificabile, deterministica».

- 🔴 **CONFERMATO 3/3 e CHIUSO in questo stesso commit — «1.000» valeva 1.** `canonicalNumber`
  passava ogni token per `Number()`: «1.000» (mille, in italiano) diventava «1», e «Circa 1.000
  kcal al giorno.» PASSAVA sulla 24→30 (il 1 c'è: «1 giorno prescritto»), come «2.000 kcal» e
  «6.000 passi» sulla settimana vuota (dal «2 settembre» e dal «06»); `chooseSummary` salvava la
  frase inventata (`reason: null`). L'unico punto in cui la forma canonica ABBASSAVA la cautela
  (contro §0.8) e faceva entrare un numero non dato (contro §0.11). Causa: l'equivalenza dichiarata
  copriva «06» ≡ «6» e «8,5» ≡ «8.5» ≡ «8.50», non il separatore delle migliaia — effetto
  collaterale non dichiarato di `Number()`. Chiuso con `THOUSANDS_SHAPE = /^\d+[.,]\d{3}$/`: un
  token con tre cifre dopo il separatore resta LETTERALE, ammesso solo se il blocco lo scrive così
  com'è; test dedicato (+1, ««1.000» è mille, non 1») e prova rossa M4 (§5). Costo dichiarato: il
  dato vero «2500 kcal» riscritto dal modello «2.500 kcal» è bocciato (conservativo: la cautela
  sale, costa la riga deterministica).
- **Reggono come NOTE, non difetti, tutte dichiarate qui**: numeri in lettere fuori portata
  (§7.A) · le date ISO degli estremi mettono nell'insieme anno, mese e giorni (§7.B) · il
  controllo è di appartenenza, non di senso (§7) · `paceContext` è testo del chiamante e allarga
  l'insieme (è `weekPaceContext`, deterministico: «Ci sono ancora N allenamenti» è un dato) · il
  vaglio boccia numeri che il modello ha LETTO nel prompt ma fuori dal blocco («nelle ultime 24
  ore» della nota, «24 agosto» della regola, cifre nel nome dell'atleta): conservativo per
  disegno, il task voleva 24 e 280 fuori · «una sorgente sola» vale per i numeri; rapporti e
  percentuali restano derivati dal `report` (`allowedRatios`, come nella fetta) · il
  `console.warn` con le ragioni è preesistente e accettabile (§10.2: UUID e frammenti del
  candidato, mai body né nome) · 428+ righe (§8.5) · il ritorno era alle misure vecchie al momento
  della passata (questo file le aggiorna).
- **Confutati 3/3 o preesistenti identici a `main`**: `error.message` nel 500 (censito il 28/08) ·
  nessun rate limit sull'endpoint AI · gli 11 «rilievi» del test-verifier erano conferme di
  misura (548/548, 13/13, tsc 0, acceptance a-e coperta), letti come tali dai refuter.
- **Le quattro cacce** (Deno, fixture 1:1 del test): 44 · 65 · 54 · 59 candidati eseguiti. Le
  classi trovate sono in §7, comprese quelle che non avevo misurato da solo: orario con i secondi,
  `RATIO_SU` che ammette al massimo tre parole fra N e «su», «N di M», «sù» accentato, percentuali
  in lettere, cifre Unicode «a portata» di `\p{Nd}`. Nessuna toccata.

**(coda 2) Workflow: 31 agenti, 0 errori, 18,5 minuti** — 3 auditor di progetto (`supabase-rls-auditor`
· `code-reviewer` · `code-test-verifier`; niente UI toccata) → 9 rilievi (6 note + 2 bassi + 1 nota),
gli 8 passati ai refuter × 3 lenti (repro · contratto · base) = 24 voti; 4 cacciatori (classificazione
di `isEmptyWeek` · flusso della edge dopo la guardia · `ai_summary` nell'inbox · falsificabilità dei
test nuovi), con l'obbligo di eseguire via script Deno sul modulo del worktree.

**Verdetti.** rls: «VERDE — il diff non apre superficie: guardia pura che legge due numeri sempre
presenti, nessuna fetch nel ramo vuoto, log con solo UUID + testo fisso, chiave OpenAI mai loggata,
upsert byte-identico a main» (le sue 6 note: 4 conferme, 2 preesistenti fuori diff — body OpenAI e
oggetto errore nei `console.error` :396/:418 e `error.message` :439, identici a `main`; nessun rate
limit sull'endpoint AI, e la coda RIDUCE le chiamate) · reviewer: «VERDE — committabile: guardia
corretta (&&, campi letti dal report), fetch e prompt solo nel ramo non-vuoto, scope pulito, cancelli
riprodotti; due rilievi bassi, non bloccanti» · tests: «VERDE — tsc 0, vitest 554/554 e 59/59, deno
13/13, deno check pulito, prettier ok, vietati a zero; (a)(b)(c)(d) coperti con falsificabilità alta».

- 🔴 **CONFERMATO 3/3 e CHIUSO in questo stesso commit — il legame test↔edge era posizionale.** Il
  test strutturale verificava `indice(fetch) > indice(« } else {»)`: i tre refuter hanno costruito
  il mutante (prompt + fetch + gestione spostati DOPO la graffa che chiude l'if/else, ramo `else`
  svuotato: chiamata incondizionata, settimana vuota compresa), replicato le sette asserzioni e
  ottenuto tutto verde — uno anche col vitest reale in un mirror. Chiuso nel test: (1) `fineIfElse`
  conta le graffe dalla guardia e trova la `}` che chiude l'INTERO if/else (la `}` di «} else {»
  riapre, non chiude): il `fetch` deve stare fra l'`else` e quella chiusura; (2) i commenti a riga
  intera sono tolti prima di leggere (una guardia che vive solo in un commento non è una guardia);
  (3) `openaiKey`, dalla guardia in poi, può comparire SOLO dentro il ramo non-vuoto — vale anche per
  una chiamata che non si chiamasse `fetch`; (4) il ramo vuoto non contiene `await` né `openaiKey`.
  Prova rossa M8 (§5): il mutante della passata, ora ucciso.
- **Dal cacciatore della falsificabilità, due mutanti di `isEmptyWeek` che (a)(b)(c) non uccidevano
  e che sono difetti veri — CHIUSI con (b') e (c')**: `sessions_completed === 0` →
  `totalVolume === null` (una seduta conclusa SENZA carico né sRPE sarebbe «nessuna seduta») e
  `prescribedCount === 0` → `missedCount === 0` (una settimana non ancora iniziata, prescritti tutti
  avanti, sarebbe «nessun giorno prescritto»). Prove rosse M9 e M10 (§5). Il resto del suo rapporto:
  le asserzioni intermedie di (a)(b)(c) restano (guardia-fixture, costo zero); in (d) la riga col
  letterale esatto è il cancello e `not.toMatch(/\d/)` / `not.toContain("N/A")` la didascalia —
  lasciate; l'unico test onesto della edge (iniettare `callModel` e contare con uno spy) richiede un
  refactor oltre il «nient'altro»: chip.
- **Confutati 3/3 (note, non difetti)**: «settimana vuota CON `nutrition_logs`: la prosa perde le
  calorie» — dentro il contratto (vuota = i due contatori), `avg_daily_calories` resta nello
  snapshot (`:328`), nessun componente lo rendeva già prima, il coach le vede in
  `NutritionAdherenceCard`/`MetabolicChart`; dichiarata a Nicolò in §9 come nota di design ·
  «`docs/ULTIMO-RITORNO.md` modificato ma fuori dallo stage» — sequenza (il codice sta in stage per
  le prove rosse, il ritorno entra nello stesso commit), non difetto.
- **Le quattro cacce.** _Classificazione_ (32 scene via Deno contro il vero `buildWeekReport`):
  `isEmptyWeek` ≡ «prescritti 0 ∧ concluse 0» in tutte; **0 settimane classificate male fra quelle
  che la edge può costruire**; 3 divergenze A MONTE, in `weekAdherence.ts` (vietato) e non
  raggiungibili dalla edge — v. §7. _Flusso della edge_: 7 domande su 7 confermate (snapshot e
  upsert identici; prompt solo nell'`else`; log con UUID e testo fisso; chiave richiesta anche a
  settimane tutte vuote, com'era; un solo `fetch` e nessun percorso incrociato; l'errore di una vuota
  finisce nel catch per-atleta; con `-w` la logica cambia di 16 righe + 1). _Inbox_: nessun lettore
  parsa `ai_summary` (quattro usi, tutti testo piano); il tono nasce solo dallo snapshot → badge «Da
  rivedere», card a «—», nessun verdetto fabbricato; la frase è consegnabile all'atleta. _Test_: v.
  sopra.

## 7. Ciò che sfugge ancora (trovato, dichiarato, NON toccato — «dillo e non toccarlo»)

Misurato di prima mano con uno script Deno (`scratchpad/sfugge.ts`) che importa il modulo del
worktree e costruisce i due prompt della fixture, più i quattro cacciatori del workflow (§6). Il
vaglio verifica la **presenza** di un numero nel prompt, non il suo **senso**: questo è il limite
dichiarato di una regex sulle cifre, e nessuna delle righe qui sotto è stata toccata.

**A. Fuori dalla portata di una regex sulle cifre (per costruzione):**

- numeri **in lettere** («Tre sedute concluse», «Sedute concluse: zero») e **ordinali in lettere**
  («un terzo giorno», «il primo settembre») → PASSANO. Le regole (1) e (5) del prompt spingono il
  modello alle cifre per i numeri e alle lettere solo per il mese («2 settembre»): il giorno resta
  in cifre. Un modello che scrivesse «tre settembre» passerebbe.
- **numeri romani** («Il III giorno»), **frazioni Unicode** («½ carico»), **cifre non ASCII**
  (fullwidth «３ sedute») → PASSANO (`\d` è solo `[0-9]`).
- Gli **ordinali in cifre** invece sono fermati: «3° giorno» → `numero «3» assente dal prompt`.

**B. A portata della regex ma ammessi per coincidenza** (il numero STA nel blocco, in un altro senso):

- Le date ISO della settimana mettono nell'insieme, ogni settimana, l'anno, il mese e i due giorni
  degli estremi: sulla settimana vuota 31/08→06/09 passano «RPE medio 9» (RPE reale: N/A; il 9 è
  il mese «09»), «Hai concluso 6 sedute» (dal «06»), «8 giorni prescritti» (dal «08»), «31 sedute
  in programma», «Riposo dal 2 al 6». Sulla 24→30 passano «RPE 8» (dal mese «08»), «24 sedute»,
  «50 UA» (dal 50%), «Sedute: 9,02» (il carico), «Compliance 50,0%» (≡ 50), «1 su 2 onorati, 2
  saltati» (rapporto ammesso; il 2 è nel prompt). Il costo di ammettere i giorni in cifre per la
  regola (5) è questo, ed è per disegno; chiudere questa classe richiederebbe un vaglio semantico
  (numero + unità), fuori dalla coda.

**C. Ambiguità del token:**

- **Separatore delle migliaia**: CHIUSO in questo commit (§6): «1.000», «2.000», «1,000» restano
  letterali e sono bocciati se il blocco non li scrive così. Il rovescio, dichiarato: il dato vero
  «2500 kcal» riscritto «2.500 kcal» è bocciato (conservativo).
- **Orari scritti diversamente**: solo «15:03» è un token unico; «15.03», «15h03», «alle 15» sono
  bocciati (conservativo, la cautela sale). Un orario **con i secondi** («15:03:09») si spezza in
  «15:03» + «09»: il 9 passa per coincidenza sulla settimana di settembre (dal mese «09»), un
  altro secondo no. Il prompt non scrive mai i secondi.
- **Cifre nel nome dell'atleta** (`athleteName` non è nel blocco, come da task): un modello che
  ricopiasse «Atleta 2» verrebbe bocciato se il 2 non è un dato. Conservativo.

**D. Limiti PREESISTENTI dei controlli sui rapporti** (non della coda, identici a `main`, trovati
dalle cacce e non toccati): `RATIO_SU` ammette al massimo tre parole fra N e «su» («4 sedute
molto intense di forza su 2» sfugge al controllo dei rapporti; 4 e 2 sono nel prompt e il
controllo dei numeri non li ferma) · «N di M» e «N ogni M» non sono rapporti per `RATIO_SU` ·
«sù» accentato idem · percentuali in lettere («metà», «un terzo») fuori portata.

**Un campione di ciò che il vaglio FERMA** (per non far sembrare il colabrodo più largo di quel che
è): «Sedute concluse 0 su 0» (rapporto), «Aderenza 0%» (percentuale, con compliance assente), «2 su
2 onorati», «Aderenza al 30%», «2 sedute oltre soglia su 4» (rapporto), «Il 9 di settembre» sulla
24→30, «Sono le 15», «3° giorno», «1.000 kcal» sulla settimana vuota.

**(coda 2) Ciò che i cacciatori hanno trovato A MONTE della guardia — dichiarato, NON toccato** (tutto
in `weekAdherence.ts`, file vietato, e tutto preesistente: `isEmptyWeek` legge il report ed è
coerente con esso in tutte le 32 scene; nessuna raggiungibile dalla edge, che costruisce sempre
lunedì→domenica ISO e legge solo log `completed` con `completed_at`):

- **Documento v2 con un giorno senza esercizi** → `readPrescription` rifiuta l'INTERO documento
  (`weekAdherence.ts:102-104`, mirror byte-fedele della porta atleta) → 0 prescritti anche se altri
  giorni cadevano nella finestra → con zero log la settimana è «vuota». Non raggiungibile:
  `publish-program-block` valida prima dell'insert (un giorno senza esercizi è un errore); e prima
  della coda gli stessi zeri andavano al modello.
- **Finestra invertita** → `prescribedDatesInWindow` dà `[]` e `completedLogsInWindow` non trova
  nulla: settimana CON prescrizione e CON seduta letta come vuota. Non raggiungibile
  (`getItalianWeekBounds`).
- **`toIso` non di calendario** («2026-09-31»): `prescribedDatesInWindow` rifiuta la finestra,
  `completedLogsInWindow` la accetta (confronto di stringhe) — un'asimmetria di validazione fra le
  due funzioni del modulo. Non raggiungibile per la stessa ragione. Chip.
- **Un rilascio v1 non ha mai settimane vuote**: la semantica ereditata mappa il weekday sul giorno
  _i_ in OGNI settimana, per sempre → un atleta col solo v1 vecchio di mesi è «prescritti ma zero
  sedute» e va sempre al modello. Coerente col contratto; il risparmio della coda vale per v2 e per
  chi non ha rilasci.
- **Settimana vuota CON `nutrition_logs`**: le calorie non entrano in `isEmptyWeek` (il contratto
  sono i due contatori); prima il modello POTEVA citarle, ora la frase non le nomina; il dato resta
  nello snapshot (`avg_daily_calories`) e nelle viste nutrizionali del coach. Nota di design (§9).
- **`reading` (`index.ts:311`) è calcolato anche per la settimana vuota e lì non usato**: puro,
  gratuito; spostarlo nell'`else` allargherebbe il diff. Non toccato.
- **La frase arriva all'atleta verbatim** se il coach approva senza scrivere note
  (`useWeeklyCheckins.ts:135-150`: «Report Settimanale:\n\n» + `coach_notes || ai_summary`) — stesso
  canale della vecchia riga di bocciatura, nessuna regressione; il lessico è da coach («prescritto»,
  la riga di bocciatura dice «programmata»). E nel pannello la stessa assenza è detta due volte
  (la «Lettura della settimana» sopra la bozza) — preesistente.

## 8. Divergenze — dove il task diceva una cosa e la misura un'altra (vince la misura, dichiarata)

1. **L'ora è un token solo** (`\d+(?:[.,:]\d+)?`, non la regex nuda `\d+(?:[.,]\d+)?` del task). Con
   la regex nuda «ore 15:03» del contesto temporale regala «15» e «03» → «3»: la frase viva del
   02/09, scritta proprio alle 15:03, sarebbe PASSATA al vaglio, e il test (a) sarebbe stato verde
   solo perché la fixture usava un altro orario. Il candidato viene letto con la STESSA regex (come
   chiesto): «ore 15:03» scritto intero passa, «alle 15» no. Test dedicato.
2. **Confronto in forma canonica, non testuale**: il task dà per buono che «6» stia nel prompt, ma
   il prompt scrive «2026-09-06»: «06» ≡ «6» (e «8,5» ≡ «8.5» ≡ «8.50»). Corollario onesto: il mese
   «09» ammette un «9» e «08» un «8» in ogni settimana di settembre/agosto — v. §7.
3. **La NOTA IMPORTANTE si sposta di un paragrafo** (sopra il contesto temporale, prima stava sotto):
   porta «24 ore», che non è un dato, e il blocco-dati deve essere contiguo per comparire verbatim
   nel testo. Testo della nota byte-identico; «Niente altro cambia nel testo del prompt» vale per il
   resto (regole, istruzione finale, righe della lettura e dei dati invariate).
4. **`CheckinPrompt` al posto della stringa**: `buildCheckinPrompt` non restituisce più una `string`.
   Il frontend non la usa (zero righe di diff nell'inbox); la edge cambia due espressioni.
5. **Il modulo sale a 428 righe** (convenzione delle 300, legge #10): la coda poteva toccare solo
   `checkinReading.ts`, non aprire file nuovi. Da spezzare in una fetta dedicata (chip).
6. **Un commit solo, quindi l'hash non è nel file** (§1).
7. **Il `todayIso` della fixture della 24→30 è `2026-08-30`** (domenica, come il `dayName` del
   contesto), non il `2026-08-28` della finestra del report: il contesto temporale del prompt di
   test dice «domenica 30 agosto 2026», coerente con «La settimana di allenamento è conclusa».
8. **`Co-Authored-By`**: il commit porta il trailer di progetto (`Claude <noreply@anthropic.com>`,
   legge #9) E quello richiesto dall'harness della sessione (`Claude Fable 5.1`).
9. **Tre cifre dopo il separatore = token letterale** (`THOUSANDS_SHAPE`, esito della passata,
   §6). Non era nel task, ma è un difetto della coda e non «un altro numero che sfugge»: la mia
   forma canonica faceva entrare «1.000» come 1, cioè un numero che il prompt non aveva dato, in
   direzione opposta a §0.8. Le classi fuori portata della regex (lettere, ordinali, romani,
   Unicode) restano invece dichiarate e NON toccate, come chiesto.
10. **(coda 2) Un test in più, STRUTTURALE, che lega la edge** («la edge chiama il modello solo nel
    ramo non-vuoto»): il task chiede la costante esportata «così il test la lega alla edge» e chiede
    di dichiarare la guardia tolta «perché la edge non ha test». Il test legge il sorgente di
    `index.ts` (commenti a riga intera tolti) e inchioda: guardia → `} else {` → URL di OpenAI →
    graffa che chiude l'intero if/else (contata sulle graffe: `fineIfElse`); la frase e il log fra
    guardia ed `else`, senza `await` né `openaiKey`; `openaiKey` dalla guardia in poi SOLO nel ramo
    non-vuoto; un solo `fetch(` nel file. È testo, non esecuzione — ciò che ancora NON vede: un
    client che non usi né `fetch` né `openaiKey` (una SDK con la chiave letta altrove), una
    riassegnazione di `aiSummary` fra la chiusura e l'upsert, un `if/else` annidato nel ramo vuoto
    prima del primo `} else {`; e si rompe a un rinomino legittimo della variabile, dell'URL o a un
    ternario al posto dell'if/else — costo dichiarato, come per il test di purezza del modulo che già
    legge il sorgente. L'unico test onesto — iniettare `callModel` nel passo «descrivi la settimana»
    e contare con uno spy — è un refactor della edge oltre il «nient'altro»: chip (§9). È ciò che
    uccide M6, M7 e M8.
11. **(coda 2) `console.info` = un warning eslint in più (13 → 14)**: `no-console` ammette solo
    `warn` ed `error` (`eslint.config.js`); il task chiede `console.info` con l'`athlete.id`, e una
    settimana vuota non è un avviso. La regola è a `warn` per scelta scritta (`eslint.config.js:45-51`:
    «FLAGS new console.log/info — as a warning, not a gate») e la CI conta solo gli errori (legge #10
    «convenzione, non cancello»): dichiarato, non zittito con un `eslint-disable`.
12. **(coda 2) Il prompt si costruisce DENTRO il ramo non-vuoto**, non prima della guardia: il task
    dice «prima della chiamata a OpenAI», e la guardia sta prima del prompt E della chiamata. Un
    prompt costruito e mai inviato sarebbe lavoro morto e un `dataBlock` senza vaglio; il costo è la
    re-indentazione di ~40 righe nel diff (con `-w`: 16 1).
13. **(coda 2) La fixture di (a) e (b) è `DOC_V2` (giorni 22–25/08)**, il documento della misura
    viva, non un documento «con giorni solo il 24 e 25/08»: nella finestra 24→30 cadono solo quei
    due, e il conteggio è lo stesso (2 prescritti); nella 31/08→06/09 non ne cade nessuno.
14. **(coda 2) La firma prende `WeekReport` intero** (`isEmptyWeek(report: WeekReport)`), non un
    `Pick`: la edge passa il report che ha, e i due campi letti stanno nel commento e nel test. Nessun
    ricalcolo, come chiesto: né `prescribedDatesInWindow` né `completedLogsInWindow` sono chiamate.

## 9. Resta a Nicolò (e a Cowork)

1. **PR** dal link in testa (porta i DUE commit) e **merge**.
2. **Deploy** di `generate-batch-checkins` (v35 → v36, una volta sola per le due code)
   **controllando che la versione salga** (`list_edge_functions` → v36 e `updated_at` di oggi).
   Nessuna migration, nessun FE da deployare oltre alla pubblicazione ordinaria di `main`.
3. **Collaudo**: «Analizza» sulla settimana corrente. **(coda 2)** Atteso sulla riga 31/08→06/09,
   se resta vuota (nessun giorno prescritto, nessuna seduta conclusa): `ai_summary` = «Nessun giorno
   prescritto e nessuna seduta conclusa questa settimana.», NESSUNA richiesta a OpenAI per quell'atleta
   e nei log della function la riga `[isEmptyWeek] atleta <uuid>: settimana vuota: nessuna chiamata
al modello`; snapshot identico a prima (`sessions_completed 0`, `avg_rpe "N/A"`, senza
   `compliance_pct`). Se invece l'atleta ha concluso una seduta nel frattempo (fuori programma), il
   modello VIENE chiamato e vale l'atteso della prima coda: `ai_summary` senza numeri estranei al
   prompt e con la data giusta se la cita («2 settembre»), o la riga deterministica con il
   `console.warn` `[vetSummary] atleta …: riepilogo IA scartato — numero «…» assente dal prompt`.
4. **Cowork, verifica live** dopo un «Analizza» post-deploy: `select week_start, ai_summary from
weekly_checkins order by week_start desc` → sulla riga vuota la frase sola (nessuna cifra, nessun
   «N/A»); sulle altre nessun numero fuori dal prompt (i log della function dicono se il candidato è
   stato scartato e perché, e per quali atleti il modello non è stato chiamato).
5. **Decisione «chiamare il modello su una settimana vuota?»: CHIUSA dalla coda 2** — no. Il caso
   è deciso da `isEmptyWeek` (zero prescritti E zero sedute concluse); i due vicini (zero prescritti
   con sedute fuori programma · prescritti senza sedute) vanno ancora al modello, perché lì i dati ci
   sono. Il testo della settimana vuota è la costante `EMPTY_WEEK_TEXT`: cambiarlo è un edit di una
   riga nel modulo puro, coperto dal test (d).
6. **Chip aperte**: spezzare `checkinReading.ts` (ora 466 righe) · parametro di settimana per il batch ·
   le due voci `bg-error-container/*` in `EXPECTED` di `verify-css-tokens.mjs` · `fallbackSummaryText`
   senza le sedute oltre soglia · `error.message` preesistente della edge · `full_name` nel prompt ·
   **(coda 2)** il warning `no-console` del `console.info` (se si vuole a zero: o la regola ammette
   `info` nelle edge, o il log passa a `console.warn` — decisione sulla regola, non sul codice) ·
   **(coda 2)** il passo «descrivi la settimana» della edge estratto in `_shared/program/` con
   `callModel` iniettabile, così il «non chiama il modello» si prova con uno spy e il test
   strutturale sul sorgente può sparire · **(coda 2)** l'asimmetria di validazione della finestra fra
   `prescribedDatesInWindow` e `completedLogsInWindow` (§7) · **(coda 2, nota di design)** la
   settimana vuota con sole calorie registrate: oggi la frase non le nomina, il dato resta nello
   snapshot — se le calorie devono entrare nella decisione o nella frase, è una regola nuova, non un
   difetto.
7. **RETRO non scritta in `docs/auto-miglioramento.md`**: fuori dal perimetro dei file della coda.
   La lezione di processo di oggi (le prove rosse su codice non committato: mettere in stage prima,
   così `git diff --exit-code` misura worktree-contro-index) è salvata nella memoria di progetto
   dell'agente; da promuovere nel Log alla prossima fetta che apre quel file.
