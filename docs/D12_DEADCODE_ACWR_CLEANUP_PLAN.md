> ⚠️ **STORICO — piano già ESEGUITO (Set A, `6dcd2fc`, 2026-06-17); non usare come piano.**
> Il flusso git qui citato (MAI push / 5 step GitHub Desktop) è superato dalla legge #8 rivista 2026-08-01: vedi `CLAUDE.md` legge #8 + `00-CORE.md §6`.

# D12 — Pulizia dead-code ACWR (PIANO, solo-piano)

> **Preparato:** 2026-06-16 (Cowork, read-only). **Esecuzione:** Claude Code (codice/branch/commit).
> Obiettivo scelto da Nick: rimuovere il **duplicato ACWR morto**. Modalità: _solo piano qui, codice in CC_.
> **Decisione finale (2026-06-16):** eseguire **Set A** (rimozione sicura). **Set B tenuto** (readinessMath = roadmap documentata) — non rimuovere senza nuova conferma.
> Metodologia di riferimento: `.claude/methodology/05-DEAD-CODE-AUDIT.md` (§5 decision rules, §9 report, §10 cleanup).

---

## 0. Scoperta che motiva la pulizia

L'ACWR **è già cablato e vivo** lato coch e atleta tramite un'implementazione _diversa_ da quella WIP:

- Hook vivo: `src/hooks/useAthleteAcwrData.ts` (math inline 28gg, RPE×min).
- Componente: `src/components/coach/analytics/AcwrGauge.tsx` → consuma `useAthleteAcwrData`.
- Reso in: `CoachAnalytics.tsx` (`/coach/analytics`, voce sidebar "Analisi"), `AthleteDetail.tsx`, e atleta `AcwrAnalysis.tsx`.

Il modulo WIP `useAcwrData` (math centralizzata 42gg via `trainingMetrics`/`constants`) è una **seconda implementazione mai collegata** → duplicato superato, non "da agganciare".

---

## 1. Fatti di dipendenza (verificati repo-wide)

> Verifica: `grep -rn` su tutto il repo (escluso `node_modules`/`.git`), incl. `tests/`, `supabase/functions/`, import relativi e cross-import tra i lib `src/lib/math/`.

| File                                   | Consumer reali (codice)                                                                | Note                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/hooks/useAcwrData.ts`             | **0**                                                                                  | Solo riferimenti bookkeeping (knip, WIP_MODULES, glossario doc). Re-export `AcwrResult` non importato da nessuno.                                            |
| `src/lib/math/trainingMetrics.ts`      | **solo** `useAcwrData`                                                                 | Nessun import proprio. Cade insieme a useAcwrData.                                                                                                           |
| `src/lib/math/constants.ts` (17r)      | `useAcwrData` (`ACWR_LOOKBACK_DAYS`) **+ `readinessMath`** (`READINESS_BASELINE_DAYS`) | **Condiviso.** Dopo rimozione di useAcwrData resta usato da readinessMath → **non eliminabile da solo**.                                                     |
| `src/lib/math/readinessMath.ts` (329r) | **0** in `src`                                                                         | Importa+re-esporta `./constants`. Documentato come motore canonico in `.claude/methodology/02-ATHLETE-APP.md:388,402` e annunciato in `RELEASE_NOTES.md:10`. |

**Conseguenza chiave:** rimuovere "tutti e 4" come blocco unico **rompe `tsc`** (constants serve a readinessMath) e cancella un motore readiness documentato. Vanno separati.

Nessun riferimento in `tests/**` né `supabase/functions/**` per nessuno dei 4 file. `src/types/progression.ts` ha 0 consumer ma è **fuori scope** (altro WIP).

---

## 2. SET A — rimozione sicura (RACCOMANDATO, eseguibile subito)

Il vero "duplicato ACWR morto". Zero ambiguità, zero consumer, `tsc` resta verde.

### 2.1 File da cancellare

- `src/hooks/useAcwrData.ts`
- `src/lib/math/trainingMetrics.ts`

### 2.2 Edit di bookkeeping (file:line attuali)

| File                                        | Azione                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `knip.config.ts:36`                         | rimuovi riga `"src/hooks/useAcwrData.ts",`                                      |
| `knip.config.ts:51`                         | rimuovi riga `"src/lib/math/trainingMetrics.ts",`                               |
| `docs/WIP_MODULES.md:15`                    | nella riga _Readiness/ACWR/…_ togli `src/hooks/useAcwrData.ts` dall'elenco file |
| `docs/WIP_MODULES.md:16`                    | nella riga _Math readiness/TDEE/…_ togli `trainingMetrics.ts` dall'elenco file  |
| `.claude/methodology/02-ATHLETE-APP.md:397` | nella riga glossario, lascia solo `useAthleteAcwrData` (togli `useAcwrData /`)  |

> NON toccare `knip.config.ts:46` (readinessMath) né `:50` (constants) in Set A: restano ignorati perché ancora vivi/roadmap.

### 2.3 Build gate + audit

```bash
npx tsc --noEmit -p tsconfig.app.json     # deve restare VERDE
npm run audit:all                         # knip/depcheck/ts-prune: niente nuovi orfani, ignore-list pulita
```

Attesa: knip non deve più segnalare "unused ignore pattern" per i due path rimossi; nessun nuovo file orfano introdotto (constants resta coperto da readinessMath).

### 2.4 Commit atomico (1 solo)

```
chore(cleanup): rimuovi useAcwrData + trainingMetrics (duplicato ACWR morto)

ACWR è già cablato via useAthleteAcwrData + AcwrGauge (CoachAnalytics,
AthleteDetail, AcwrAnalysis). I due file erano una seconda implementazione
mai collegata: 0 consumer in src/tests/edge. Aggiornati knip.config.ts,
docs/WIP_MODULES.md e il glossario 02-ATHLETE-APP.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 3. SET B — readinessMath + constants (FLAGGED, decisione di Nick)

> Nick ha indicato anche questi due nell'opzione scelta, **ma** la verifica mostra che sono accoppiati e che readinessMath è roadmap documentata. Per `05-DEAD-CODE-AUDIT.md §5.1` ("feature non ancora rilasciata") è un caso **STOP & ASK**.

**Decisione finale (2026-06-16): TENERLI (deferito)** — come `adaptiveTDEE`/`biometrics`/`nutritionMath`, stessa riga WIP "lib pure → consumate dagli hook". Sono il motore della futura feature readiness atleta. Rimuovere solo su conferma esplicita di Nick (feature readiness abbandonata).

Se invece Nick conferma che la feature readiness è **abbandonata**, allora Set B è eseguibile come **commit separato** (mai insieme a Set A — §10.2):

- Cancella `src/lib/math/readinessMath.ts` **e** `src/lib/math/constants.ts` (ora orfano: era usato solo da readinessMath).
- `knip.config.ts`: rimuovi righe `:46` e `:50`.
- `docs/WIP_MODULES.md:16`: togli `readinessMath.ts` e `constants.ts`.
- **Aggiorna i doc che lo citano** (altrimenti restano dangling): `.claude/methodology/02-ATHLETE-APP.md:388,402` (sezione readiness math) e `RELEASE_NOTES.md:10` (`generateReadinessInsight()`).
- Build gate `tsc` verde + `npm run audit:all`.
- Commit: `chore(cleanup): rimuovi readinessMath engine non rilasciato (+constants)`.

---

## 4. Sequenza operativa consigliata (in CC)

```
1. git: verifica branch ≠ main → crea claude/cleanup-acwr-deadcode
2. SET A (file delete + 5 edit bookkeeping)
3. npx tsc --noEmit -p tsconfig.app.json   → verde
4. npm run audit:all                       → conferma delta pulito
5. commit atomico Set A (msg §2.4) — NO push
6. git log --oneline -1 + git status       → verifica commit, working tree clean
7. (solo se Nick conferma abbandono readiness) → SET B come commit separato
8. ricorda a Nick i 5 step GitHub Desktop (fetch → switch → merge into current → verify types.ts → push)
```

Delta atteso Set A: **−2 file**, ~ −267 righe (94 hook + 173 math) + 5 edit di pulizia bookkeeping.

---

## 5. Prompt di handoff — Claude Code

```
Prosecuzione nc-performance-hub. Esegui il piano docs/D12_DEADCODE_ACWR_CLEANUP_PLAN.md.
Leggi PRIMA docs/HANDOFF.md + CLAUDE.md + .claude/methodology/00-CORE.md + 05-DEAD-CODE-AUDIT.md.

Fai SOLO il SET A (rimozione sicura: useAcwrData.ts + trainingMetrics.ts + i 5 edit bookkeeping).
NON toccare readinessMath/constants (SET B = flagged, in attesa di mia conferma).

GUARDRAIL: italiano; crea claude/cleanup-acwr-deadcode (NON su main); build gate
tsc --noEmit -p tsconfig.app.json verde + npm run audit:all; 1 commit atomico chore(cleanup)
con Co-Authored-By; MAI push (sincronizzo io). Verifica commit (git log -1 + git status) a fine.
```

---

_Piano D12 — solo-piano (Cowork). ACWR già cablato; rimozione duplicato. Set A sicuro, Set B flagged._
