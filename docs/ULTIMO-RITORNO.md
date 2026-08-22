# ULTIMO RITORNO — fetta home-atleta

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/home-atleta` · 2026-08-22 · base `main` = `464a90e` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/home-atleta) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/home-atleta`, 5 commit da `464a90e`: `77e8c85` (selettore unico `sessionForDate` +
intervallo `sessionRpeRange`, media RIMOSSA, Training Hub ricablato) · `9ae412a` (home dai dati
veri: saluto dal profilo + `TodaySessionCard` a stati) · `ae3cd9c` (debrief sulla seduta vera,
`WORKOUT_SUMMARY` sparito) · `1abb670` (chiusi i 2 rilievi confermati della review: ancora
`startedAt` nel debrief + warm-up fuori dall'intervallo) · il commit dei documenti (questo file,
HANDOFF, RETRO) è il tip del ramo — un file non può contenere l'hash del commit che lo introduce.

## 2. Manifesto

**NUOVI:** `src/lib/program/__tests__/releaseSelection.test.ts` (23 test del modulo puro) ·
`src/pages/athlete/__tests__/AthleteDashboard.render.test.ts` (12, montaggio reale via
`renderToString`) · `src/pages/athlete/__tests__/PostWorkoutDebrief.render.test.ts` (5).

**MODIFICATI:** `src/lib/program/releaseView.ts` (+`sessionForDate`/`sessionRpeRange`/
`formatSessionRpeRange`/`sessionTitle`/`localIsoDate`; −`sessionRpeTarget`) ·
`src/pages/athlete/AthleteTraining.tsx` (passa dal selettore; etichetta `RPE serie min–max`) ·
`src/pages/athlete/AthleteDashboard.tsx` (MOCK rimosso; saluto da `profiles.full_name`;
`TodaySessionCard`) · `src/pages/athlete/PostWorkoutDebrief.tsx` (titolo dalla seduta del giorno
d'INIZIO, chip muscolari rimossi) · `src/lib/program/__tests__/releaseView.test.ts` (**⚠ era
VIETATO — divergenza obbligata, v. §7.1**: −import e −1 `it` della media, 11 righe) · `docs/HANDOFF.md` ·
`docs/auto-miglioramento.md` · `docs/ULTIMO-RITORNO.md`.

**NEL PERIMETRO MA NON TOCCATI:** tutto `supabase/**` (zero file) · `src/integrations/supabase/types.ts` ·
card Prontezza e sue costanti (`MOCK_YESTERDAY`, polarità, freccia) · contratto di
`useLatestReleaseQuery` (nessuna riga nel diff su `useProgramRelease.ts`).

## 3. Le due prove dei permessi (repo di scarto, PRIMA di ogni modifica)

- `git checkout -- f.txt` → **rifiutato dal permesso** («Permission to use Bash … has been denied»).
- `git clean -fd` → **rifiutato dal permesso** (stesso esito).
- Vicini consentiti: `git status --short` → ` M f.txt` · `git checkout -b probe` → `Switched to a new branch 'probe'`. Entrambi passano.

## 4. Acceptance — comando ed esito

1. **Prova rossa** → v. §5. Meccanismo: due documenti → due schermate e due profili → due saluti
   (`AthleteDashboard.render.test.ts`, describe «due profili» e «due documenti»).
2. **Nessuna seduta → nessun bottone** — test «seduta oggi → CTA presente; nessuna seduta oggi →
   riposo SENZA CTA»: controllo positivo (`Inizia Sessione` presente con la seduta) e negativo
   (`Giorno di riposo` senza `Inizia Sessione`) nello stesso test; più i 4 stati
   niente-programma/errore/caricamento/illeggibile, tutti senza CTA. Verde in suite.
3. **Intervallo prescritto** — `releaseSelection.test.ts`: 7.5/8/9 → `{min:7.5,max:9}` →
   «RPE serie 7.5–9»; tutte a 8 → «RPE serie 8»; solo %1RM → `null` → nessuna riga; RPE 0 → assenza;
   warm-up escluso. Verde in suite (e sul rendering della home nel test SSR).
4. **La media non esiste più** — `git grep -n "sessionRpeTarget"` → **0 occorrenze** (exit 1).
   `git grep -n "Lower Body Power"` → **3**, nessuna di prodotto: 2 = la guardia stessa
   (`PostWorkoutDebrief.render.test.ts:129` `not.toContain`) · 1 = `docs/UX_UI_DESIGN_SYSTEM.md:36`,
   preesistente su `main` e fuori perimetro. `git grep -n "Marco" -- src/pages/athlete …` → **2**,
   entrambe la guardia (`AthleteDashboard.render.test.ts` `not.toContain("Marco")`). ⚠ Divergenza
   dichiarata in §7.2: lo «zero» letterale era irraggiungibile per costruzione (lezione 2026-08-06:
   l'acceptance-grep si esegue su main prima di prometterlo).
5. **v1 immobile** — `git diff origin/main..HEAD --stat -- src/lib/program/__tests__/releaseView.test.ts`
   → `11 ++---------` (2 insertions, 9 deletions): SOLO import + l'`it` della media. ⚠ Lo 0 richiesto
   era in conflitto col criterio 4 — v. §7.1. La parità v1 del parser (round-trip col builder reale)
   e `dayForWeekday` sono intatte e verdi; il parser v1 non ha una riga di diff.
6. **Gate** — `npx tsc --noEmit -p tsconfig.app.json` → verde (silenzioso) ·
   `npx vitest run` → **306 passed (306), 23 file** — baseline su `464a90e` ri-misurata **277/20**
   (= la promessa del prompt) · `npx eslint .` → «94 problems (**81 errors**, 13 warnings)» =
   baseline `.eslint-baseline` 81, nessun errore nuovo. Verifica indipendente `code-test-verifier`:
   stessi numeri (su `ae3cd9c`; ri-misura manuale identica dopo `1abb670`).
7. **Perimetro** — `git diff origin/main..HEAD --stat` → gli 8 file di codice del §2 + 3 doc.
   Zero `supabase/**`, zero `types.ts`, card Prontezza intatta.

## 5. La prova rossa

Rotto apposta: in `AthleteDashboard.tsx` il saluto riportato a `Ciao, Marco` (cablato). Run:
`FAIL … AssertionError: expected '<div …' to contain 'Ciao, Nicolò'` — `Expected: "Ciao, Nicolò"`,
nel Received l'HTML della pagina con `>Ciao, Marco</p>` (3 test rossi: i due saluti + il
niente-dati-inventati). Ripristinato il saluto dal profilo → 12/12 verdi. Il rosso nomina il valore
atteso e quello ricevuto: il test misura il meccanismo, non la costante.

## 6. Non fatto

- **Titolo della HeroWorkoutCard del Training Hub con focus vuoto** (che sui dati reali è SEMPRE) e
  plurale «1 esercizi»: fuori dagli obiettivi della fetta (che nominano la home), flaggata come task
  separato (chip «Titolo HeroWorkoutCard con focus vuoto + plurale esercizi»). La home ha già
  entrambe le correzioni.
- **Bonifica tema delle pagine atleta**: il rilievo dell'aura-theme-auditor (1 token Aura in codice
  nuovo, `AthleteDashboard.tsx` `TodaySessionStatus` → `text-on-surface-variant`) NON è stato
  riparato da solo: l'intera pagina — saluto, ReadinessCard, Header — e la StateCard del Training Hub
  usano lo stesso vocabolario (grep §2.6 già non-zero su `main`); ripararne uno crea la card a due
  toni (Fragilità #6: mai un solo gradino della scala). Debito strutturale, fetta-tema dedicata.
- Il retry «Riprova» della card errore in home replica il pattern del Training Hub ma non è estratto
  in componente condiviso (2 usi, <20r: soglia di estrazione non raggiunta).

## 7. Divergenze (vince la misura, con file:riga)

1. **I criteri 4 e 5 dell'acceptance erano in conflitto diretto**: `releaseView.test.ts:13`
   importava `sessionRpeTarget` e `:75-80` la testava — la verità di riferimento non lo diceva.
   Zero occorrenze della media E zero diff sul file protetto erano IMPOSSIBILI insieme. Il criterio
   («la media si rimuove, non si affianca», 🔴) ha vinto sul passo: edit MINIMO al file (2+/9−,
   solo import e l'`it` della media), parità v1 intatta.
2. **Grep «Lower Body Power» e «Marco» ≠ zero letterale** (v. §4.4): le occorrenze superstiti sono
   le guardie `not.toContain` dei test nuovi + una riga doc preesistente su `main`
   (`docs/UX_UI_DESIGN_SYSTEM.md:36`). Le costanti di prodotto sono sparite.
3. **«Un test che monta la home» senza jsdom**: `vitest.config.ts:4` — «no jsdom on purpose»
   (decisione 2026-07-14), include solo `src/**/*.test.ts`. La montatura è REALE ma server-side:
   `renderToString` + `vi.mock` dei moduli dati (il blocco documentato nel Log 2026-07-23 —
   supabase client a module-scope — non scatta perché i moduli mockati non vengono mai caricati).
4. **`sessionForDate` costruisce `new Date(\`${isoDate}T00:00:00Z\`)`**: funzione deterministica
   dell'INPUT (parse UTC di una data esplicita), non lettura dell'orologio — lo spirito
   dell'invariante «niente new Date() nei moduli puri» è «il modulo non tocca l'orologio», e resta
   vero: la data la porta sempre il chiamante. Il reviewer indipendente l'ha giudicata conforme.
5. **La media «intermittente»**: confermata la lettura del prompt — il filtro `r > 0` scartava gli
   esercizi v2 non uniformi (rpe legacy 0), quindi sul rilascio reale la riga «RPE target» non
   compariva. Il paragrafo del prompt regge; nessuna correzione da fare.
6. **Smistamento a `AthleteTraining.tsx:811-841`**, non 811-838 come da verità di riferimento
   (3 righe di scarto, stessa sostanza). `MOCK` consumato a `:628` e `:354-363` come misurato.

## 8. Resta a Nicolò

- **Merge della PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/home-atleta)
  coi 2 check obbligatori verdi. Nessun deploy edge, nessuna migration: publish FE e basta.
- **Ultimo miglio a occhio, da atleta** (profilo `Nicolò Castello`, rilascio `a8d5fea4`): la home
  saluta «Ciao, Nicolò»; nei giorni CON seduta la card dice «Giorno N», «1 esercizio», e SOLO il
  giorno 1 la riga «RPE serie 7.5–9» (giorni senza RPE scritto = nessuna riga); nei giorni senza
  seduta «Giorno di riposo» senza bottone; il debrief a fine sessione nomina il giorno della seduta.
  Nessun «45 min» da nessuna parte.
- Decisione di merito da ratificare: il **warm-up è escluso dall'intervallo RPE** (rilievo F2 della
  review, chiuso con la decisione «l'intervallo cita l'intensità di lavoro»): se il metodo volesse
  includerlo, è un filtro in `sessionRpeRange` + un test.
- La chip «Titolo HeroWorkoutCard con focus vuoto + plurale esercizi» (Training Hub) è pronta da
  lanciare quando vuoi.
