# ULTIMO RITORNO — fetta rpe-difendibile (B-22)

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/rpe-difendibile` · 2026-08-25 · base `origin/main` = `f944e25` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/rpe-difendibile) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/rpe-difendibile`, da `f944e25`, 1 commit di codice + il commit dei documenti (tip del ramo):
`37ab739` — un intervento solo, perché modulo e controllo sono la stessa cosa: scala completa e
deviazioni dichiarate nel modulo, slider senza cursore posato, scheda «Come si valuta?», test.

## 2. Manifesto

**NUOVI:** `src/components/athlete/SessionRpeGuide.tsx` (la scheda di familiarizzazione — il
prerequisito che la fonte dichiara, sempre raggiungibile, mai forzata, mai memorizzata).

**MODIFICATI:** `src/lib/effort/sessionRpe.ts` (ancore complete, tre deviazioni in testa, testi
della scheda) · `src/pages/athlete/PostWorkoutDebrief.tsx` (slider + scheda al posto dei pallini) ·
`src/lib/effort/__tests__/sessionRpe.test.ts` e
`src/pages/athlete/__tests__/PostWorkoutDebrief.boundary.test.ts` (riscritti sul contratto nuovo)
· `docs/HANDOFF.md` · `docs/auto-miglioramento.md` · questo file (commit docs separato e
dichiarato, come da prassi).

**NEL PERIMETRO MA NON TOCCATI:** `src/hooks/athlete/useAthleteWorkoutHooks.ts` (**vietato** — il
percorso del dato è chiuso dal 24/08: il diff lo conferma) · `src/lib/math/acwr.ts` · `supabase/**`
· `types.ts` · le bandiere · `PostWorkoutDebrief.render.test.ts` (regge invariato: asserisce gli
hero, non la scala).

## 3. Le due prove dei permessi (repo di scarto in scratchpad)

- `git reset --hard HEAD` → **RIFIUTATO** («Permission to use Bash with command … has been denied») · `git rebase HEAD~1` → **RIFIUTATO**.
- Vicini passati: `git status -sb` → `## master` · `git log --oneline -1` → `cbfde72 commit di prova`.

## 4. COME NASCE E COME SI REVOCA IL VALORE

1. **Stato iniziale = nessun valore.** `PostWorkoutDebrief.tsx:309` `useState<SessionRpe | null>(null)`; con `null` lo slider non rende né pollice né riempimento e `aria-valuenow` NON esiste (`:224`, `value ?? undefined`); la didascalia è il prompt di vuoto. Un range nativo ha sempre un pollice — perciò il controllo è custom: un pollice posato È una risposta preselezionata (CORE §0.8).
2. **Il primo gesto — puntatore:** pressione o trascinamento sulla traccia (`handlePointerDown` `:156`, con `setPointerCapture`; drag in `handlePointerMove` con `e.buttons`) → passo intero più vicino via `valueFromPointer` (`:142`, sullo STESSO span del pollice — costante condivisa `RPE_THUMB_PX`, `:114`: rilievo di review chiuso, v. §8.7).
3. **Il primo gesto — tastiera:** da vuoto QUALUNQUE freccia parte da **1** (`:173` e `:177` — si parte dal fondo della scala e si sale; dichiarato, v. §8.3); poi frecce ±1, Home→1, End→10. `aria-valuetext` annuncia «N — ancora».
4. **La revoca:** bottone «Rimuovi risposta» (`:291`, visibile solo con un valore scelto) oppure **Canc/Backspace** sullo slider (`:185-187`) → `null`. È la forma equivalente del vecchio secondo-tocco sulla pill, dichiarata qui.
5. **Il salvataggio:** il valore (o `null`) viaggia invariato — `PostWorkoutDebrief.tsx:343` `srpe: rpe` → `useFinishSessionMutation` (file vietato, non toccato) → `workout_logs.srpe`.

## 5. DOVE VIVE OGNI STRINGA — tutte in `src/lib/effort/sessionRpe.ts`

| testo                                                        | export (riga)                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Le dieci ancore (1-5, 7, 10 da Foster; **6/8/9 nostre**)     | `SESSION_RPE_ANCHORS` (`:47`), marcatura `SESSION_RPE_OWN_ANCHORS = [6,8,9]` (`:62`)                                                                                                             |
| Titolo e domanda                                             | `SESSION_RPE_TITLE` (`:65`) · `SESSION_RPE_QUESTION` (`:66`)                                                                                                                                     |
| «valutazione globale, non la media delle serie»              | `SESSION_RPE_DEFINITION` (`:69`)                                                                                                                                                                 |
| Avvertenza sul momento (finestra di normalizzazione)         | `SESSION_RPE_TIMING` (`:73`)                                                                                                                                                                     |
| «confrontarti con te stesso nel tempo»                       | `SESSION_RPE_COMPARABILITY` (`:78`)                                                                                                                                                              |
| Stato vuoto: «Non risposto» · prompt della traccia           | `SESSION_RPE_UNANSWERED` (`:84`) · `SESSION_RPE_EMPTY_PROMPT` (`:85`)                                                                                                                            |
| Nome accessibile dello slider                                | `SESSION_RPE_SLIDER_LABEL` (`:88`)                                                                                                                                                               |
| «Rimuovi risposta»                                           | `SESSION_RPE_CLEAR_LABEL` (`:102`)                                                                                                                                                               |
| «Come si valuta?» + i due esempi (riancorati a 3-4 e 7-8)    | `SESSION_RPE_GUIDE_TITLE` (`:106`) · `SESSION_RPE_EXAMPLES` (`:112`)                                                                                                                             |
| Il trattino dell'assenza (superfici coach)                   | `SESSION_RPE_ABSENT` (`:99`)                                                                                                                                                                     |
| Le tre etichette per screen-reader (sezione, ancore, esempi) | `SESSION_RPE_SECTION_LABEL` (`:93`) · `…_GUIDE_ANCHORS_LABEL` (`:94`) · `…_GUIDE_EXAMPLES_LABEL` (`:95`) — spostate qui dal rilievo di review: il contratto non distingue occhio e screen reader |

Le TRE deviazioni da Foster (1-10 non 0-10 · domanda subito · ancore estese) sono dichiarate nel
commento di testa del modulo con le ragioni ratificate, insieme ai due limiti di affidabilità
della fonte (familiarizzazione prerequisito; r = 0.25-0.52 nel resistance training). Un test legge
i SORGENTI dei due componenti e prova che nessuna di queste stringhe vi abita.

## 6. Acceptance — comando e output

1. 🔴 **Prova rossa sul preselezionato** → §7: al primo render `aria-valuenow` è assente e la didascalia è il prompt di vuoto; salva senza toccare → `srpe = NULL` nel payload UPDATE (harness invariato: client mockato, mutation vera).
2. **La revoca:** test «la revoca: “Rimuovi risposta” torna a non risposto → NULL (e Canc fa lo stesso)» — scelto 7 → revocato → `aria-valuenow` assente → salva → `null`; controllo positivo nello stesso file (scelto 8 → `srpe = 8`, `rpe_global` mai scritto).
3. **Una parola alla volta:** `it.each([3, 6, 9])` — didascalia ESATTAMENTE `N — ancora` e nessuna ancora d'altri gradini nel testo visibile (scheda chiusa); più `aria-valuetext` = «6 — Decisamente impegnativo». Due dei tre valori (6, 9) sono ancore nostre.
4. **Il colore non giudica:** `sed -n '/^function RpeSelector/,/^}/p' PostWorkoutDebrief.tsx | grep -inE "destructive|success|warning|red|amber|green|emerald|sky"` → **exit 1 (zero match)**; idem sul file della scheda. La rampa è UNA tinta (`brand-container`) con opacità crescente col valore.
5. **La scheda viene dal modulo:** test che la apre e trova TUTTE e dieci le ancore + avvertenza + esempi + confrontabilità; e test `fs` sui sorgenti dei due componenti → nessuna stringa-campione della scala vi compare.
6. **I CINQUE gate sul tip:** `tsc --noEmit` exit 0 · `vitest run` → **407 passed (407) su 38 file** exit 0 (baseline misurata su `f944e25` nel worktree pulito: **402/38 esatta**; modulo 5→6, confine 7→11) · `eslint .` → **81 errori** (= baseline) · `npm run build` exit 0 · `npm run verify:css` exit 0 (20/20). Ri-verificati da `code-test-verifier` in contesto proprio.
7. **Perimetro:** `git diff origin/main..HEAD --stat` → 5 file di codice (+527/−158) + i 3 docs nel commit finale, tutti nel §2.

## 7. La prova rossa (sul tip, ripristino per copia + `cmp` byte-identico)

Cursore posato reintrodotto (`useState<SessionRpe | null>(5)`):

```
FAIL … al primo render nessun valore è selezionato: niente aria-valuenow, prompt di vuoto
AssertionError: valore comparso senza che nessuno l'abbia scelto: expected '5' to be null
- Expected: null    + Received: "5"
FAIL … salvare senza toccare lo slider → la UPDATE porta srpe = NULL
AssertionError: non risposto resta NULL: expected 5 to be null
```

Il rosso dice QUALE valore è comparso senza che nessuno l'abbia scelto. Ripristino: `cp` +
`cmp` → `CMP_IDENTICO`, suite completa exit 0 (407/407).

## 8. Non fatto / divergenze (file:riga)

1. **Le tre ancore nostre restano quelle ratificate** — nessuna mi sembra sbagliata: la famiglia è monotòna, la coppia terminale «Quasi massimale/Massimale» specchia il metodo, e il criterio anti-Talk-Test regge. Se Nicolò ne cambia una, si cambia nel modulo e cambia ovunque.
2. **I due esempi della Lezione 8 sono RIANCORATI, non citati:** gli originali («6 Moderato», «8-9 Alto») portano le parole che Foster mette altrove — riancorarli a 3-4 e 7-8 è la direzione ratificata il 24/08 (`SESSION_RPE_EXAMPLES`, `sessionRpe.ts:105`). La Lezione 8 nel repo del corso resta a Nicolò.
3. **Decisione dichiarata — da vuoto la tastiera parte da 1** (`PostWorkoutDebrief.tsx:163,167`): un primo gesto deterministico serve, e partire dal fondo della scala («sali finché non ti riconosci») è l'opzione senza pretese di media; partire da 5 sarebbe stato un default travestito.
4. **Decisione dichiarata — il riempimento ha un minimo visivo** (`max(frazione%, 2.75rem)`, `:236`): a valore 1 la capsula del pollice resta visibile; il minimo è geometria, non semantica (il valore resta 1).
5. **Il percorso puntatore non è esercitabile in jsdom** (getBoundingClientRect = 0): i test passano dalla tastiera, che è essa stessa contratto (invariante 5). Il gesto di trascinamento va visto a occhio nell'ultimo miglio.
6. **«Seleziona un valore» è diventato `SESSION_RPE_EMPTY_PROMPT`** («Trascina o tocca la scala per rispondere», `sessionRpe.ts:85`): la vecchia stringa viveva nel componente — spostarla nel modulo E aggiornarla al gesto nuovo è parte del criterio «ogni stringa dal modulo».
7. **Passata indipendente (code-reviewer + aura-theme-auditor + code-test-verifier): 2 riparazioni + 2 decisioni, tutte chiuse nel commit di codice (ammendato, ramo mai pushato).** Reviewer: (a) la mappatura del puntatore era su `[0, W]` mentre il pollice viaggia sull'inset `[18px, W−18px]` — agli estremi, su viewport strette, il tap sul centro del pollice leggeva un altro valore → puntatore mappato sullo STESSO span con costante condivisa `RPE_THUMB_PX` (`PostWorkoutDebrief.tsx:114,142`); (b) la riscrittura del boundary test aveva tolto senza sostituto i pin `duration_seconds`/`status` al seam → ripristinati; (c) tre etichette AT vivevano nei componenti → spostate nel modulo (v. §5); (d) `SESSION_RPE_OWN_ANCHORS` senza consumatori UI → **decisione dichiarata**: la marcatura delle tre ancore nostre è per il modulo, il corso e chi mantiene — non per l'atleta, a cui la provenienza è rumore; il consumatore-contratto è il test del modulo che la inchioda. Aura-auditor: hex raw nel file NUOVO della scheda → sostituito con `border-outline-variant/30`; l'ombra rgba del pollice RESTA e si dichiara — replica l'esatta rgba della pill rimossa, idioma preesistente del file, dentro il debito-tema athlete già tracciato per la fetta dedicata (RETRO home-atleta).
8. **Deviazione ARIA dichiarata:** `aria-valuenow` è assente quando non c'è valore — ARIA 1.2 lo vorrebbe sempre presente su `role="slider"`, ma un valuenow inventato sarebbe esattamente il preselezionato che CORE §0.8 vieta; mitigato da `aria-valuetext="Non risposto"`. Se un audit axe lo segnalerà, la risposta è questa riga.
9. **`SESSION_RPE_ABSENT` resta senza consumatori in produzione** (le superfici coach di B-22 usano il literal «—»): incoerenza preesistente di ieri, da ricablare quando una fetta tocca quelle superfici — non questa.

## 9. Resta a Nicolò

- **Merge della PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/rpe-difendibile).
- **L'ultimo miglio dal debrief, a occhio:** chiudere una seduta → traccia VUOTA senza pollice; trascinare → il pollice nasce sotto il dito, il colore scurisce salendo, sotto compare UNA parola; «Rimuovi risposta» → si torna al vuoto; «Come si valuta?» → la scala intera con i due esempi; salvare senza toccare → sulla scheda coach «RPE sessione —».
- **Le tre parole nostre** (6/8/9) e i due esempi riancorati: veto o benedizione — si cambiano nel modulo, cambiano ovunque.
- **La Lezione 8 del corso** (`repos/nc-education`) da riallineare a Foster — ora il prodotto ha la scala completa che il corso dovrà specchiare.
