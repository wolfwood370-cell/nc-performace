# ULTIMO RITORNO — fetta checkin-che-non-giudica

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git.
> Fetta: `claude/checkin-che-non-giudica` · 2026-09-02 · base `origin/main` = `7111cfb` (la stessa
> della ricognizione di Cowork) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/checkin-che-non-giudica)
> — `gh` non installata e credenziali negate all'agente, come dal 20/08).

## 1. Ramo e commit

`claude/checkin-che-non-giudica`, da `7111cfb`, 2 commit di codice + 1 di review + il commit dei documenti (tip):

- `9068bf6` — **backend, coerente da solo**: il modulo puro `checkinReading.ts` (cancello
  dell'aderenza, conteggio distinto degli avvisi del watchdog, prompt con la lettura in testa,
  vaglio), la riga in più di `weekDataLines`, la edge `generate-batch-checkins` (quarta lettura,
  snapshot con `sessions_over_threshold`, `vetSummary` prima dell'upsert) e i due test di libreria.
- `89d9d60` — **frontend**: via `isAnomalous` e tutte le sue tinte, `weekReading(...).attention`
  guida filtro/contatore/tono, riquadro «Lettura della settimana», card RPE senza tinta, tipo del
  hook esteso, render test con l'acceptance 4.
- `32ee547` — **esito della passata indipendente**: il vaglio ferma anche «aumentare», la quarta
  parola che la regola (3) del prompt vieta (v. §6); test che lega le due liste.
- **(tip) commit dei documenti**: prompt-file conservato, questo file, `HANDOFF.md`, RETRO.

**Perché 2 commit di codice e non 3 (spec: modulo · edge · FE).** `weekDataLines` cambia firma
(secondo parametro obbligatorio): un commit «solo modulo» lascerebbe la edge a un argomento
per un commit, con `deno check` rosso su quel commit. Ogni commit di questo ramo compila da solo.

**PR: non aperta.** Motivo misurato: `gh` assente; la via API col token del credential manager è
negata dal classificatore dal 20/08 (memoria di progetto). Nicolò la apre dal link in testa.

## 2. Manifesto

**NUOVI:** `supabase/functions/_shared/program/checkinReading.ts` (307 righe) ·
`src/lib/program/__tests__/checkinReading.test.ts` (35 `it`) ·
`docs/prompts/2026-09-02-checkin-che-non-giudica.md` (il prompt, conservato).

**MODIFICATI:** `supabase/functions/_shared/program/weekAdherence.ts` (solo `weekDataLines`: la
riga «Sedute oltre la soglia d'attenzione: N» prima del carico, e il suo JSDoc) ·
`supabase/functions/generate-batch-checkins/index.ts` · `src/pages/coach/CoachCheckinInbox.tsx` ·
`src/hooks/useWeeklyCheckins.ts` (solo il tipo di `metrics_snapshot`) ·
`src/lib/program/__tests__/weekAdherence.test.ts` (+1 `it`, due chiamate col secondo argomento) ·
`src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts` (+2 `it`, fixture col conteggio) ·
`docs/ULTIMO-RITORNO.md` · `docs/HANDOFF.md` · `docs/auto-miglioramento.md`.

**VIETATI, misurati a zero righe di diff** (`git diff 7111cfb..HEAD -- <f> | wc -l`, uno per uno):
`supabase/migrations/**` · `src/lib/program/releaseView.ts` · `src/lib/math/acwr.ts` ·
`supabase/functions/analyze-athlete-week/**` · `src/hooks/useCoachAlerts.ts` ·
`src/pages/coach/CoachHome.tsx` · `src/integrations/supabase/types.ts` ·
`src/lib/effort/sessionRpe.ts` → `VIETATI_DIFF_LINES=0`.

## 3. Rituale d'apertura — le `deny` provate (prima riga di lavoro, prima di ogni modifica)

Repo di scarto in scratchpad (`prova-deny`: un commit, un file modificato, un untracked, uno
stash), comandi nella forma `cd <scarto> && <cmd>` (il matcher spezza i composti):

| comando                    | esito         |
| -------------------------- | ------------- |
| `git checkout .`           | **RIFIUTATO** |
| `git checkout -- *`        | **RIFIUTATO** |
| `git restore f.txt`        | **RIFIUTATO** |
| `git restore` (nudo)       | **RIFIUTATO** |
| `git clean -fd`            | **RIFIUTATO** |
| `git clean` (nudo)         | **RIFIUTATO** |
| `git stash drop`           | **RIFIUTATO** |
| `git stash drop stash@{0}` | **RIFIUTATO** |
| `git stash clear`          | **RIFIUTATO** |
| `gh pr merge 1`            | **RIFIUTATO** |

10 su 10 rifiutati (13 delle 16 `deny` ora provate, contando le 3 di ieri). I vicini passano:
`git status --short` · `git stash list` · `git log --oneline -1` · `git diff --stat` → il repo di
scarto è ancora intatto (` M f.txt`, `?? untracked.txt`, `stash@{0}` presente). `mcp__github__*`
non è provabile: il server GitHub non si è connesso in sessione (400 sull'header Authorization).

## 4. Acceptance — ogni criterio col suo comando e l'output

Tutti eseguiti nel worktree `.claude/worktrees/checkin-che-non-giudica` sul tip di codice `89d9d60` e
**ri-misurati sul tip finale `32ee547`** (dopo il fix della review: stessi numeri, v. fine del punto 7)
(baseline misurata sul tree pulito `7111cfb` PRIMA di toccare: tsc 0 · vitest 490/490 in 50 file ·
eslint ✖ 77 problems (64 errors, 13 warnings) · build ok · verify:css 245/245 · deno test
`_shared/program/` 13/13 · `deno check` della edge rosso SOLO per il preesistente `:368`).

**1. `weekReading`.** `npx vitest run src/lib/program/__tests__/checkinReading.test.ts` → 35/35.
1/2 → `below` e «1 giorno prescritto su 2 non onorato» · 3/4 → `ok` «aderenza 75% (3 su 4)» (4
prescritti = forma in percentuale, D2) · 3/3 → `ok` «3 giorni prescritti su 3 onorati» · 0
prescritti → `none` «nessun giorno prescritto questa settimana» (nessuna cifra) · 5/7 → `ok`
«aderenza 71% (5 su 7)» · 2/3 → `below` «1 giorno prescritto su 3 non onorato» · `attention` vero
con `overThresholdSessions = 1` a gate `ok`, falso con 0 · a metà settimana (1 di 3 onorato, 2 in
arrivo) → `ok` «…, 2 ancora in programma»; (0 di 4, 3 saltati, 1 in arrivo) → `below` (v. §8.3) ·
carico assente → `ua null`, «non misurato», mai «0 UA» · il report VERO della 24→30 → `below`,
«9,02 UA», `overThresholdSessions 2`, `attention true`.

**2. `vetSummary` sul report VERO della 24→30** (stesso file): **boccia** «Settimana conclusa: 4
sedute su 5 (50% compliance), 1 giorno saltato. Recupera il giorno perso.» con la ragione
`rapporto «4 sedute su 5» assente dai dati` (nomina il 5) · **boccia** «valuta uno scarico» con
`parola vietata «scarico»` · **accetta** «1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA,
RPE medio 8.5» · **accetta** «Aderenza 1/2 (50%). RPE medio 8.5/10» e anche «8,5/10» · **boccia**
«9/10» · **boccia** «24/08» (conservativo per disegno, §0.8) · **boccia** «DELOAD», «Alleggerire»,
«75%» · senza prescrizione **boccia** «1 su 1» e **accetta** «7.0/10».

**3. `buildCheckinPrompt`** (stesso file): l'indice del testo dell'aderenza è minore dell'indice
di «Carico», «UA» e «Volume totale»; ordine `- Aderenza:` < `- Sedute oltre la soglia
d'attenzione: 2` < `- Carico:` < `- RPE medio: 8.5`; le regole (1)(2)(3)(5) presenti
testualmente; la (4) presente con gate `below` e ASSENTE con gate `ok` (75%).

**4. Render test.** `npx vitest run src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts` →
5/5. Con `{compliance_pct 50, avg_rpe "8.5", sessions_over_threshold 2, …}` (snapshot DERIVATO da
`buildWeekReport`): assente «Indici di rischio elevati», assente «Valutare scarico», assente
«rischio» in ogni forma, presente «Lettura della settimana», «1 giorno prescritto su 2 non
onorato», «2 sedute oltre la soglia», «9,02 UA», badge «Attenzione»; la card «RPE medio» non
porta classi `destructive|error|warning`, la card «Compliance» porta `warning` (gate `below`).
Caso in più: 3/4 (75%) con 1 seduta oltre soglia → «Attenzione» acceso, compliance senza tinta. I
tre test preesistenti restano verdi (il terzo riformulato: l'assenza non accende l'attenzione e
la lettura dichiara «nessun giorno prescritto», senza riga delle sedute oltre soglia).

**5. Distinto.** Stesso file di test del modulo: due `risk_alert` sullo stesso `workout_log_id`
→ `sessions_over_threshold = 1`; due su id diversi → 2 (la misura viva del 25/08); id fuori
settimana o `workout_log_id` nullo → 0.

**6. Perimetro.** `git diff 7111cfb..HEAD --name-only` (tip di codice):

```
src/hooks/useWeeklyCheckins.ts
src/lib/program/__tests__/checkinReading.test.ts
src/lib/program/__tests__/weekAdherence.test.ts
src/pages/coach/CoachCheckinInbox.tsx
src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts
supabase/functions/_shared/program/checkinReading.ts
supabase/functions/_shared/program/weekAdherence.ts
supabase/functions/generate-batch-checkins/index.ts
```

Vietati: **0 righe** (§2). In più: `git diff 7111cfb..HEAD | grep -E "^\+.*\.(insert|update|delete|upsert)\("`
→ **exit 1, zero righe** (nessuna scrittura nuova; l'upsert resta quello preesistente) ·
`grep -E "srpe\s*>=?\s*9|>= 8|< 50"` sui tre file (modulo, FE, edge) al tip → **zero** (la soglia
del watchdog non è ricopiata, le due vecchie soglie del FE sono sparite) ·
`grep -E "Date\.now|new Date\(|Math\.random|fetch\("` sul modulo → **zero**.

**7. I cinque cancelli** (sul tip di codice `89d9d60`, tree pulito):

```
TSC_EXIT=0
VITEST: Test Files 51 passed (51) · Tests 528 passed (528)   [baseline 490/50: +35 modulo, +1 weekAdherence, +2 render]
ESLINT: ✖ 77 problems (64 errors, 13 warnings)              ← identico alla baseline (.eslint-baseline = 64)
BUILD_EXIT=0
VERIFYCSS: ✓ check 7: 243/243 classi con modificatore di alpha … · VERIFYCSS_EXIT=0
           ℹ 2 note (non bloccanti): bg-error-container/30 e /20 «non più usate nei sorgenti: voce da togliere da EXPECTED»
```

⚠️ **243/243 e non 245/245** (v. §8.6): la cifra è derivata N/N (numero di classi con alpha
DISTINTE nei sorgenti); le due `bg-error-container/*` vivevano SOLO nel verdetto rimosso. Il
cancello è verde; le due voci di `EXPECTED` sono un chip. In più (non richiesti): `npx deno test
--no-lock supabase/functions/_shared/program/` → 13 passed · `npx deno check --no-lock` sul modulo
nuovo → pulito · sulla edge → il SOLO preesistente `TS18046 'error' is of type 'unknown'` (`:368`,
identico su `main`) · suite Deno intera come in CI (`--allow-all --no-check`) → **496 passed**.

**Ri-misura sul tip finale `32ee547`** (dopo il fix della review, tree pulito salvo i documenti):

```
TSC_EXIT=0 · VITEST: 51 file, 528 passed (528) · ESLINT ✖ 77 problems (64 errors, 13 warnings) = baseline
BUILD_EXIT=0 · VERIFYCSS 243/243 (VERIFYCSS_EXIT=0) · deno test _shared/program 13/13 · deno check modulo pulito
```

## 5. Le quattro prove rosse (protocollo 29/08: quattro guardie, runner in scratchpad)

Per ognuna: occorrenza UNICA verificata prima di mutare · `git diff --numstat` non vuoto come prova
di applicazione · verdetto dall'exit code nudo di `npx vitest run <file>` · ripristino per copia dal
backup + confronto byte-identico + `git diff --exit-code` = 0 prima della successiva. Eseguite sul
codice COMMITTATO (`89d9d60`), tree pulito prima e dopo.

| #   | mutazione                                                                                                   | numstat | esito                     | il rosso nomina…                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | FE: torna un blocco «Indici di rischio elevati — Valutare scarico…» condizionato a `Number(m.avg_rpe) >= 8` | 3 0     | **ROSSO** (1 su 5 morto)  | `expected '…' not to contain 'Indici di rischio elevati'` (render test, acceptance 4)                                                     |
| R2  | `vetSummary` con `return { ok: true };` in testa                                                            | 1 0     | **ROSSO** (7 su 35 morti) | «boccia la frase viva del 30/08 nominando il 5 che non esiste: expected true to be false» (+ scarico, 9/10, 24/08, DELOAD, 75%, «1 su 1») |
| R3  | la riga `- Aderenza:` spostata DOPO `- Carico:` nel prompt                                                  | 2 2     | **ROSSO** (2 su 35 morti) | «l'aderenza deve venire prima di «Carico»: expected 606 to be less than 518» e l'ordine della lettura                                     |
| R4  | `return new Set(hits).size` → `return hits.length`                                                          | 1 1     | **ROSSO** (1 su 35 morto) | «il watchdog può duplicare su UPDATE: una seduta, un conteggio: expected 2 to be 1»                                                       |

**R5 (dopo la review, sul tip `32ee547`)** — via lo stem `aument` dal vaglio → **ROSSO**: «boccia
«deload», «alleggerire» e «aumentare», in qualunque maiuscola: Puoi aumentare il carico la
prossima settimana.: expected true to be false» (1 su 35 morto); R1-R4 rieseguite sullo stesso
tip: tutte ancora ROSSE. Dopo ognuna: `ripristino byte-identico: true · git diff --exit-code: 0`;
a fine runner `git status` pulito (salvo i documenti). Log completi in scratchpad
(`mutazioni/R1..R5.log` + `summary.json`).

## 6. Passata indipendente (workflow: 4 auditor di progetto + 3 refuter per rilievo, 22 agenti)

**Verdetti.** `supabase-rls-auditor`: «VERDE condizionato — una riserva major sul vaglio (stem
`aument` mancante) da chiudere prima del merge» · `aura-theme-auditor`: «VERDE — nessuna violazione
Aura introdotta dalla fetta; solo residui preesistenti minori» · `code-reviewer`: «ROSSO per una
riga: il vaglio lascia passare "aumentare il carico" — la parola che il prompt stesso vieta; tutto
il resto (scope, contratto additivo, gate strutturali, cancelli) è pulito» · `code-test-verifier`:
«VERDE — tsc 0, vitest 528/51 file, deno 13/13, TS18046 preesistente confermato identico su
main». 16 rilievi grezzi, 6 non-note, ciascuno passato a tre refuter (lenti repro · contratto ·
base) con mandato di CONFUTARE.

- 🔴 **CONFERMATO 3/3, due volte (rls + reviewer, con repro sul modulo vivo)**: `FORBIDDEN_STEMS`
  fermava `scaric/deload/allegger`, ma la regola (3) del prompt vieta QUATTRO parole («… o
  aumentare»): «Puoi aumentare il carico la prossima settimana» → `{ok: true}` → `ai_summary`,
  contro l'invariante 3 e CORE §0.11 — e nella direzione peggiore per §0.8: il vaglio fermava le
  raccomandazioni prudenti e lasciava passare l'unica che ABBASSA la cautela. Causa: ho copiato la
  lista di tre stem della spec invece di DERIVARLA dalla regola dettata al modello. **Chiuso in
  `32ee547`**: stem `aument` + test che lega le due liste (ognuna delle quattro parole della regola
  è bocciata) + prova rossa R5. Un refuter (lente contratto) aggiunge, a ragione, che l'invariante
  3 preso alla lettera non è raggiungibile per lista di stem («spingi di più», «incrementa»
  passano): il vaglio fa rispettare LESSICALMENTE la regola che il prompt detta; il coach legge e
  decide (§0.1). Dichiarato in §8.13.
- **CONFUTATI 3/3 (quattro)**: `text-white`/`bg-white/20` nel pill del filtro (Aura, preesistente
  byte-identico a `main:326,337`, fuori perimetro) · copy «zona ottimale» dello stato vuoto
  (preesistente identica, già in §7.5, D6 della spec) · «il vaglio non vede il conteggio delle
  sedute oltre soglia» (`vetSummary(text, report)` è la firma della spec; un «0 sedute oltre la
  soglia» col conteggio vero 2 passerebbe: ampliamento di perimetro, non difetto → chip) ·
  risposta IA vuota → `ai_summary: ""` (preesistente identico a `main:324`, stesso modello e
  stesso limite di token).
- **Note, non bloccanti, tutte dichiarate**: il `console.warn` del vaglio porta fino a tre parole
  del testo del modello nelle ragioni (mai body né nome) · `full_name` nel prompt (preesistente,
  censito il 28/08) · quarta lettura: scope e fail-loud verificati positivamente · ombre con RGB
  raw e `ShieldAlert` sul filtro (Aura, preesistenti) · token nuovi verificati (alpha-value,
  canali, scala coerente su badge/MiniStat/MetricCard/header/riquadro, zero residui) · **falso
  positivo per disegno**: «9.02 UA su 4 sedute concluse» viene bocciato (rapporto 9.02/4 assente
  dai dati) — il costo è la riga deterministica, mai un numero falso · l'attenzione legge
  `workouts_remaining` congelato al momento del batch (lo snapshot è una foto; il batch è
  manuale: una settimana persa DOPO l'ultimo «Analizza» resta «ok» fino al successivo) · gli
  avvisi `dismissed` dal coach contano lo stesso (si contano gli eventi del watchdog, non lo stato
  dell'inbox: archiviare un avviso non annulla la seduta) · il prefiltro `created_at ≥ lunedì − 1
giorno` perde un avviso solo con l'orologio del client avanti di più di due giorni.

## 7. Non fatto

1. **PR non aperta** (§1).
2. **Nessuna ri-misura del DB vivo**: l'MCP Supabase in sessione risponde `Unauthorized` (token
   assente): i due `risk_alert` del 25/08, lo snapshot della 24→30 e la versione v34 della edge
   sono la misura di Cowork dell'01/09, non mia.
3. **La riga 24→30 di `weekly_checkins` non viene ri-analizzata da «Analizza»** (§8.2): il batch
   calcola SOLO la settimana corrente. Il collaudo «snapshot live con `sessions_over_threshold: 2`
   sulla riga 24→30» non è raggiungibile senza un parametro di settimana (fuori perimetro).
4. **`fallbackSummaryText` non porta le sedute oltre soglia**: quando il vaglio boccia, la
   `ai_summary` è la riga deterministica preesistente (compliance, sedute, volume, RPE) — il
   conteggio resta nello snapshot e nel riquadro della UI. Scelta letterale della spec; estendere
   `weekAdherence.ts` oltre `weekDataLines` era vietato.
5. **La copy dello stato vuoto del filtro «Anomalie»** («Tutti gli atleti sono in zona
   ottimale», `CoachCheckinInbox.tsx`, `FeedEmpty`) resta com'era: è un giudizio senza dato, ma
   D6 dice che il testo del filtro resta — flaggato, non toccato.
6. **`deno check` della edge resta rosso per il preesistente `:368`** (`error.message` su
   `unknown`), identico su `main`, già censito il 28/08.

## 8. Divergenze — dove la spec diceva una cosa e il repo un'altra (vince la misura)

1. **La quarta lettura non può filtrare per gli id dei log DENTRO lo stesso `Promise.all`**:
   gli id esistono solo dopo la prima lettura. Implementato: prefiltro server `type = 'risk_alert'`
   - `athlete_id in (atleti del coach)` + `created_at ≥ mezzanotte di Roma del giorno PRIMA del
lunedì` + `limit(ALERTS_BATCH_CAP)` con fail-loud al cap come `program_releases`
     (`index.ts:192`, `:217-226`, `:244-250`); il criterio preciso — `workout_log_id` fra gli id dei log
     conclusi della settimana, DISTINTI — sta nel modulo puro (`countSessionsOverThreshold`,
     `checkinReading.ts:167-176`) e si applica per atleta (`index.ts:305-308`); il vaglio corre a `index.ts:366` prima dell'upsert. Il margine di un giorno: il watchdog
     scrive l'avviso nella stessa UPDATE che scrive `srpe` E `completed_at`
     (`useAthleteWorkoutHooks.ts:174-186`, orologio del client), quindi `created_at` ≥
     `completed_at` salvo skew: un giorno lo assorbe, l'intersezione tiene la precisione.
2. **Il batch calcola SEMPRE la settimana corrente di Roma** (`getItalianWeekBounds`,
   `index.ts:24-66`, nessun body/parametro): il 02/09 «Analizza» scrive la riga **31/08→06/09**.
   La riga 24→30 resta quella del 30/08 (senza `sessions_over_threshold`, con la vecchia
   `ai_summary`). L'ultimo miglio della spec va letto sulla settimana corrente o rinviato a una
   fetta col parametro di settimana.
3. **Il cancello a metà settimana**: la regola letterale (`below` se `compliancePct < 70`)
   accenderebbe «Attenzione» a un martedì con 1 di 3 onorato e 2 in arrivo (33% «attuale»), cioè
   a chi è in regola. Completata, non contraddetta: `below` se `compliancePct < 70` **e** i giorni
   rimanenti non possono più riportare sopra la soglia (`checkinReading.ts:106-115`); coincide
   con la spec ovunque `remaining = 0` (tutti i casi dell'acceptance). Test dedicato.
4. **Tredici punti di tinta, non dieci**: oltre ai censiti, `MiniStat` della compliance
   (`highlight={compliance < 50}`, ex `:472`) e dell'RPE (`Number(rpe) >= 8`, ex `:475`) nella
   feed card, e l'header del workspace che confrontava la stringa `bg-error-container/30`
   (ex `:603`). Riparata TUTTA la scala (Fragilità #6): badge, header, riquadro, MetricCard e
   MiniStat leggono la stessa `attention`/`gate`; nessun residuo `destructive|error-container|
critical|Rischio` nel file (grep = 0).
5. **L'insieme ammesso dal vaglio include i rapporti che la lettura stessa scrive** (es.
   «1 giorno prescritto su 3 non onorato» → (1,3), che NON è onorati/prescritti = (2,3)):
   altrimenti il modello che ricopia la riga del prompt verrebbe bocciato. Derivato dal
   `report` in modo deterministico (`allowedRatios`, `checkinReading.ts`), mai dal testo del
   modello. Il «4 su 5» resta bocciato.
6. **verify:css 243/243, non 245/245**: la cifra è derivata (classi con alpha DISTINTE nei
   sorgenti); `bg-error-container/30` e `/20` vivevano solo nel verdetto rimosso (misura del panel
   pre-piano: `verify-css-tokens.mjs:501-518`, `:588`). Verde per costruzione, due note non
   bloccanti → chip.
7. **Due commit di codice, non tre** (§1): ogni commit compila da solo.
8. **Il riquadro «Lettura della settimana» è reso con OGNI snapshot**, non solo con attenzione:
   una lettura che appare solo quando c'è attenzione tornerebbe a leggersi come allarme. Tono
   neutro senza attenzione, warning con. Decisione dichiarata nel piano.
9. **`weekReading(report, n)` conservata via supertipo strutturale** (`WeekReadingSource`): il
   FE non ha un `WeekReport`, ha lo snapshot → adattatore `readingSourceFromSnapshot` (chiavi
   assenti = assenza, mai zero). Test: dallo snapshot vero e dal report esce la STESSA lettura.
10. **`N su M` con fino a TRE parole in mezzo** (spec: «anche con una parola»): «1 giorno
    prescritto su 2» ne ha due. La cautela può solo salire.
11. **Righe legacy senza `sessions_over_threshold`** (scritte prima del deploy): il FE legge
    `?? 0` SOLO per non mostrare la riga delle sedute oltre soglia — nessun «0 sedute» a video.
12. **`Co-Authored-By`**: i commit portano il trailer di progetto (`Claude <noreply@anthropic.com>`,
    legge #9) E quello richiesto dall'harness della sessione (`Claude Fable 5.1`).
13. **Il vaglio è lessicale, l'invariante 3 è assoluto**: dopo la review il vaglio ferma le
    QUATTRO parole della regola (3) del prompt (`scaric`, `deload`, `allegger`, `aument`), non
    ogni raccomandazione sul carico che si possa formulare («spingi di più», «incrementa»,
    «ridurre» passano). Coprire l'intera classe con una lista di radici non è possibile; la
    regola e la lista vanno derivate da UNA costante (chip), e la mossa resta del coach (§0.1).

## 9. Resta a Nicolò (e a Cowork)

1. **PR** dal link in testa e **merge**.
2. **Deploy** di `generate-batch-checkins` (v34 → v35) **controllando che la versione salga**
   (`list_edge_functions` → v35 e `updated_at` di oggi; il 30/08 un «Deployed» con `No change
found` non aveva caricato nulla). Nessuna migration, nessun FE da deployare oltre alla
   pubblicazione ordinaria di `main`.
3. **Collaudo su `/coach/inbox`**: «Analizza» scrive la settimana **corrente** (§8.2). Sulla card
   della settimana corrente: riquadro «Lettura della settimana», nessun «Indici di rischio»,
   nessun «Valutare scarico», card RPE senza tinta. Sulla card **24→30** (riga vecchia): la
   lettura si ricava dallo snapshot esistente — «1 giorno prescritto su 2 non onorato» ·
   «Carico settimanale 9,02 UA» · «Attenzione» (gate below) — ma SENZA la riga «2 sedute oltre la
   soglia» (chiave assente nella riga scritta il 30/08) e con la vecchia `ai_summary` («4 sedute
   su 5»): non è un difetto del codice, è la riga di prima.
4. **Cowork, verifica live** dopo un «Analizza» post-deploy: `select week_start,
metrics_snapshot, ai_summary from weekly_checkins order by week_start desc` → sulla riga
   corrente `sessions_over_threshold` presente (0 se nessun avviso della settimana) e una
   `ai_summary` che passa `vetSummary` (o la riga deterministica, con il `console.warn`
   `[vetSummary] atleta …` nei log della function).
5. **Chip aperte in questa fetta**: parametro di settimana per il batch (§8.2) · le due voci
   `bg-error-container/*` da togliere da `EXPECTED` in `scripts/verify-css-tokens.mjs` (§8.6) ·
   copy dello stato vuoto «zona ottimale» (§7.5) · `fallbackSummaryText` senza le sedute oltre
   soglia (§7.4) · `error.message:368` preesistente e `full_name` nel prompt (già censiti il 28/08).
