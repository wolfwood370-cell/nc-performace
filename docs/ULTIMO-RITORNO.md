# ULTIMO RITORNO — fetta rimando-modello-impegno

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git.
> Fetta: `claude/rimando-modello-impegno` · 2026-09-05 · base `origin/main` = `6930a7a`.
> Un solo intervento: `CLAUDE.md` §8 guadagna il capoverso **Modello e impegno** — default, due
> scale, chi fa il cambio, e il rimando alla casa della regola, che sta **fuori da questo repo**.
> Il criterio che fa salire il livello **non è entrato**: è il punto dell'esercizio.

## 1. Ramo e commit

- Ramo: `claude/rimando-modello-impegno`, da `origin/main` = `6930a7a`.
- Worktree: `.claude/worktrees/rimando-modello-impegno`.
- **Un commit solo.** L'hash del commit che contiene questo file non può starci dentro: è il tip del
  ramo (`git log --oneline -1 claude/rimando-modello-impegno`), riportato nel messaggio di chiusura
  e nella PR.

## 2. I quattro grep dell'acceptance

Eseguiti nel worktree, su `CLAUDE.md` dopo la modifica:

```
$ grep -c 'due di questi tre tratti\|Basso · Medio · Alto · Extra · Max.*irreversibile\|si moltiplica' CLAUDE.md
0
$ grep -c 'ISTRUZIONI-APP-v8.md' CLAUDE.md
1
$ grep -c 'FUORI da questo repo' CLAUDE.md
1
$ grep -c 'Basso · Medio · Alto · Extra · Max' CLAUDE.md
1
```

I primi tre sono l'acceptance §2 e §3. Il quarto è il controllo che i due grep non si confondano: la
**scala nuda** c'è (è il default), il **criterio** no.

E la §4, i file toccati:

```
$ git diff --name-only origin/main..HEAD
CLAUDE.md
docs/ULTIMO-RITORNO.md
```

## 3. Le righe — `sed -n '175,190p' CLAUDE.md`

```
## 8. Tu, agente AI

Sei un ingegnere senior specializzato React/TS + Aura design + Supabase (Postgres/Edge/RLS).

**Modalità**: la sessione parte in plan mode per configurazione (`.claude/settings.json:3`) — pianifichi, non scrivi, finché Nicolò non approva. Approvato il piano: safest-path autonoma. **La regola completa, e la sua precedenza, stanno in §5: quella è l'unica casa. Qui non è ripetuta di proposito.**

**Modello e impegno**: default **Opus** a impegno **Alto**. Le scale sono impegno **Basso · Medio · Alto · Extra · Max** e modello **Fable 5.1 · Opus 5 · Sonnet 5 · Haiku 4.5**; il cambio lo fa Nicolò dal selettore — l'agente non lo vede, quindi quando dichiara un livello sta **raccomandando**, non leggendo. **Prima di cominciare un lavoro** si dice, in quest'ordine, se serve cambiare (1) l'impegno e (2) il modello, anche quando la risposta è «nessun cambio». **Il criterio che fa salire il livello, e la regola completa, stanno nel §8 di `ISTRUZIONI-APP-v8.md`, che vive nella cartella docs di Nicolò — FUORI da questo repo, in un altro repository: non cercarlo qui e non provare ad aprirlo. Quella è l'unica casa. Qui non è ripetuta di proposito.**

**Output style**: tabelle > paragrafi. `file:line` > frasi vaghe. Conciso, no filler.

**Lingua**: italiano sempre nelle risposte e nei commit. Inglese nei code comments.

**Quando chiudi una fetta**: push del ramo `claude/<slug>` + PR verso `main` coi 2 check obbligatori verdi; il merge dalla PR lo fa Nicolò. Vedi `00-CORE.md §6.4`.

---
```

Il capoverso è **byte-identico** a quello del prompt (inserito da script, non a mano) e sta fra
`**Modalità**` e `**Output style**`, separato da righe vuote come gli altri. `prettier --check
CLAUDE.md` passa senza riscrivere nulla: `proseWrap` è `preserve`, la riga lunga resta una riga.

## 4. I cinque cancelli — tutti come su `main`

| Cancello     | Esito                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| `tsc`        | 0 errori (`npx tsc --noEmit -p tsconfig.app.json`)                               |
| `vitest`     | **572 test / 53 file**, tutti verdi                                              |
| `eslint`     | **64 errori**, 14 warning = baseline                                             |
| `build`      | `✓ built in 10.64s`                                                              |
| `verify:css` | **243/243** classi con modificatore di alpha; 18/20 attese, 2 note non bloccanti |

Nessun codice toccato: era l'atteso. `verify:css` va lanciato **dopo** `npm run build` (legge
`dist/assets`), altrimenti si ferma con «`dist/assets` non esiste» — non è un fallimento.

## 5. Il gemello in `COWORK.md`: sì, credo serva — e NON l'ho fatto

Il capoverso parla di una cosa che riguarda **entrambe le corsie**: il selettore modello/impegno lo
usa Nicolò anche quando apre una sessione Cowork, e `COWORK.md` è il manuale operativo di quella
corsia esattamente come `CLAUDE.md` lo è di questa. Oggi in `COWORK.md` non c'è nulla del genere: un
agente Cowork non ha modo di sapere che il rituale «prima di cominciare si dichiara impegno e
modello» lo riguarda.

**Ma non l'ho scritto**, come da prompt: aggiungere un terzo posto dove vive la stessa cosa è una
decisione tua, non mia. Se lo vuoi, la forma pulita è la stessa di qui — default + scale + chi fa il
cambio + rimando a `ISTRUZIONI-APP-v8.md` §8 come unica casa — e resta una fetta separata di un
capoverso solo.

## 6. Nota sul primo puntatore che esce dal repo

Fino a oggi né `CLAUDE.md` né `COWORK.md` puntavano a qualcosa fuori dal repo (misura di Cowork:
`grep -c '\.\./\|Coworks\|NC App Development'` → 0 e 0). Questo è il primo, ed è scritto per esserlo:
nomina il file, dice che sta nella cartella docs, dice che è **un altro repository**, e vieta
esplicitamente di cercarlo qui. Non c'è percorso relativo — di proposito: un percorso relativo dal
checkout di `nc-performace-hub` sarebbe una bugia che un agente proverebbe ad aprire.

## 7. Il rituale applicato a questa fetta stessa

Il capoverso appena scritto chiede di dichiarare, prima di cominciare, se serve cambiare impegno e
modello. Per questa fetta: **impegno — nessun cambio** (un capoverso verbatim in un `.md`, il rischio
è la fedeltà del testo, non la profondità del ragionamento); **modello — nessun cambio**, Opus.

## 8. PR

Ramo pushato su `origin`. Link per aprire la PR verso `main`:
<https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/rimando-modello-impegno>
