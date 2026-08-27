# ULTIMO RITORNO — fetta alpha-vivi

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/alpha-vivi` · 2026-08-27 · base `origin/main` = `f0244ca` (la stessa della misura
> Cowork del 27/08) · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/alpha-vivi)
> — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/alpha-vivi`, da `f0244ca`, 2 commit di codice + il commit dei documenti (tip del ramo):

- `ef24798` — la conversione: 69 dichiarazioni a canali, 46 voci config wrapped, bridge del
  provider a canali nudi, 57 usi diretti avvolti, la scala di CoachHome riparata intera,
  le `/8` fuori scala → `/[0.08]`, baseline eslint 81→65.
- `b2853cd` — il check 7 derivato nel gate + la passata anti-rewrap del check 4.

## 2. Manifesto

**NUOVI:** nessuno.

**MODIFICATI (20):** `src/index.css` (69 dichiarazioni `hsl(X)`→`X`; 7 usi interni →
`hsl(var(--x))`, `color-mix` scrollbar compreso; 2 commenti aggiornati) · `tailwind.config.ts`
(46 voci `"var(--x)"` → `"hsl(var(--x) / <alpha-value>)"`; commenti) ·
`scripts/verify-css-tokens.mjs` (check 7 + estensione check 4 + header) ·
`src/providers/MaterialYouProvider.tsx` (bridge: 19 `setProperty` da `hsl(${t.x})` a `t.x` nudo) ·
i 10 file con usi diretti avvolti: `OverviewTab.tsx`(4) `AthleteDetail.tsx`(18) `sidebar.tsx`(2)
`VolumeIntensityChart.tsx`(4) `VelocityTrendChart.tsx`(9) `StrengthChart.tsx`(2)
`NutritionAdherenceCard.tsx`(5) `MetabolicChart.tsx`(4) `CoachBottomNav.tsx`(1) `Confetti.tsx`(1) ·
`CoachHome.tsx` (coppia `tertiary-fixed` → `tertiary-container`) · `AthleteCard.tsx`,
`NutritionHero.tsx`, `AthleteDashboard.tsx`, `AthleteTraining.tsx` (`/8` → `/[0.08]`) ·
`.eslint-baseline` (81→65) · `docs/HANDOFF.md` · `docs/auto-miglioramento.md` (RETRO) · questo file.

**NEL PERIMETRO MA NON TOCCATI:** `vite.config.ts` (vietato, intatto) · `supabase/**`, `types.ts`,
`acwr.ts`, `sessionRpe.ts`, `src/lib/program/**`, `src/main.tsx` (vietati, intatti) · i token
`--nc-*` athlete (hex, non esposti dal config — v. §6) · `EXPECTED` e `CHANNEL_VARS` del gate
(invariante 3: intatte, ridondanza voluta col check 7).

**Perimetro ESTESO rispetto al prompt (dichiarato, il contratto vince sulla lista file):**
`MaterialYouProvider.tsx` — il bridge riscrive a runtime 19 delle variabili convertite in
`hsl(...)` completa (`tailwind.config.ts:168` lo documentava): senza la riscrittura a canali ogni
tinta sarebbe morta al primo mount del provider, contratto (b) violato a runtime. ·
`CoachHome.tsx:185-186` — `bg-tertiary-fixed/20`+`text-tertiary-fixed` su token MAI definito:
irrisolvibile per conversione, il check 7 sarebbe rosso; mappata sulla famiglia
`tertiary-container` gemella del gradino critical della stessa scala (o si ripara la scala intera
o si dichiara — Fragilità #6; l'auditor tema conferma coerenza). · `AthleteCard.tsx:420`,
`NutritionHero.tsx:54`, `AthleteDashboard.tsx:400`, `AthleteTraining.tsx:359` — `/8` non è nella
scala opacity di Tailwind (misurato: 0 regole `/8`, 7 regole `/15` nel CSS emesso): morte per la
scala, non per il token; `/[0.08]` conserva l'8% inteso. · `.eslint-baseline` — la CI stessa
prescrive «Lint migliorato (65 < 81). Abbassa .eslint-baseline a 65 nello stesso commit».

## 3. Le prove dei permessi (repo di scarto in scratchpad)

1. `git reset --hard HEAD~1` → **RIFIUTATO** («Permission … has been denied») · `git rebase HEAD~1` → **RIFIUTATO**.
2. I vicini passano: `git status -sb` → `## master` · `git log --oneline -2` → 2 commit stampati.
3. ⚠️ La forma `git -C <percorso> rebase HEAD~1` → **PASSATA** (eseguita davvero: «Current branch
   master is up to date», no-op innocuo nel repo di scarto). Il matcher della cintura locale non
   copre `-C`/`--git-dir` — buco già chip-flaggato il 25/08, ora rimisurato.

## 4. Il conteggio prima e dopo

Misura sul CSS EMESSO, scanner Node con lo stesso `findRule` del gate (mai one-liner shell):

|                       | classi con alpha distinte | morte   | usi morti | file |
| --------------------- | ------------------------- | ------- | --------- | ---- |
| **PRIMA** (`f0244ca`) | 238                       | **139** | 518       | 86   |
| **DOPO** (tip)        | 238                       | **0**   | 0         | 0    |

**Copertura dichiarata: 238 su 238.** Controllo positivo `bg-amber-500/10` emessa in entrambi;
controllo negativo `bg-accent/30` assente PRIMA, emessa DOPO. ⚠️ La misura **corregge** la
234/110/366/77 di Cowork (per difetto: mancavano i prefissi `ring-`, `from-`, `to-`, `via-`,
`divide-`, `shadow-`, `stroke-`, `fill-`). Delle 139: 134 morte per token nudo, 4 per `/8` fuori
scala opacity (2 cause diverse, 2 rimedi diversi), 1 (`bg-tertiary-fixed/20`) per token inesistente.

## 5. La prova che nessun colore è cambiato — sui colori risolti

**Livello 1 — comparatore sui due CSS emessi** (`confronta-colori.mjs`, scratchpad): parsing in
regole, variabili convertite DERIVATE dai fogli (46: colore completo prima, canali dopo — il
minificatore aveva già compresso le `hsl()` in hex, il confronto è su rgba normalizzati),
risoluzione ricorsiva delle `var()` nei due scope `:root`/`.dark`:

```
Variabili convertite (derivate dai due CSS): 46
Dichiarazioni confrontate a colore identico: 90    (46 light + 44 dark; le 2 restanti in §9.1)
Regole referenzianti confrontate (colori risolti, 2 scope): 155 — tutte identiche
Altre regole byte-identiche: 1275
Selettori rinominati dal wrap hsl() (arbitrary values), colori confrontati: 3 — identici
Selettori SOLO nel prima: 0 · SOLO nel dopo: 165 (164 classi con alpha resuscitate
  + .text-on-tertiary-container, nuova per la riparazione della scala di CoachHome)
```

**Livello 2 — browser vero** (Chrome del pane, mini-server statico, `getComputedStyle` sulle due
pagine-sonda che caricano il CSS prima/dopo):

```
non-alpha su token convertiti — IDENTICI byte per byte:
  bg-card rgb(255,255,255)=rgb(255,255,255) · bg-primary rgb(0,53,97)= · bg-surface-container
  rgb(219,239,255)= · text-muted-foreground rgb(64,71,79)= · border-border rgb(194,200,209)= ·
  dark: bg-card rgb(2,8,23)=
resuscitate — da rgba(0,0,0,0) alla tinta INTESA:
  bg-surface-container/40 → rgba(219,239,255,0.4) · bg-primary/10 → rgba(0,53,97,0.1) ·
  bg-accent/30 → rgba(179,221,255,0.3) · bg-destructive/[0.08] → rgba(187,27,27,0.08) ·
  dark bg-primary/10 → rgba(109,40,217,0.1)
caso-confine: hsl(207 100% 95%) → rgb(230,244,255) = #e6f4ff  (identici anche qui, v. §9.1)
```

I gradient `--tw-gradient-to` passano da `transparent` a `hsl(var(--x) / 0)`: alpha 0 ≡ alpha 0
a schermo (interpolazione premoltiplicata) — dichiarato, non nascosto dal comparatore.

## 6. I token convertiti

**Convertiti (46, tutti quelli che il config espone come `var()` nuda):** background, foreground,
card±fg, popover±fg, primary±fg, secondary±fg, muted±fg, accent±fg, destructive±fg, warning±fg,
success±fg, border, input, ring, outline, outline-variant, on-surface-variant,
surface-container-{lowest,low,∅,high,highest}, primary-container, on-primary-container,
inverse-{surface,on-surface,primary}, tertiary±fg, sidebar-{background,foreground,primary,
primary-foreground,accent,accent-foreground,border,ring}. Tutti erano `hsl(H S% L%)` a sintassi
spazi: conversione testuale pura, zero valori riscritti.

**NON convertiti, col perché:** `--nc-*` (6, hex `#...` in `.theme-athlete`) — non esposti dal
config, usati nudi dal namespace athlete: fuori dal criterio della fetta, e l'auditor conferma che
un wrap `hsl()` li avrebbe rotti · famiglia error (3), tertiary-container (2), chart (14) — già a
canali (i «18 vivi» della misura) · `--radius`, `--sidebar-width{,-collapsed}` — non colori ·
`brand`/`surface`/`on-surface` del config — hex letterali con alpha nativa già funzionante.
**Nessun token è risultato inesprimibile a canali** (niente hex-con-alpha né oklch): la clausola
di stop non è scattata.

## 7. Acceptance — comando ed esito

1. 🔴 **139 morte → 0**: `node misura-alpha.mjs . <dist> …` → «vive 238 · MORTE 0» — **238 su 238** (§4).
2. 🔴 **Nessun colore cambia, sui colori risolti**: comparatore + browser (§5) — zero differenze
   con superfici; l'unica voce a margine è `--inverse-on-surface`, chiusa in §9.1.
3. **Check 7 derivato**: `git diff origin/main..HEAD -- scripts/verify-css-tokens.mjs` — le
   uniche costanti nuove sono `ALPHA_CLASS_RE` (un regex), `hslWrappedVars`/`HSL_WRITE_RE`
   (derivate dal foglio costruito) e le mappe riempite scandendo `SOURCE_FILES`; `EXPECTED` e
   `CHANNEL_VARS` senza una riga di diff. Il check passa dal `findRule` condiviso di check 2/5.
4. 🔴 **Prova rossa**: doppia, col token nominato — incollata in §8.
5. **Usi diretti sotto il check 6**: `npm run verify:css` → «check 6: 0 usi su variabile-colore
   completa / **68 corretti**» (erano 18 prima della fetta: +50 avvolti dal codemod).
6. **I 5 gate** (rieseguiti anche dal code-test-verifier in contesto proprio, exit code nudi):
   `npx tsc --noEmit -p tsconfig.app.json` → 0 · `npx vitest run` → **442/442 in 44 file** ·
   `npx eslint .` → errorCount **65 = baseline 65** (81→65, v. §9.3) · `npm run build` → 0 ·
   `npm run verify:css` → 0, «check 7: **238/238**».
7. **Perimetro**: `git diff origin/main..HEAD --stat` → 20 file, tutti nel manifesto §2 (le 6
   estensioni dichiarate col perché).

## 8. La prova rossa (ripristino per copia + `cmp`, mai `git checkout --`)

**Rosso B — revert parziale** (solo `index.css`: `--surface-container` riportata a
`hsl(207 100% 93%)`), build, `npm run verify:css`:

```
✗ check 7: 232/238 classi con modificatore di alpha trovate nei sorgenti emesse e a canali
- bg-surface-container/40 — scritta in src/components/athlete/workout/SessionExerciseList.tsx:132,
  regola emessa ma --surface-container è dichiarata «#dbefff», non a canali:
  hsl(var(--surface-container) / …) è CSS invalido — riporta --surface-container alla forma a
  canali in src/index.css          (+ altre 5, ognuna con classe, file:riga e token)
```

**Rosso A — revert completo** (anche `tailwind.config.ts` a `"var(--surface-container)"`):

```
✗ check 7: 232/238 …
- bg-surface-container/40 — scritta in src/components/athlete/workout/SessionExerciseList.tsx:132
  ma nessuna regola emessa: il token --surface-container è esposto dal config come var() nuda o
  non esiste — serve la coppia canali in src/index.css + hsl(var(…) / <alpha-value>) in
  tailwind.config.ts
```

**Verde dopo il ripristino** (cmp coi backup = identici, rebuild):
`✓ check 7: 238/238 … tutte emesse e a canali`.

## 9. Non fatto / divergenze

1. **`--inverse-on-surface` (hsl 207 100% 95%)**: il canale blu cade esattamente su 229.5 — il
   comparatore JS arrotondava 229, il minificatore 230. Chiusa empiricamente nel browser: Chrome
   risolve **rgb(230,244,255) = #e6f4ff, identici**; e comunque **nessuna regola emessa e nessun
   sorgente legge quel token** — superfici zero.
2. **Misura Cowork corretta**: 238/139/518/86, non 234/110/366/77 (§4) — «vince la tua misura».
3. **Attribuzione eslint 81→65 a livello di regola, non di file**: lo swap di massa dei 16 file
   base è stato negato dal classificatore; il residuo (12 errori `tailwindcss/no-custom-classname`)
   è coerente con le classi rese reali dalla fetta. La baseline a 65 è corretta in entrambe le
   ipotesi (la prescrive il ratchet stesso); la CI della PR farà da arbitro.
4. **Cintura locale**: `git -C <path> rebase` passa il matcher (§3) — chip già flaggata il 25/08.
5. **Rinvii ereditati intatti**: potatura di `EXPECTED` · debito-tema athlete (hex `#c0c7d0`,
   19 file, 22/08) · 72 trattini · `total_load_au` (prossima fetta dichiarata) · 31 query derivate.
6. Nota preesistente dell'auditor (fuori scope, identica a main): `text-tertiary-container` usato
   come colore-testo in `CoachHome.tsx:106` — token container come ink, rischio contrasto.

## 10. Resta a Nicolò

- **Merge della PR** ([crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/alpha-vivi))
  coi 2 check obbligatori verdi. POST-MERGE: nulla da applicare (publish FE, zero DB).
- **L'ultimo miglio a occhio**: le superfici dove l'alpha ora si vede — l'hover della riga di
  seduta (`hover:bg-surface-container/40`, il difetto che ha aperto la caccia), le tinte di
  severità della Centrale Operativa (critical E warning ora accesi insieme), i gradient hero
  dell'app atleta (`from-brand-container/[0.08]`), i badge `bg-primary/10` sparsi nel coach.
- La verifica dei colori risolti che Cowork ha dichiarato di voler rifare in un browser suo:
  le sonde e il metodo sono in RETRO (Migliorie #3).
