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
  - `unreadCount` da `src/hooks/useCoachAlerts.ts:149` (nessun conteggio nuovo).
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
  `src/hooks/useCoachAlerts.ts` — una riga additiva (`isError`), motivazione nel commit `1dc5981` e in
  §9.
- **Fuori dalla lista attesa della spec, approvati da Nick prima dell'esecuzione:** `src/index.css`
  (unica sede coerente per i token, v. §7) · `src/lib/coachAlerts.ts` + test (per rendere il requisito
  falsificabile da vitest invece che a occhio) · `scripts/verify-css-tokens.mjs` (richiesta di Nick
  all'OK: la sonda diventa una prova committata, non un controllo manuale).

## 4. Acceptance (criteri falsificabili — ognuno può bocciare)

- ☑ Con avvisi di sistema non letti, la Centrale Operativa **non** dice «Tutto sotto controllo» —
  e nemmeno mentre la query carica o quando **fallisce** (regola pura `canReassure`, 11 test; tre
  mutazioni provate e uccise, una per termine della condizione).
- ☑ Le 10 classi di gravità compaiono nel CSS costruito: `npm run build && npm run verify:css`.
  Lo stesso script sul CSS di `main` pre-fix esce 1 elencandole tutte.
- ☑ Le 5 variabili restano in forma a canali, dentro `:root`, e nessun sorgente le riscrive a
  runtime: due mutazioni provate e uccise (riga `setProperty` nel provider · `hsl()` completo in
  `index.css`).
- ☑ `no-custom-classname` attiva e provata: `bg-inventata-di-prova` iniettata in `CoachHome` viene
  segnalata (356:14), poi rimossa.
- ☑ `npx tsc --noEmit -p tsconfig.app.json` verde · `npx vitest run` 181/181 ·
  eslint 105 = `.eslint-baseline` (salito una volta sola, elenco nel commit `chore(varco)`) ·
  `npm ci` esce 0 e il conteggio resta 105 da `node_modules` vergine.
- ☑ `git diff --name-only main..HEAD`: zero file sotto `supabase/`.
- ☑ **Aperta dalla review, chiusa con deroga** (`1dc5981`): con la query degli avvisi **in errore** il
  coach non legge più l'all-clear — il widget dichiara che il canale è caduto. Vedi §9.

## 5. Verifica (come si controlla, non a memoria)

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build && npm run verify:css
npx eslint . -f json | node -e "…" # conteggio errori == .eslint-baseline
git diff --name-only main..HEAD
```

## 6. Chiusura

- 7 commit atomici su `claude/leggibilita-gravita-coach`. Gli ultimi tre nascono dalla review
  indipendente, non dal piano.
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

- **I 537 modificatori di opacità morti** su token `var()` (chip aperta). La domanda che accompagna la
  chip: quante di quelle superfici portano un significato clinico o di gravità?
- **`chart-1..5` mai mappati** (23 occorrenze): sono i colori delle analytics del coach, gauge ACWR
  compreso. Emersi dalla regola nuova, non corretti, elencati nel commit `chore(varco)`.
- `secondary-container` / `on-secondary-container` / `on-primary` mai mappati (6 occorrenze).
- Non riconcilia le due fonti (`urgentAlerts` client-side e `coach_alerts` server-side): le fa smettere
  di contraddirsi, non le unifica.
- `scripts/verify-css-tokens.mjs` **non è agganciato alla CI** (chip aperta): il job web non fa
  `npm run build` e `lint-staged` esegue solo prettier, quindi oggi è un cancello che _si può_ eseguire,
  non uno che _viene_ eseguito. `.github/**` è vietato in questa fetta.
- **La pill `high` del pannello §0 resta senza sfondo** (`CoachAlertsPanel.tsx:71`,
  `bg-destructive/10`, verificata assente dal CSS costruito). Richiederebbe `--destructive` in forma a
  canali, che romperebbe `MaterialYouProvider.tsx:538` — il BRIDGE ci scrive un `hsl(...)` completo a
  runtime. È l'unico pezzo della scala di gravità che resta spento.
- **Il commento in `CoachAlertsPanel.tsx:61-62`** («`error-container` is not a key in
  `tailwind.config.ts`, nor a CSS var in `index.css`») è reso **falso** da questa fetta. File vietato:
  non corretto qui, chip aperta — un prossimo agente ci si fida.
- Il bullet nuovo è **cieco alla severità**: `unreadCount` conta anche i `low`, quindi un avviso di
  bassa priorità sopprime l'all-clear. Direzione conservativa e coerente col §0, dichiarata qui.

## 9. Il ramo errore — trovato dalla review, chiuso con deroga esplicita

`canReassure` distingueva «sto caricando» da «ho zero non letti», ma **non** «la query è fallita».
In TanStack v5 con la query in errore: `isLoading` è `false` (`isPending && isFetching`), `data` è
`undefined` → `alerts: []` → `unreadCount = 0` → il coach tornava a leggere «Tutto sotto controllo». E
`src/main.tsx:18-24` ha `retry: false` sui 4xx, quindi un errore RLS su `coach_alerts` ci arriva al
primo tentativo, senza ritentare. Stessa falsità della fetta, sul ramo errore invece che sul ramo
caricamento.

Chiuderlo richiedeva una riga in `src/hooks/useCoachAlerts.ts`, **file vietato dalla spec**. Deroga
concessa da Nick con la motivazione agli atti nel commit `1dc5981`: _il veto su quel file serviva a
tenere stretta la fetta, non a proteggere un invariante; lasciare che il coach legga l'all-clear quando
la query è in errore sarebbe chiudere la porta d'ingresso della bugia e lasciarne aperta una sul
retro._ Additivo, fail-closed, nessun consumatore esistente cambia.

I tre input di `canReassure` sono **obbligatori**, non opzionali: un campo opzionale lascerebbe che un
chiamante lo ometta e torni a rassicurare per default, cioè il modo esatto in cui il buco è nato. Il
modo di fallire di quella funzione dev'essere il silenzio. Quando il canale è caduto il widget lo
dichiara («Non riesco a leggere gli avvisi dal sistema. Ricarica la pagina.») invece di fingere di
stare ancora controllando.

**Regola generale che ne esce:** quando un veto di scope e il requisito della fetta confliggono,
decide il requisito — e la ragione si scrive nel commit, non nella chat.
