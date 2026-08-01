# 2026-08-01 — La leggibilità della gravità sulla home del coach

> Prompt-file della fetta. Spec di origine: `app/spec-leggibilita-gravita-coach-2026-08-01.md`.
> Due difetti trovati durante il collaudo del 01/08, sulla stessa schermata e della stessa famiglia:
> **il coach legge la gravità sbagliata**. Più il terzo pezzo, che tiene chiusi i primi due.

---

**Task:** far sì che il coach legga la gravità giusta sulla sua schermata iniziale.
**Data:** 2026-08-01
**Strumento di destinazione:** ☑ Claude Code
**Branch previsto:** `claude/leggibilita-gravita-coach`

## 1. Obiettivo (perché)

Un segnale che si vede male è un segnale a metà. La Centrale Operativa stampava «Tutto sotto controllo»
sopra un avviso vero, e le pill di gravità critica uscivano senza colore. Nessuna soglia cambia: cambia
**come** i segnali vengono comunicati. Il terzo pezzo è un cancello che veda le classi CSS inesistenti,
oggi invisibili a `tsc`, a eslint e ai test.

## 2. Contratto (il patto verificabile)

- **Input:**
  - `unreadCount` da `src/hooks/useCoachAlerts.ts` (nessun conteggio nuovo; riga verificata al
    momento della scrittura, non citata a memoria: `:162` nel `return`).
  - I toni error che `src/providers/MaterialYouProvider.tsx:497-500` già calcola a runtime.
- **Output atteso:**
  - `src/index.css` + `tailwind.config.ts` — la famiglia `error` mappata; 10 classi di gravità che
    finiscono davvero nel CSS costruito.
  - `src/lib/coachAlerts.ts` — `canReassure` puro, coperto da vitest; `CoachHome` lo consuma.
  - `eslint.config.js` — `tailwindcss/no-custom-classname` a `error`.
  - `scripts/verify-css-tokens.mjs` — asserzione sul foglio di stile costruito.
- **Invarianti da non rompere:**
  1. Nessuna soglia di gravità cambiata: si tocca la presentazione, non la decisione.
  2. Zero modifiche sotto `supabase/**`. Nessuna migration.
  3. Nessun colore nuovo: si usano quelli che il design system ha già.
  4. Il varco non si indebolisce: se il baseline sale, sale una volta sola e con l'elenco nel commit.
  5. La nuova regola non deve rallentare il lint oltre il ragionevole.
  6. Stringhe utente in italiano.

## 3. File

- **Toccati:** `src/index.css` · `tailwind.config.ts` · `scripts/verify-css-tokens.mjs` (nuovo) ·
  `src/lib/coachAlerts.ts` · `src/lib/__tests__/coachAlerts.test.ts` · `src/pages/coach/CoachHome.tsx` ·
  `eslint.config.js` · `.eslint-baseline` · `package.json` + `package-lock.json`.
- **VIETATI (rispettati):** tutto `supabase/**` · `src/components/coach/CoachAlertsPanel.tsx` ·
  `.github/**`.
- **Vietato dalla spec, aperto con deroga esplicita di Nick dopo la review:**
  `src/hooks/useCoachAlerts.ts` — solo esposizioni additive dal `return` (`isSuccess`,
  `dataUpdatedAt`, `isFetching`), motivazione nel commit `1dc5981` e in §9.
- **Fuori dalla lista attesa della spec, approvati da Nick prima dell'esecuzione:** `src/index.css`
  (unica sede coerente per i token, v. §7) · `src/lib/coachAlerts.ts` + test (per rendere il requisito
  falsificabile da vitest invece che a occhio) · `scripts/verify-css-tokens.mjs` (richiesta di Nick
  all'OK: la sonda diventa una prova committata, non un controllo manuale).

## 4. Acceptance (criteri falsificabili — ognuno può bocciare)

- ☑ Con avvisi di sistema non letti, la Centrale Operativa **non** dice «Tutto sotto controllo» — e
  nemmeno mentre la query carica, quando fallisce, o quando un «success» è solo la cache di ieri
  (regola pura `canReassure`, 18 test; le mutazioni che contano provate e uccise, inclusi il ramo
  `paused` e lo snapshot idratato).
- ☑ Le 10 classi di gravità compaiono nel CSS costruito: `npm run build && npm run verify:css`.
  Lo stesso script sul CSS di `main` pre-fix esce 1 elencandole tutte.
- ☑ Le 5 variabili restano in forma a canali, dentro `:root`, e nessun sorgente le riscrive a
  runtime: due mutazioni provate e uccise (riga `setProperty` nel provider · `hsl()` completo in
  `index.css`).
- ☑ `no-custom-classname` attiva e provata: `bg-inventata-di-prova` iniettata in `CoachHome` viene
  segnalata (356:14), poi rimossa.
- ☑ `npx tsc --noEmit -p tsconfig.app.json` verde · `npx vitest run` 188/188 ·
  eslint 105 = `.eslint-baseline` (salito una volta sola, elenco nel commit `chore(varco)`) ·
  `npm ci` esce 0 e il conteggio resta 105 da `node_modules` vergine.
- ☑ `git diff --name-only main..HEAD`: zero file sotto `supabase/`.
- ☑ **Aperte dalle review, chiuse con deroga** (`1dc5981`, `d109413`, `233a0b0`): né la query in
  errore, né il retry in pausa offline, né un «success» idratato da ieri producono più l'all-clear —
  il widget dichiara che il canale non ha risposto. Vedi §9.

## 5. Verifica (come si controlla, non a memoria)

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build && npm run verify:css
npx eslint . -f json | node -e "…" # conteggio errori == .eslint-baseline
git diff --name-only main..HEAD
```

## 6. Chiusura

- 14 commit atomici su `claude/leggibilita-gravita-coach`. Sette nascono dalle tre review
  indipendenti, non dal piano.
- Merge = Nick via Pull request.

## 7. Le quattro misure che hanno cambiato il rimedio

Registrate qui perché sono la ragione per cui il piano non è quello che sembrava all'inizio.

**(1) Le `--m3-*` non sono sempre definite.** Non esistono in `src/index.css`: le imposta solo
`MaterialYouProvider` (`useEffect` `:480-543`) come **inline style su `<html>`**, quindi solo dopo il
montaggio del provider (`src/main.tsx:43`), e in **forma a canali** (`0 45% 90%`), non come colore
completo. Mapparci sopra Tailwind avrebbe legato un token statico a un provider di runtime senza
guadagnarci nulla. Tutti i token-contenitore Aura (`--primary-container`, `--tertiary-container`,
`--surface-container-*`) vivono in `index.css`, e il blocco BRIDGE del provider (`:524-542`) **non** li
sovrascrive: quella è la sede coerente, e lì sono definiti sempre.

**(2) In Tailwind v3 un colore dichiarato come `var(--x)` completo fa cadere il modificatore di
opacità — la utility non viene proprio emessa.** Misurato sul CSS costruito: 97 classi con
modificatore di opacità, tutte su colori **letterali** (`bg-black/50`, `bg-brand-container/40`,
`bg-emerald-500/10`); `.bg-destructive\/10`, `.bg-primary\/10`, `.border-outline-variant\/10` sono
**assenti**. In sorgente ci sono **537** usi di questa forma. Conseguenza diretta sulla fetta: la
mappatura semplice avrebbe acceso 3 punti su 8. Da qui la forma a canali + `hsl(var(--x) /
<alpha-value>)`, che li accende tutti.

**(3) La regola di lint non avrebbe intercettato il difetto che l'ha motivata.**
`no-custom-classname` legge gli attributi `className` letterali e le stringhe dentro i `callees`. Le
classi restituite dentro un oggetto da un helper — `severityPill()` in `CoachHome:88-93`, `toneOf()` in
`CoachCheckinInbox:155` — le restano invisibili: copre 4 degli 8 punti noti. È mezzo varco, e va detto.
La prova completa è `npm run verify:css`, che guarda il CSS invece del sorgente.

**(4) Una correzione parziale di gravità può invertirla.** Accendere «Critico» e lasciare «Attenzione»
com'era produceva, nella card Triage, un chip rosso pieno · uno **senza riempimento** · uno giallo
pieno: la gravità intermedia diventava la meno evidente delle tre. Prima della fetta i primi due erano
entrambi incolori, quindi coerenti fra loro — **l'inversione la crea la correzione**. Chiusa con la
stessa conversione sulla coppia `tertiary-container` (commit `fix(design)` n.2), che accende anche la
pill `medium` del pannello §0 senza aprire quel file. Regola generale: quando si ripara un pezzo di una
scala, si guarda la scala, non il pezzo.

## 8. Cosa questa fetta NON chiude

### 8.1 La fetta successiva: token di colore in forma a canali + `verify:css` nel varco

Quattro cose che sembravano quattro voci separate sono **un difetto solo**, e vanno fatte insieme:
token di colore non in forma a canali, e nessun cancello che se ne accorga. Decisione di Nick,
01/08 — registrarle come una voce, ed è la fetta subito dopo questa.

1. **I 537 modificatori di opacità morti** su token `var()`. Misura rieseguibile: dopo `npm run build`,
   nel CSS costruito ci sono 97 classi con modificatore di opacità e sono **tutte** su colori letterali
   (`bg-black/50`, `bg-emerald-500/10`); `.bg-destructive\/10`, `.bg-primary\/10`,
   `.border-outline-variant\/10` sono assenti.
   **La domanda di Nick, da rispondere prima di qualunque fix: quante di quelle superfici portano un
   significato clinico o di gravità?** Quelle vengono prima delle decorative.
2. **`chart-1..5` mai mappati** (23 occorrenze — `AcwrGauge:111`, `VelocityTrendChart`,
   `VolumeIntensityChart`, `StrengthChart`, `BarPathGallery`, `AthleteDetail`): in `index.css` le
   variabili si chiamano `--chart-volume/intensity/fatigue/…`, i nomi numerici non esistono da nessuna
   parte. È il gauge ACWR, cioè una superficie di rischio. Più `secondary-container` /
   `on-secondary-container` / `on-primary` (6 occorrenze). Elenco completo per classe e per file nel
   commit `chore(varco)` che alza il baseline.
3. **La pill `high` del pannello §0 resta senza sfondo** (`CoachAlertsPanel.tsx:71`,
   `bg-destructive/10`, verificata assente dal CSS costruito). È l'unico gradino della scala di gravità
   che resta spento — il `medium` accanto è stato acceso da questa fetta senza aprire il file.
   Richiede `--destructive` in forma a canali, che rompe `MaterialYouProvider.tsx:538`: il BRIDGE ci
   scrive un `hsl(...)` completo a runtime. Da fare insieme al punto 1, non da sola.
4. **`verify:css` non è agganciato alla CI**: il job web non fa `npm run build` e `lint-staged` esegue
   solo prettier, quindi oggi è un cancello che _si può_ eseguire, non uno che _viene_ eseguito.
   `.github/**` è vietato in questa fetta. Quando lo si aprirà: **il commento a `ci.yml:41` dice ancora
   «non blocca i 53 errori esistenti»**, e il baseline ora è 105.

Nota per chi la esegue: aggiungere una classe oggi rotta alla lista `EXPECTED` di
`scripts/verify-css-tokens.mjs` rende il gate **rosso**. Si aggiunge insieme al fix, mai prima.

### 8.2 Residui minori, dichiarati

- **Il commento in `CoachAlertsPanel.tsx:61-62`** («`error-container` is not a key in
  `tailwind.config.ts`, nor a CSS var in `index.css`») è reso **falso** da questa fetta. File vietato,
  non corretto qui: motivava la scelta di `destructive`, quindi un prossimo agente ci si fida e rifà
  la scelta sbagliata. Va riscritto insieme al punto 8.1.3.
- **`ActiveWorkout.tsx:194` resta mezzo acceso**: `bg-error` (registrazione in corso) ora si vede,
  `bg-on-surface-variant/40` (in pausa) no — è un modificatore di opacità su token `var()`, punto
  8.1.1. Non è un'inversione: lo stato attivo è più visibile di quello in pausa, non il contrario.
- Non riconcilia le due fonti (`urgentAlerts` client-side e `coach_alerts` server-side): le fa smettere
  di contraddirsi, non le unifica.
- Il bullet nuovo è **cieco alla severità**: `unreadCount` conta anche i `low`, quindi un avviso di
  bassa priorità sopprime l'all-clear. Direzione conservativa e coerente col §0, dichiarata qui.
- Il test copre la **regola**, non il cablaggio nel componente: vitest qui gira node-only, senza
  render. Un revert della sola chiamata nel JSX passerebbe verde.

## 9. Gli stati della fonte — tre review per arrivarci

`canReassure` nasceva guardando **un** modo di non sapere («sto caricando»). La prima review ne ha
trovato un secondo (la query in **errore**), la seconda un terzo (il retry in **pausa** offline), e il
terzo giro — su domanda adversariale precisa di Nick — il quarto, che è di un'altra specie. Ogni volta
lo stesso sintomo: `unreadCount` è 0 — e uno 0 che significa «non lo so» veniva letto come «non c'è
niente».

Verificato nei sorgenti installati (`@tanstack/query-core`): `isLoading` è `isPending && isFetching`,
quindi falso in quattro stati su sei; `isError` è vero solo per `status: 'error'`. Con `networkMode:
'offlineFirst'` (`src/main.tsx:25`) un retry paused lascia `status: 'pending'`, `fetchStatus:
'paused'` — nessuno dei due flag lo copre. E `retry: false` sui 4xx porta un errore RLS al primo
tentativo, senza ritentare.

**Primo rimedio: non il quarto booleano ma l'inversione.** Enumerare i modi di non sapere significa
che ogni stato dimenticato — o aggiunto in futuro dalla libreria — vale per default come «rassicura».
La regola è passata a un segnale positivo (`channelAnswered` = `isSuccess`).

**Poi la domanda di Nick: esiste uno stato in cui `isSuccess` è vero ma il dato NON è una risposta
attendibile?** Sì — **la cache persistita**. Questo repo idrata TanStack da IndexedDB con `maxAge` 24h
(`src/main.tsx:33-37`); una query idratata riparte con `status: 'success'` e **lo stato di ieri**,
`dataUpdatedAt` compreso (`hydration.js:124`). Coach offline: refetch in pausa, `isSuccess` vero su
una fotografia di 24 ore fa che non può contenere l'avviso di stanotte. Il punto debole
dell'inversione non è «uno stato dimenticato»: è **«success che non significa ciò che credo»**.

**Chiusura, con la stessa forma — un segnale positivo più stretto:** il canale ha risposto **di
recente**. `canReassure` riceve l'età della risposta (derivata da `dataUpdatedAt`; `Infinity` se non
c'è mai stata) e la soglia — `CHANNEL_FRESHNESS_MS`, 5 minuti — vive nel modulo puro, dove il test la
pinna. Nessuna eccezione: lo snapshot di ieri non qualifica; `placeholderData` (status `success`
forzato con `dataUpdatedAt` 0 — `queryObserver.js:277-283`; non usato da `useCoachAlerts`, usato solo
da `useExerciseLibraryQuery`) non qualifica per la stessa via; un errore dopo un successo vecchio non
qualificava già. Il widget distingue con `isFetching` (non `isLoading`: un refetch in background su
dati idratati è fetching ma mai «loading») fra «Sto controllando…» e «Controlla la connessione».
Limite dichiarato: la freschezza si valuta al render — una tab lasciata aperta e ferma non ricalcola,
ma `refetchOnWindowFocus` rifetcha e ri-renderizza al ritorno del coach.

Chiudere tutto questo richiedeva righe in `src/hooks/useCoachAlerts.ts`, **file vietato dalla spec**.
Deroga concessa da Nick con la motivazione agli atti nel commit `1dc5981`: _il veto su quel file
serviva a tenere stretta la fetta, non a proteggere un invariante; lasciare che il coach legga
l'all-clear quando la query è in errore sarebbe chiudere la porta d'ingresso della bugia e lasciarne
aperta una sul retro._ Additive tutte: `isSuccess`, `dataUpdatedAt`, `isFetching`; nessun consumatore
esistente cambia (`CoachSidebar` destruttura solo `unreadCount`).

Gli input di `canReassure` sono **obbligatori**, non opzionali: un campo opzionale lascerebbe che un
chiamante lo ometta e torni a rassicurare per default, cioè il modo esatto in cui il buco è nato. Il
modo di fallire di quella funzione dev'essere il silenzio.

**Regola generale che ne esce:** quando un veto di scope e il requisito della fetta confliggono,
decide il requisito — e la ragione si scrive nel commit, non nella chat.
