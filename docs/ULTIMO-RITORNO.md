# ULTIMO RITORNO — fetta cucitura

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/cucitura` · 2026-08-23 · base `origin/main` = `7be4480` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/cucitura) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/cucitura`, da `7be4480`: `d77bb5a` (quinta bandiera `pain_reported` + test a tre esiti) ·
`1e72f5d` (tre stati nel profilo salute: `null` non diventa `false`, card «Dolore — ultimo
check-in») · `edd1bc3` (i due test di confine + jsdom devDependency) · `30501fa` (rilievi
confermati della passata indipendente chiusi: vettore a valori tutti distinti + JSDoc orfano +
commento di `PainReport`) · il commit dei documenti (questo file, HANDOFF, RETRO) è il tip del
ramo — un file non può contenere l'hash del commit che lo introduce.

## 2. Manifesto

**NUOVI:** `src/hooks/__tests__/athletesRiskOverview.pain.test.ts` (11 test: tre atleti/tre esiti
nominativi, data della riga, riskLevel, ordine delle bandiere) ·
`src/hooks/__tests__/athleteHealthProfile.pain.test.ts` (6 test: null sopravvive al mapping,
etichette a tre stati) · `src/pages/athlete/__tests__/DailyCheckin.boundary.test.ts` (4 test:
confine form→mutation, jsdom per-file, payload campo per campo) ·
`src/lib/program/__tests__/localIsoDate.timezone.test.ts` (3 test: TZ fissato nel test + guardia).

**MODIFICATI:** `src/hooks/useAthletesRiskOverview.ts` (select `has_pain`; `assessRisks` esportata
col 3° parametro; `latestPainReport` + `PainReport`; quinta bandiera con data; le 4 esistenti
INTATTE) · `src/hooks/useAthleteHealthProfile.ts` (`hasPain: boolean | null`; `toRecentPainReports`
e `painAnswerLabel` esportate; `=== true` sulle derivazioni) ·
`src/components/coach/athlete/HealthProfileTab.tsx` (card a tre stati con data; `painAnswerTone`;
`formatReportDate` condiviso) · `vitest.config.ts` (SOLO il commento, perché continui a dire il
vero) · **⚠ divergenza, file non elencati dal mandato (v. §8):** `package.json` +
`package-lock.json` (devDependency `jsdom`, lockfile solo additivo +526/−0) · `docs/HANDOFF.md` ·
`docs/auto-miglioramento.md` · `docs/ULTIMO-RITORNO.md`.

**NEL PERIMETRO MA NON TOCCATI:** tutto `supabase/**` (zero file) · `src/integrations/supabase/types.ts` ·
le funzioni pure — `git diff origin/main -- src/lib/math/readinessMath.ts src/lib/program/releaseView.ts src/pages/athlete/DailyCheckin.tsx` = **0 righe** (`computeCheckinScore`, `sessionForDate`,
`localIsoDate` intatte) · `src/pages/coach/CoachAthletes.tsx` e `src/components/coach/AthleteCard.tsx`
(il cablaggio dormiente dei chip «Fastidi segnalati» — regex italiana a `CoachAthletes.tsx:363-367`
su label finora inglesi — si accende DA SOLO con la label «Dolore dichiarato (gg/mm)») · card della
seduta, selettore del giorno, `HeroWorkoutCard`.

## 3. Le due prove dei permessi (repo di scarto, PRIMA di ogni modifica)

- `git checkout -- f.txt` → **rifiutato dal permesso** («Permission to use Bash … has been denied»), anche dentro il composto `cd … && git checkout -- f.txt`.
- `git clean -fd` → **rifiutato dal permesso** (stesso esito).
- Vicini consentiti: `git status` → passa (` M f.txt` stampato) · `git checkout -b prova` → passa («Switched to a new branch 'prova'»). Entrambi senza prompt.

## 4. Acceptance — comando ed esito

1. **Prova rossa sul meccanismo** — mutante «bandiera per chiunque abbia una riga»
   (`pain?.hasPain === true` → `pain !== null` in `assessRisks`), poi
   `npx vitest run src/hooks/__tests__/athletesRiskOverview.pain.test.ts`: **4 rossi** che nominano
   gli atleti — `× atleta 'Luca' — has_pain=false … AssertionError: atleta Luca: numero bandiere
dolore: expected 1 to be +0` · `× atleta 'Gaia' — has_pain=null …: expected 1 to be +0` · più il
   caso 20-giorni-fa e il controllo optimal. Marco (true) resta verde: la bandiera sempre accesa
   NON passa. Ripristino per copia + `cmp` byte-identico → **11/11 verdi**.
2. **`null` non è `false`** — `npx vitest run src/hooks/__tests__/athleteHealthProfile.pain.test.ts`
   (6/6 verdi): `toRecentPainReports([{has_pain: null}])` → `hasPain` **null** e `not.toBe(false)`;
   `painAnswerLabel(null)` = «Non risposto» e `not.toMatch(/nessun dolore/i)`; controllo positivo
   nello stesso file: `painAnswerLabel(false)` = «Nessun dolore dichiarato». Lato bandiera: il caso
   Gaia (null → nessuna bandiera) nel test del punto 1.
3. **La data giusta** — stesso run del punto 1: «dolore su una riga di 20 giorni fa e non
   sull'ultima ⇒ nessuna bandiera» **verde**; «dolore sull'ultima riga ⇒ bandiera con la data di
   QUELLA riga»: label contiene `22/08` e NON contiene `02/08` **verde**; in più l'ordine
   dell'array è indifferente (vince la data, non la posizione).
4. **Mutazione A uccisa** — v. §5: rosso `expected 53 to be 68`, verde 3/3 al ripristino.
5. **Mutazione B uccisa** — v. §5: rossi `'2026-08-21' to be '2026-08-22'` e
   `'2026-01-14' to be '2026-01-15'` col TZ fissato dal test, verde 3/3 al ripristino.
6. **`riskLevel` cambia davvero** — test «ACWR nella norma + dolore dichiarato ⇒ non più optimal»:
   `assessRisks(1.0, 80, {hasPain: true, …})` → `"high"`; controllo: con `false` o `null` resta
   `"optimal"`. **Verde.**
7. **Gate** — `npx tsc --noEmit -p tsconfig.app.json` **verde** · `npx vitest run` **347/347 su 29
   file** (baseline attesa 323/25: la differenza è ESATTAMENTE i 24 test nuovi in 4 file di questa
   fetta) · `npx eslint .` **81 errori = baseline** (13 warning). Passata indipendente:
   code-test-verifier riconferma i tre numeri in contesto proprio · aura-theme-auditor: card nuova
   **conforme** (token semantici shadcn legittimi nel namespace Coach, zero hex raw, pattern
   identico a `fmsScoreTone`/`STATUS_CONFIG`) · code-reviewer sul diff: **committabile, zero
   bloccanti**, 1 rilievo MEDIO + 3 bassi confermati e chiusi in `30501fa` — il MEDIO: il vettore
   dell'11/08 ha `fatigue_score` = `stress_level` = 4 (assi entrambi invertiti), quindi lo scambio
   fatigue/stress era invisibile mentre il commento prometteva copertura su qualunque coppia; ora
   un secondo caso a valori tutti distinti (6·4·2·8·10, atteso 73) uccide ogni scambio — provato:
   con fatigue/stress scambiati `expected 74 to be 73`, rosso, poi verde al ripristino. Il
   reviewer ha inoltre provato che il test del fuso NON è auto-referenziale (`TZ=UTC npx vitest
run …` → 3/3 verdi: la `beforeAll` morde anche partendo dalle condizioni della CI), che il chip
   painMarkers produce esattamente UN elemento (nessun doppione, `deriveState` → "critical"
   corretto), e che il `null` arriva davvero al DB (payload esplicito, il DEFAULT false non
   scatta). Il quarto rilievo (badge verde «Nessun dolore dichiarato» raggiungibile sotto un
   semaforo rosso quando il dolore era ieri) è DICHIARATO e tenuto: la card è datata e intitolata
   «ultimo check-in», il semaforo copre la finestra di 7 giorni — due affermazioni entrambe vere.
8. **Perimetro** — `git diff origin/main..HEAD --stat`: 6 modificati + 4 test nuovi + 3 doc, tutti
   dichiarati nel §2 — nessun file fuori manifesto.

## 5. Le due mutazioni — il rosso incollato, il verde al ripristino

**A · Cablaggio** — scambio alla chiamata `DailyCheckin.tsx:337`
(`computeCheckinScore({ sleep, fatigue, stress: mood, mood: stress, digestion })`), funzione pura intatta:

```
× le risposte del form arrivano alla mutazione col punteggio giusto (68, non 53)
AssertionError: score composito: expected 53 to be 68 // Object.is equality
Tests  1 failed | 2 passed (3)
```

Il 68→53 combacia col check-in reale dell'11/08 citato dal brief — e il vettore del test è stato
derivato dall'aritmetica dei pesi, non letto dal DB: due strade indipendenti, stesso numero.
Ripristino per copia + `cmp` byte-identico → **3/3 verdi**.

**B · Fuso** — `localIsoDate` mutata in `return d.toISOString().slice(0, 10);`:

```
× 00:30 del 22/08 a Roma è il 22 — il gemello UTC direbbe ancora il 21
AssertionError: expected '2026-08-21' to be '2026-08-22' // Object.is equality
× ora solare: 00:30 del 15/01 a Roma (offset -60) è il 15, non il 14
AssertionError: expected '2026-01-14' to be '2026-01-15' // Object.is equality
Tests  2 failed | 1 passed (3)
```

Il TZ è fissato DENTRO il test (`process.env.TZ = "Europe/Rome"`, ripristinato in `afterAll`) con
una **guardia** che resta verde solo se l'ambiente lo onora (offset −120 estivo / −60 invernale,
provato a monte con `node -e` su questa macchina Windows). Ripristino per copia + `cmp` → **3/3
verdi**. Mai `git checkout --` per annullare le mutazioni: backup in scratchpad e ripristino per
copia (la deny della fetta precedente morde, ed è giusto così).

## 6. La superficie delle bandiere — misurata (il brief ne suppone una)

**Le superfici che rendono "rischio" sono 10, in 4 famiglie dati indipendenti** — ma la famiglia
`RiskFlag` (quella delle 5 bandiere) arriva alla UI in **UN solo punto**: il roster.
`CoachAthletes.tsx:160` (bucket del filtro «Rehab / Limitati» via `riskLevel`) e
`CoachAthletes.tsx:363-367` (le **label** filtrate con regex italiana → chip «Fastidi segnalati» in
`AthleteCard.tsx:379-396`). Le label delle 4 bandiere storiche sono inglesi → il chip era MORTO da
sempre; la quinta, italiana e con la data, lo accende senza toccare quei file. **`optimal` non ha
resa testuale nel roster** (le parole simili — `"Optimized"`/`"Zona ottimale"` in
`AthleteCard.tsx:250,310` — sono guidate da `readinessScore`+`weeklyAdherence`, e il roster non
passa mai `weeklyAdherence`): per questo l'acceptance 6 è misurata su `riskLevel`, che è ciò che
ordina il roster e riempie i bucket. Le altre famiglie (NON toccate, dati paralleli):
B `UrgentAlert` (`useCoachDashboardMetrics.ts` → CoachHome Triage `:481-564` e Centrale Operativa
`:421-476`) · C status ACWR (`useAthleteAcwrData.ts` → AcwrGauge, OverviewTab, AthleteDetail,
AthleteContextPane) · D FMS (`ProgrammedExerciseCard`, `FmsContraindicationBadge`,
`HealthProfileTab`).

## 7. Non fatto — col perché

- **Terzo confine della stessa famiglia, nominato e non riparato** (regola del brief):
  `OverviewTab.tsx:388-390` («All Clear» / «Nessun infortunio o dolore segnalato») legge SOLO la
  tabella `injuries` via `getPainStatus` (`AthleteDetail.tsx:2926-2945`) — un `has_pain=true` del
  check-in non lo smuove. Fetta a sé.
- **Quarto della famiglia fuso**: il formato-data della tab Salute usa `new Date("YYYY-MM-DD")`
  (UTC-midnight, pattern preesistente di `SorenessDayRow`) — in fusi a offset negativo rende il
  giorno prima. Nominato, non riparato (il nuovo `formatReportDate` unifica il pattern esistente,
  non lo cambia).
- **Label inglesi delle 4 bandiere storiche** (rese a schermo da CoachHome `:543`/`:288` via
  famiglia B): invariante 4 — «la quinta si aggiunge, non le riscrive». Fetta di lingua dedicata.
- **Resa dedicata di `riskLevel` come parola nel roster** («l'ultimo miglio dal roster»): resta a
  Nicolò come da brief.

## 8. Divergenze — vince la misura

1. **`jsdom` devDependency** (`package.json`+`package-lock.json`, non elencati dal mandato): il
   criterio centrale — la mutazione A deve morire — esige di ESEGUIRE `DailyCheckin.tsx:337`
   dentro `handleSave`, closure interna al componente. Il repo è «no jsdom on purpose»
   (`vitest.config.ts:4`, decisione 2026-07-14) e i 3 render-test esistenti (`renderToString`)
   non possono dispatchare tap. Footprint minimo: pragma `@vitest-environment jsdom` nel SOLO file
   di confine, test in `.ts` con `createElement` (include invariato), environment node per i 25
   file preesistenti, lockfile solo additivo. `jsdom` era già previsto come peer opzionale di
   vitest (`package-lock.json:11254-11257`).
2. **`HealthProfileTab.tsx` modificato** (il brief lo lasciava implicito nella «superficie»):
   misurato, la scheda NON leggeva affatto `hasPain` — senza toccarla, «può dire non risposto»
   sarebbe rimasta una proprietà del hook che nessuno rende.
3. **«Profilo salute» non esiste come stringa nel repo** (grep: 0 match): è la tab **«Salute»**
   del dettaglio atleta (`AthleteDetail.tsx:3323-3326` → `HealthProfileTab`).
4. **«La stessa riga da cui esce `latestReadiness`»** (brief): `latestReadiness` preferisce
   `daily_metrics.subjective_readiness` quando esiste, con fallback su `daily_readiness.score`
   (`useAthletesRiskOverview.ts:243-246`, precedenza-per-fonte già flaggata dalla fetta
   prontezza). La bandiera è ancorata alla riga più recente di **`daily_readiness`** — l'unica che
   porta `has_pain` — e per questo l'etichetta porta la SUA data: se le due fonti divergessero per
   data, la bandiera resta onesta.
5. **Suite attesa 323/25 → misurata 347/29 a fine fetta**: la differenza è esattamente i 24 test
   nuovi in 4 file; la baseline di partenza su `7be4480` era 323/25 come da brief.

## 9. Resta a Nicolò

- **Merge della PR** ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/cucitura));
  post-merge: publish FE del flusso normale — zero migration, zero edge, zero secret.
- **L'ultimo miglio dal roster** (resa testuale/dedicata del `riskLevel`), come da brief.
- **Collaudo suggerito** (2 minuti): roster → l'atleta con la riga 11/08 (`has_pain=true`) mostra
  il chip «Fastidi segnalati · Dolore dichiarato (11/08)» ed esce da «optimal»; tab Salute → card
  «Dolore — ultimo check-in» a tre stati; un check-in nuovo senza risposta al dolore → «Non
  risposto», MAI «Nessun dolore dichiarato».
