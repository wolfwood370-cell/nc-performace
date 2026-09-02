# ULTIMO RITORNO — coda checkin-numeri-dal-prompt

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git.
> Coda: `claude/checkin-numeri-dal-prompt` · 2026-09-02 · base `origin/main` = `ccf1450` (la stessa
> del collaudo di Cowork delle 15:03) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/checkin-numeri-dal-prompt)
> — `gh` non installata e credenziali negate all'agente, come dal 20/08).

## 1. Ramo e commit

`claude/checkin-numeri-dal-prompt`, da `ccf1450`: **un commit solo**, come da task, che porta il
modulo, il suo test, la edge e questo file. L'hash di quel commit non può stare dentro il file che
il commit contiene: è il tip del ramo (`git log --oneline -1 claude/checkin-numeri-dal-prompt`) ed è
riportato nel messaggio di chiusura della sessione e nella PR.

**PR: non aperta.** Motivo misurato: `gh` assente; la via API col token del credential manager è
negata dal classificatore dal 20/08 (memoria di progetto). Nicolò la apre dal link in testa.

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

## 9. Resta a Nicolò (e a Cowork)

1. **PR** dal link in testa e **merge**.
2. **Deploy** di `generate-batch-checkins` (v35 → v36) **controllando che la versione salga**
   (`list_edge_functions` → v36 e `updated_at` di oggi). Nessuna migration, nessun FE da deployare
   oltre alla pubblicazione ordinaria di `main`.
3. **Collaudo**: «Analizza» sulla settimana corrente. Atteso sulla riga 31/08→06/09: una
   `ai_summary` senza numeri estranei al prompt e con la data giusta se la cita («2 settembre»), o
   la riga deterministica con il `console.warn` `[vetSummary] atleta …: riepilogo IA scartato —
numero «…» assente dal prompt` nei log della function.
4. **Cowork, verifica live** dopo un «Analizza» post-deploy: `select week_start, ai_summary from
weekly_checkins order by week_start desc` → nessun numero della `ai_summary` corrente fuori dal
   prompt (i log della function dicono se il candidato è stato scartato e perché).
5. **Decisione aperta, non di questa coda:** se chiamare il modello su una settimana vuota (0
   prescritti, 0 sedute) abbia senso. Oggi la chiamata parte comunque; il vaglio garantisce i numeri,
   non l'utilità della frase.
6. **Chip aperte**: spezzare `checkinReading.ts` (428 righe) · parametro di settimana per il batch ·
   le due voci `bg-error-container/*` in `EXPECTED` di `verify-css-tokens.mjs` · `fallbackSummaryText`
   senza le sedute oltre soglia · `error.message` preesistente della edge · `full_name` nel prompt.
7. **RETRO non scritta in `docs/auto-miglioramento.md`**: fuori dal perimetro dei file della coda.
   La lezione di processo di oggi (le prove rosse su codice non committato: mettere in stage prima,
   così `git diff --exit-code` misura worktree-contro-index) è salvata nella memoria di progetto
   dell'agente; da promuovere nel Log alla prossima fetta che apre quel file.
