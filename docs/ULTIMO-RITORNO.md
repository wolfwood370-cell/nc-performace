# ULTIMO RITORNO — fetta checkin-onesto

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git.
> Fetta: `claude/checkin-onesto` · 2026-08-28 · base `origin/main` = `3bbf063` (la stessa della
> misura di Cowork) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/checkin-onesto)
> — `gh` non installata su questa macchina, ri-misurato oggi, e dal 20/08 il classificatore nega
> le credenziali all'agente).

## 1. Ramo e commit

`claude/checkin-onesto`, da `3bbf063`, 3 commit di codice + eventuale commit di review + il
commit dei documenti (tip del ramo):

- `b94923d` — il modulo puro `weekAdherence.ts` + i suoi test (unit + parità con la porta atleta).
- `9eb208c` — la edge `generate-batch-checkins`: finestra su `completed_at` ai confini del giorno
  di Roma, lettura batch di `program_releases`, tutti i numeri dal modulo puro.
- `39abff6` — l'inbox non fabbrica il denominatore («—» senza prescrizioni), tipo del hook
  allineato, render-test con snapshot DERIVATI dal modulo.
- `dda6669` — esiti della passata indipendente: partizione disgiunta dei giorni + il batch
  fallisce forte su errore o troncamento delle letture (v. §6).

**PR: non aperta.** Motivo misurato: `gh` non esiste (`command not found`) e la via API col token
del credential manager è negata dal classificatore dal 20/08 (memoria di progetto, ri-confermata
dalla fetta durata-unica). Nicolò la apre dal link crea-PR qui sopra.

## 2. Manifesto

**NUOVI:** `supabase/functions/_shared/program/weekAdherence.ts` ·
`src/lib/program/__tests__/weekAdherence.test.ts` ·
`src/lib/program/__tests__/weekAdherence.parita.test.ts` ·
`src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts` ·
`docs/prompts/2026-08-28-checkin-onesto.md` (destinazione dichiarata dalla spec).

**MODIFICATI:** `supabase/functions/generate-batch-checkins/index.ts` ·
`src/pages/coach/CoachCheckinInbox.tsx` (solo i due `?? 0`) · `src/hooks/useWeeklyCheckins.ts`
(solo il tipo di `metrics_snapshot`) · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` (RETRO) ·
questo file.

**NEL PERIMETRO MA NON TOCCATI (VIETATI, misurati a zero righe di diff):**
`src/lib/program/releaseView.ts` (letto dal test di parità, mai modificato) ·
`supabase/functions/_shared/program/coachRelease.ts` (importati `isIsoDate`/`addDaysIso`) ·
`src/hooks/athlete/**` · `src/lib/math/acwr.ts` · `src/lib/effort/sessionRpe.ts` ·
`supabase/functions/analyze-athlete-week/**` · `AthleteContextPane.tsx` · `CoachCalendar.tsx` ·
`supabase/migrations/**` · `src/integrations/supabase/types.ts`.

## 3. Le prove dei permessi (rituale d'apertura — eseguito a metà fetta, dichiarato in RETRO)

1. Repo di scarto in scratchpad: `git reset --hard HEAD~1` → **RIFIUTATO** ·
   `git checkout -- f.txt` → **RIFIUTATO**.
2. I vicini passano: `git status -sb` → `## master` · `git log --oneline -1` → il commit c'è.
3. Reperto nuovo di sessione: il guard del worktree rifiuta anche i comandi composti che
   `cd`-ano nel checkout principale con git — la lettura del file di `main` si fa per path
   assoluto senza git.

## 4. Acceptance — ogni criterio col suo comando e l'output

Tutti eseguiti nel worktree `.claude/worktrees/checkin-onesto`; le tre prove rosse su
`39abff6`, i cancelli finali sul tip di codice `dda6669`.

**1. Settimana vera.** `npx vitest run src/lib/program/__tests__/weekAdherence.test.ts` — la
fixture ha le quattro date `2026-08-22..25` e 4 sedute concluse il 25/08 (carichi 3 · 2.52 ·
1.5 · 2 = 9,02; sRPE 9/8/9/8 = 8,5), finestra 24→30, oggi 28:
`prescribedCount 2 · honouredCount 1 · compliancePct 50 · sessions_completed 4 · off_plan 0 ·
total_volume 9.02 · avg_rpe "8.5" · missed 1 · remaining 0` — 23/23 verdi col test di
partizione aggiunto in `dda6669` (v. anche R1 sotto: gli stessi test, rossi, nominano i valori).

**2. Non oltre il 100%.** Stesso file: `1 giorno onorato + 1 seduta fuori programma →
compliancePct 100, offPlanCount 1`; e `4 sedute su 1 di 2 giorni → 50, mai 200` — verdi.

**3. L'assenza è assenza.** Stesso file: `!("compliance_pct" in snapshot)` e
`!("workouts_scheduled" in snapshot)` con documento null E con rilascio fuori finestra; le
stringhe del modello (`weekDataLines` + `weekPaceContext` + `fallbackSummaryText`) non
contengono `0%` né `(0/0)` e contengono «nessuna seduta programmata» — verdi.

**4. La UI non fabbrica il denominatore.**
`npx vitest run src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts` → 3/3:
con `workouts_scheduled: 2` la card rende «Sessioni 1/2»; senza, rende «Sessioni —» e nessun
`N/0` compare nel testo; l'assenza non accende «Indici di rischio elevati».

**5. Parità fra le due porte.**
`npx vitest run src/lib/program/__tests__/weekAdherence.parita.test.ts` → 2/2 (v1 E v2, 28
giorni, entrambe le funzioni importate dai sorgenti). Rosso di prova in R3.

**6. Determinismo.** Doppia esecuzione stesso input → output `toEqual` (test dedicato); e
`grep -nE "Date\.now|new Date\(|Math\.random"` sul modulo → **0 occorrenze** (exit 1); stesso
grep sui due file di test nuovi → **0 occorrenze** (i pattern nei test sono spezzati apposta).
In più, prova empirica degli helper di fuso della edge (Node, 8/8 OK): mezzanotte di Roma in
CET, CEST e nei due giorni di switch DST; `romeDayOf("2026-08-25T23:30:00Z") = 2026-08-26`.

**7. Nessuna scrittura.** `git diff 3bbf063..HEAD | grep -nE "^\+.*\.(insert|update)\("` →
**exit 1 (zero righe aggiunte)**; `git diff 3bbf063..HEAD -- supabase/migrations/ | wc -l` →
**0**. L'unica scrittura della edge resta l'upsert su `weekly_checkins` preesistente e non
toccato.

**8. I cinque cancelli** (baseline misurata sul tree pulito PRIMA di toccare: 454/47 · 64
errori+13 warning · 245/245):

```
TSC_EXIT=0
VITEST: Tests  482 passed (482)  [50 file; 481×3 run consecutivi su 39abff6, 482 su dda6669]
ESLINT: ✖ 77 problems (64 errors, 13 warnings)   ← identico alla baseline
BUILD_EXIT=0
VERIFYCSS: 245/245 classi con modificatore di alpha tutte emesse e a canali
```

In più (non richiesto dai cinque): `npx deno test --no-lock supabase/functions/_shared/program/`
→ 13 passed; `npx deno check --no-lock` sul modulo nuovo → pulito (v. §8 per il preesistente).

**9. Perimetro.** `git diff 3bbf063..HEAD --name-only` (al tip di codice `39abff6`):

```
src/hooks/useWeeklyCheckins.ts
src/lib/program/__tests__/weekAdherence.parita.test.ts
src/lib/program/__tests__/weekAdherence.test.ts
src/pages/coach/CoachCheckinInbox.tsx
src/pages/coach/__tests__/CoachCheckinInbox.render.test.ts
supabase/functions/_shared/program/weekAdherence.ts
supabase/functions/generate-batch-checkins/index.ts
```

Vietati: **0 righe di diff** (misurati uno per uno, `VIETATI_DIFF_LINES=0`). I file `docs/**`
di questo ritorno si aggiungono col commit dei documenti, come in ogni fetta (protocollo
«cosa rimandi indietro» + chiusura di CLAUDE.md §6.0).

## 5. Le tre prove rosse (mutazione su copia, ripristino per copia + `cmp` byte-identico)

**R1 — il filtro.** Rimessa la selezione su `scheduled_date` nel punto in cui il filtro ora
vive — `completedLogsInWindow` nel modulo (la riga letterale della edge non è raggiungibile da
NESSUN runner: la cartella non ha test Deno, come dichiarato dal prompt stesso; l'equivalenza è
1:1, stessa colonna, stessa finestra). Rosso: **7 test morti**, i due chiesti nominano i valori:

```
AssertionError: attese 4 sedute concluse (le righe del 25/08), il filtro ne ha lasciate passare 0
AssertionError: atteso total_volume 9.02, trovato undefined
```

**R2 — l'assenza.** Rimesso `: 0` al posto di `null` in `weekAdherence`. Rosso: **7 test morti
in due famiglie**, le due chieste:

```
AssertionError: senza prescrizioni la chiave compliance_pct NON deve esistere nello snapshot:
expected true to be false
AssertionError: expected '…' not to contain 'Indici di rischio elevati'
Received (estratto): «…Indici di rischio elevatiCompliance sotto soglia (0%). Valutare scarico
o approfondimento.…Compliance0%Sessioni0/0…»
```

Il secondo è il render della pagina VERA con lo snapshot costruito dal modulo mutato: la card
malata («Compliance 0% · Sessioni 0/0») riappare identica alla misura del 28/08.

**R3 — la porta unica.** Spostata di un giorno la mappatura v1 (`(mondayIndex+1) % 7`). Rosso:

```
AssertionError: le due porte non sono d'accordo sulla data 2026-08-12:
prescribedDatesInWindow dice false, sessionForDate dice true
```

Dopo ogni prova: ripristino per copia dal backup del file committato, `cmp` → exit 0, tree
pulito, run verde di conferma.

## 6. Passata indipendente (workflow: 4 auditor di progetto + 2 refuter per rilievo, 12 agenti)

**Verdetto reviewer: «committabile-no» → i rilievi confermati sono CHIUSI in-branch (`dda6669`).**

- 🔴 **CONFERMATO 2/2 (con repro eseguito sul modulo vivo): `remainingCount` contava anche
  oggi se già onorato** — con prescritti 24·26·28 e allenati 24·26, oggi 26: onorati 2 +
  saltati 0 + rimanenti 2 = 4 su 3 prescritti, e il prompt diceva «ancora 2 in programma»
  quando ne restava uno. Chiuso: la partizione è disgiunta
  (`day >= todayIso && !completedSet.has(day)`), test nuovo nato rosso
  («trovati 2, expected 1») + pin `onorati+saltati+rimanenti === prescritti`.
- 🔴 **CONFERMATO 2/2: `program_releases` senza `limit` tronca in silenzio al cap PostgREST
  (1000, `config.toml` non lo ridefinisce)** — a scala, gli atleti oltre il cap leggerebbero
  «mai prescritto»: un'assenza fabbricata dal troncamento. Chiuso: `limit` esplicito + guardia
  che FALLISCE il batch al cap invece di tacere.
- **Auditor RLS (medium): le tre query batch ignoravano `.error`** (supabase-js non lancia:
  `data || []` su un errore scriveva uno snapshot indistinguibile dall'assenza legittima —
  la malattia della fetta, un piano sotto). Il refuter-contratto lo declassava a «preesistente»
  (vero: su `main` l'errore fabbricava `0%`), ma preesistente ≠ coerente con l'invariante:
  chiuso — il batch fallisce forte su qualunque errore delle tre letture.
- **CONFUTATO (dal contratto stesso): «la card Sessioni rende un rapporto a giorni sotto
  un'etichetta da sedute»** — il criterio-contratto chiede esattamente «Sessioni 1/2» coi
  giorni; osservazione lessicale vera, rimedio che violerebbe il contratto. Non toccato
  (un refuter perso per un errore API del provider, il voto rimasto è di confutazione).
- **Dichiarato, non corretto (parere del reviewer stesso: «va decisa, non corretta di
  nascosto»): il documento v1 non scade mai** — un rilascio v1 prescrive i suoi giorni-feriali
  OGNI settimana, per sempre; è la semantica di `sessionForDate` che la parità (acceptance 5)
  impone di ereditare. Un atleta il cui ULTIMO rilascio è v1 avrà compliance calcolata (e
  bassa) a tempo indefinito. Decisione di prodotto per la fetta della famiglia relazionale.
- **Auditor Aura: tutto conforme** (le due modifiche sono logica/testo, zero classi).
- **Test-verifier: «VERDE NETTO»** (tsc 0 · vitest verde · eslint 64/13 = baseline ·
  deno test `_shared/program/` 13/13).
- **Rilievi minori dell'auditor RLS su pattern PREESISTENTI, flaggati e non toccati** (fuori
  scope, stessa casa del `error.message:368`): log del full error object (`:343`, `:363`),
  body d'errore OpenAI loggato intero (`:322`), `full_name` interpolato nel prompt (vettore
  prompt-injection/PII), nessun rate-limit sull'endpoint AI. Candidati a una fetta-pulizia
  dell'error handling della edge.

## 7. Non fatto

1. **PR non aperta** (motivo misurato in §1: `gh` assente + credenziali negate all'agente).
2. **La conversione `completed_at` → giorno di Roma della edge non ha un test in un runner**:
   vive in `romeDayOf`/`utcOfRomeMidnight` (Deno, fuori dal modulo puro perché usa l'orologio
   del chiamante e Intl); verificata empiricamente 8/8 in Node (§4.6), non cementata da vitest.
3. **`deno check` sull'intera edge resta rosso per un difetto PREESISTENTE**: `error.message`
   su `unknown` a `index.ts:350` — misurato IDENTICO sul file di `main` (`:320`). Non toccato:
   fuori scope, nessun test lo copre, e la CI Deno esegue i test delle tre suite, non il check
   di questa funzione.
4. **Il ramo RPE≥8 di `isAnomalous` non è stato toccato** (v. DIVERGENZE 1).

## 8. Divergenze — dove il prompt diceva una cosa e il repo un'altra (vince la misura)

1. 🔴 **«Senza il riquadro Indici di rischio elevati» non è raggiungibile con l'RPE vero.**
   Il criterio-contratto presume che il riquadro nasca solo dalla compliance fabbricata, ma
   `isAnomalous` ha un SECONDO ramo vero — `CoachCheckinInbox.tsx:91-94`, `avg_rpe >= 8` — e
   l'RPE medio del caso-contratto è **8,5 reale**: il riquadro comparirà citando il SOLO RPE
   («RPE medio 8.5/10 — carico interno elevato»), mai più la compliance. La parte fabbricata
   del criterio è chiusa (il render-test asserisce «niente 'Compliance sotto soglia'» a 50%);
   silenziare un segnale VERO per soddisfare la lettera sarebbe la malattia opposta a quella
   che la fetta cura (un'assenza travestita, stavolta di un allarme). Decisione di prodotto
   flaggata come chip («Decidere la soglia RPE dell'allarme nell'inbox coach») e qui a §9.
   Nello stesso modo l'atleta resta nel filtro «Anomalie» via RPE — via misura, non via zero.
2. **«4/0» non era il render dell'assenza**: con lo snapshot onesto `workouts_completed` vale
   i giorni onorati (0 sull'assenza), quindi il vecchio `?? 0` avrebbe reso «0/0», non «4/0».
   Il render-test asserisce la classe intera (`not.toMatch(/\d+\/0(?!\d)/)`), che copre
   entrambi.
3. **R1 letterale vs R1 testabile**: il prompt chiede di rimettere `.gte("scheduled_date"…)`
   sulla query della edge, ma nessun runner esegue quella query (nessun test Deno della
   cartella); il filtro onesto ora vive nel modulo e la mutazione è stata fatta LÌ, stessa
   colonna e stessa semantica — il rosso chiesto (4 vs 0 · 9,02 vs assente) è quello mostrato.
4. **`grep` di acceptance 6 «sui due file nuovi»**: i file nuovi sono quattro; il grep è stato
   eseguito sul modulo E sui due test di libreria (0 occorrenze ovunque; nei test i tre
   pattern compaiono solo spezzati, apposta).
5. **`remainingCount` diverge dalla LETTERA del prompt** («remainingCount = giorni prescritti
   con data >= todayStr»): la definizione letterale conta due volte il giorno di oggi già
   onorato — riprodotto dai refuter col modulo vivo (onorati+saltati+rimanenti = prescritti+1,
   e il prompt del modello mentiva di un allenamento). Vince il criterio (numeri onesti
   all'IA): rimanente = prescritto, da oggi in poi, NON ancora onorato. Test dedicato.
6. **`workouts_completed` cambia significato** (da «sedute completate» a «giorni prescritti
   onorati», coerente col denominatore accanto): è la scelta del prompt, ma va detto che i
   due soli lettori FE (`CoachCheckinInbox:480`/`:705`) lo rendono come numeratore del
   rapporto — nessun altro consumatore in `src/**` (misurato col grep dei lettori di
   `metrics_snapshot`). Le sedute vere restano in `sessions_completed`.

## 9. Resta a Nicolò (e a Cowork)

1. **Merge** della PR (che Nicolò apre dal link in testa).
2. **Deploy** della edge `generate-batch-checkins` (v33 → v34; il connettore legga
   l'`entrypoint_path` dopo il deploy, come da spec §Verifica).
3. **Collaudo su `/coach/inbox`**: bottone «Analizza» → card dell'atleta `cfb31e82`:
   Compliance 50% · Sessioni 1/2 · Volume 9.02 UA · RPE medio 8.5. ⚠️ Il riquadro «Indici di
   rischio elevati» COMPARIRÀ citando il solo RPE 8,5 (vero) — v. Divergenza 1: non è la
   compliance, ed è la decisione-chip da prendere.
4. **Cowork, verifica live** dopo il collaudo: `select metrics_snapshot from weekly_checkins`
   → `compliance_pct: 50, workouts_scheduled: 2, workouts_completed: 1, sessions_completed: 4,
off_plan_sessions: 0, total_volume: 9.02, avg_rpe: "8.5"`; e su una settimana senza
   prescrizioni la chiave `compliance_pct` NON deve esserci.
5. **Chip aperte in questa fetta**: soglia RPE dell'allarme (Divergenza 1) · pulizia error
   handling della edge (`error.message:350` preesistente + i rilievi di log-scrubbing della
   passata, v. §6).
