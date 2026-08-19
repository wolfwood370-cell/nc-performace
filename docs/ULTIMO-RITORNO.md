# ULTIMO RITORNO — fetta riallineamento-testi

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/riallineamento-testi` · 2026-08-18 · base `main` = `ce2db2e` · PR [#50](https://github.com/wolfwood370-cell/nc-performace/pull/50).

## 1. Ramo e commit

**Ramo**: `claude/riallineamento-testi` (worktree isolato) · **PR #50** aperta verso `main` (il merge resta a Nicolò) · 20 commit:

| Commit    | File                                       | Voci                                 |
| --------- | ------------------------------------------ | ------------------------------------ |
| `929da5d` | AGENTS.md                                  | R01 R02                              |
| `0797e09` | CLAUDE.md                                  | R03–R10                              |
| `d801c8d` | COWORK.md                                  | R11                                  |
| `17cb7fc` | eslint.config.js                           | R12                                  |
| `d61c496` | .husky/pre-commit                          | R13                                  |
| `b6c45a6` | .claude/agents/code-reviewer.md            | R14–R17                              |
| `848b27a` | .claude/agents/supabase-rls-auditor.md     | R18 R19                              |
| `8649e7f` | .claude/skills/backend-supabase/SKILL.md   | R20                                  |
| `acecfbd` | .claude/methodology/00-CORE.md             | R21–R24                              |
| `aa79bd9` | .claude/methodology/03-BACKEND-SUPABASE.md | R25–R28                              |
| `d48b1a1` | .claude/methodology/05-DEAD-CODE-AUDIT.md  | R29                                  |
| `57ba1b8` | docs/auto-miglioramento.md                 | R30 R31                              |
| `48ad9db` | docs/CLAUDE_CODE_SETUP.md                  | R32                                  |
| `b63820a` | docs/HANDOFF.md                            | R33 R34 + azioni §4 + stato fetta §0 |
| `47e4b94` | …/release/decide.ts                        | R35                                  |
| `4d02e1e` | …/intake/semaforo.ts                       | R36                                  |
| `becf08e` | docs/auto-miglioramento.md                 | RETRO                                |
| `62660d9` | 7 file                                     | rinumerazione post-review (v. §4)    |
| `56f22bb` | .audit-allowlist.json                      | eccezione morta rimossa (v. §6)      |
| —         | docs/ULTIMO-RITORNO.md                     | questo file                          |

## 2. Prove — prima / dopo

**Meccanismo a) commit-msg**: trailer con numero di modello → **exit 1** (atteso 1 ✓), trailer canonico → **exit 0** ✓. Il cancello morde: R29 provabile.

| Voce | PRIMA (rosso)                                                                               | DOPO (verde)                                                       |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R01  | assente / count 1                                                                           | r.41 / count 0                                                     |
| R02  | assente                                                                                     | r.45                                                               |
| R03  | assente                                                                                     | r.58                                                               |
| R04  | count 1 / assente                                                                           | count 0 / r.59                                                     |
| R05  | assente                                                                                     | r.71                                                               |
| R06  | assente                                                                                     | r.72                                                               |
| R07  | assente                                                                                     | r.109 / `defaultMode` r.111                                        |
| R08  | assente                                                                                     | r.120                                                              |
| R09  | assente                                                                                     | r.137                                                              |
| R10  | assente                                                                                     | r.179                                                              |
| R11  | count 1 / assente                                                                           | count 0 / r.17                                                     |
| R12  | count 1 / assente                                                                           | count 0 / r.46                                                     |
| R13  | count 1 / assente                                                                           | count 0 / r.3                                                      |
| R14  | assente                                                                                     | r.3                                                                |
| R15  | assente / count 1                                                                           | r.21 / count 0                                                     |
| R16  | assente                                                                                     | r.22                                                               |
| R17  | assente                                                                                     | r.23                                                               |
| R18  | assente / count 1                                                                           | r.3 / count 0                                                      |
| R19  | assente / count 1                                                                           | r.9 / count 0                                                      |
| R20  | assente                                                                                     | r.20 (esatto come atteso)                                          |
| R21  | assente                                                                                     | r.36                                                               |
| R22  | assente                                                                                     | r.42                                                               |
| R23  | assente                                                                                     | r.187 (esatto)                                                     |
| R24  | assente                                                                                     | r.327                                                              |
| R25  | assente                                                                                     | r.31                                                               |
| R26  | count 1 / assente                                                                           | count 0 / r.38                                                     |
| R27  | assente                                                                                     | r.709                                                              |
| R28  | assente / count 1                                                                           | r.723 / count 0                                                    |
| R29  | 2 occorrenze                                                                                | `git grep` sul tracciato = **0**; r.456 canonica (v. eccezioni)    |
| R30  | count 2 / assente                                                                           | **count 1** (v. eccezioni) / r.36                                  |
| R31  | assente                                                                                     | r.51                                                               |
| R32  | assente                                                                                     | r.7                                                                |
| R33  | «da mergiare» **15** · merge-ready 2 · NON mergiata 1 · Branch vivi 1 · regen PENDENTE r.58 | **1** (citazione, v. eccezioni) · 0 · 0 · 0 · assente              |
| R34  | assente / count 1 / senza FATTO                                                             | r.39 / count 1 (solo la nota «non esiste più») / r.97 con ✅ FATTO |
| R35  | assente                                                                                     | r.5 (esatto)                                                       |
| R36  | assente                                                                                     | r.4 (esatto)                                                       |

I numeri di riga che differiscono dagli attesi (R07-R10, R15-R17, R26-R28…) sono l'effetto degli inserimenti multi-riga delle riparazioni precedenti nello stesso file: la presenza è verificata, il numero riportato è quello reale.

### Passavano GIÀ prima / eccezioni dichiarate (non riparate in silenzio)

- **R34b** (`forced-light` count=1): passava già come conteggio — ma l'occorrenza era quella stantia; ora è la nota «non esiste più». Verificata nel contenuto, non solo nel numero.
- **R30a atteso 0, reale 1**: la 2ª occorrenza sta a **r.85** (non r.416 come nel mandato) del **Log append-only** — cita il testo vecchio per denunciarne la tensione; correggerla violerebbe la regola scritta a r.12. Stesso ragionamento che il mandato applica a r.416.
- **R33a atteso 0, reale 1**: delle 15 di partenza, 14 erano stati falsi (riparati); la 15ª è la **citazione** a r.19 «da "da mergiare" a "mergiata"», dentro una frase vera.
- **R29a**: `grep -rn` trova ancora la stringa col numero di modello in `.claude/settings.local.json:10` — file **non tracciato** (permesso locale di sessione, fuori repo e fuori perimetro). Sul contenuto tracciato `git grep` = 0.

## 3. Voci non applicate

Nessuna per OGGI-mismatch: tutte e 36 combaciavano col file reale. Due scostamenti puntuali, dichiarati:

- **R33, ripetizione «r.162» (§9 prompt Cowork)**: non contiene uno stato falso. Testo trovato: «Backend ref xgxtplqlewpqjzghvbke; LIBRERIA ESERCIZI POPOLATA (954 righe con coach_id, verifica 2026-07-12); FE su .env.local (TEMP)» — tutte affermazioni ancora vere → non toccata. La ripetizione falsa del §8 (branch vivi, r.141-142) e la coda (r.183) sono state corrette.
- **R33 riga 86, «(v. §3.2)»**: §3.2 non esiste in HANDOFF.md → sostituito con «(v. §4, Azioni di Nicolò n.25)», che esiste.

## 4. Proposte emerse

Nessuna riparazione ha richiesto un cambio di comportamento (le 8 del mandato restano le uniche). Due note di processo per Cowork:

- **Gli 8 puntatori auto-inflitti**: i testi NUOVI portano `file:riga` calcolati su `main`, e le riparazioni stesse spostano le righe (eslint `:47`→`:51`, `:52-53`→`:56-57` · 03-BACKEND `:117`→`:119` · SETUP `111-156`→`114-159`, `122`→`125` · semaforo `:113-121`→`:114-122` · i «r.NN» interni di HANDOFF, +1). Trovati dalla passata indipendente, **rinumerati misurando ogni bersaglio** (`62660d9`) — unico scostamento dal verbatim. Per i mandati futuri: pre-compensare i numeri citati nei testi che si inseriscono.
- **Rilievo secondario del reviewer, fuori mandato, non toccato**: HANDOFF r.16-17 «Stato di origin/main al 2026-08-01: tip 7be1faf» — dichiarazione datata, vera per quella data.

## 5. Perimetro

`git diff --stat main...HEAD` → **esattamente i 16 file dell'elenco del mandato + i 2 aggiunti su richiesta di Nick il 18/08** (`.audit-allowlist.json` e questo `docs/ULTIMO-RITORNO.md`): 18 file, nessun altro.

- Nei file di codice il diff è solo-commenti (verificato col filtro sui non-commenti); **il gate `decide.ts:164-166` è byte-identico a main**; zero migration toccate (155 file su entrambi i lati).
- Passata indipendente: **code-reviewer** — 5/5 criteri PASS, 1 finding (puntatori) chiuso in `62660d9`, ri-verifica finale «**committabile sì**»; **supabase-rls-auditor** — «pulito».
- Test: Deno release 36/36 · Deno intake 54/54 (la suite è cresciuta dai 52 dichiarati in CLAUDE.md §1) · tsc verde a ogni commit via pre-commit.

## 6. I check sulla PR

**Correzione di realtà sul rosso della Catena di fornitura**: non erano «le 14 vulnerabilità note» (quadro del 31/07, superato) — `npm audit` è già **0 vulnerabilità** (dev inclusi, misura del 18/08). Il rosso era **una riga morta** in `.audit-allowlist.json`: l'eccezione `GHSA-qwww-vcr4-c8h2` (react-router CSRF) non corrisponde più a nessuna advisory aperta, e il cancello — per il design dichiarato nell'header di `scripts/audit-gate.mjs` — tiene rossa proprio la PR che risolve, finché la stessa PR non toglie la voce. Fatto in `56f22bb`, coi due esiti:

```
PRIMA — node scripts/audit-gate.mjs (exit 1):
audit-gate ROSSO — 1 problema/i:
  ✗ eccezione morta: GHSA-qwww-vcr4-c8h2 non corrisponde più a nessuna advisory aperta —
    togli questa voce NELLO STESSO commit che risolve l'advisory (finché resta, questo
    cancello tiene rossa proprio la PR che la risolve)

DOPO — node scripts/audit-gate.mjs (exit 0):
audit-gate VERDE: 0 vulnerabilità high/critical non dichiarate (0 high/critical dichiarate, 0 sotto-soglia).
```

Quadro CI misurato su `62660d9` (testa precedente) e atteso sulla testa nuova:

| Check                     | Obbligatorio | Su `62660d9`          | Atteso dopo questo push                    |
| ------------------------- | ------------ | --------------------- | ------------------------------------------ |
| Tipi · lint · unit (web)  | ✅ sì        | **VERDE**             | verde                                      |
| Unit edge function (Deno) | ✅ sì        | **VERDE**             | verde                                      |
| End-to-end (Playwright)   | no           | verde                 | verde                                      |
| Catena di fornitura       | no           | rossa (la voce morta) | **verde** (gate locale verde in `56f22bb`) |

L'esito vero si legge sul run CI della PR — è lì che si accetta il verde, non sul run locale.

## 7. Retro e handoff

- **RETRO** scritta in coda al Log di `docs/auto-miglioramento.md` (`becf08e`, ritoccata in `62660d9`): prova rossa, cancello interrogato, ancore verificate; lezioni su `rev-parse --short` multi-hash e sul corollario che le PROVE-grep colpiscono anche le citazioni (la RETRO stessa ha dovuto parafrasare le due stringhe-veleno per non riaccenderle sul tracciato).
- **HANDOFF** aggiornato **dopo** R33/R34: stato della fetta in §0 (primo bullet), testata «Aggiornato: 2026-08-18», le 25 azioni di Nicolò in §4.

Push verificato in pari. **Il merge della PR #50 resta a Nicolò** — l'agente non unisce, non forza, non cancella rami.
