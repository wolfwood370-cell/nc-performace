# D8 — Audit codice morto (v2, approfondito)

> Cowork, 2026-06-14. Obiettivo Nick: codebase **solido e ordinato** prima di nuove feature, con precisione prima di passare a Claude Code.

## Metodo & affidabilità

Per aggirare i limiti della sandbox (vedi sotto) ho costruito una **copia NUL-free del progetto** in `/tmp` (rimosso l'artefatto di padding) con `node_modules` collegato, e ho eseguito i tool veri:

- ✅ **`ts-prune`** (export non importati) — girato, 283 segnalazioni → 73 export morti reali dopo filtro.
- ✅ **`depcheck`** (dipendenze) — girato.
- ✅ **grep file-orfani** (`-a`, include i file con padding) — 24 file mai importati.
- ❌ **`knip`** non gira nemmeno sulla copia: richiede il binding **Linux** di `oxc-parser` (il `node_modules` ha i binari Windows). Va lanciato in Claude Code, ma `ts-prune`+`depcheck`+grep ne coprono lo scope (export/file/dipendenze).

**Nota:** il repo NON è corrotto; i "NUL byte" sono un artefatto di lettura della sandbox.

## ⚠️ Conclusione in una riga

Dei **24 file orfani (~4.192 righe)**, **~22 sono moduli-feature WIP presenti nel PRODUCT_SPEC → DA TENERE.** È codice morto reale **solo `src/lib/ai-error.ts`**; `utils/translations.ts` è da decidere. **Non fare una cancellazione di massa.**

## File orfani — classificati (0 import nel progetto)

| File                                                                                                            | Area                                               | In spec?                  | Verdetto                                                 |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `hooks/useAcwrData.ts` · `usePeriodization.ts` · `useCyclePhasing.ts` · `useCoachTrainingBlocks.ts`             | Readiness / ACWR / Periodizzazione / Ciclo         | ✅                        | **KEEP (WIP)**                                           |
| `lib/math/readinessMath.ts` · `adaptiveTDEE.ts` · `biometrics.ts` · `nutritionMath.ts` · `types/progression.ts` | Math readiness/TDEE/biometria                      | ✅                        | **KEEP (WIP)**                                           |
| `hooks/useCoachNutritionAnalytics.ts` · `services/foodApi.ts`                                                   | Nutrizione                                         | ✅                        | **KEEP (WIP)**                                           |
| `hooks/useAthleteHealthProfile.ts` · `useFmsAlerts.ts`                                                          | FMS / Salute                                       | ✅                        | **KEEP (WIP)**                                           |
| `hooks/useOfflineSync.ts` · `lib/offlineStorage.ts`                                                             | Offline / PWA                                      | ✅                        | **KEEP (WIP)**                                           |
| `lib/media.ts` · `mediaSession.ts` · `imageCompression.ts`                                                      | Media / immagini                                   | ✅                        | **KEEP (WIP)**                                           |
| `hooks/useAiQuota.ts`                                                                                           | Quota AI                                           | ✅                        | **KEEP (WIP)**                                           |
| `hooks/useFeatureAccess.ts` · `types/database.ts`                                                               | Gating abbonamento / parser tipi                   | ✅ (billing)              | **KEEP (WIP)** — verifica                                |
| `utils/translations.ts`                                                                                         | Etichette i18n (CYCLE/MUSCLE/… labels, `t`)        | ❌ (app solo-IT)          | **KEEP** — deciso da Nick (etichette per le feature WIP) |
| `lib/ai-error.ts`                                                                                               | `showAiGatewayError` = **vecchio gateway Lovable** | ❌ (obsoleto post-OpenAI) | **REMOVE** ✅                                            |

> Gli altri export morti segnalati da ts-prune (es. `useFmsAlerts.checkExerciseContraindication`, gli storage in `offlineStorage.ts`, i parser in `types/database.ts`, i `*_LABELS` in `translations.ts`) appartengono ai moduli sopra → seguono il verdetto del rispettivo file.

## Falsi positivi esclusi (NON toccare)

- `src/components/ui/**` (circular-progress, empty-state-card, metric-card, section-header, status-badge): primitive shadcn-style, riusabili.
- `src/integrations/supabase/types.ts` (`Constants`): auto-generato.
- `src/App.tsx` default: entry-point.

## Dipendenze (depcheck)

| Flag                               | Realtà                                   | Azione                                                                   |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `@playwright/test` "unused"        | usato in `e2e/` + `playwright.config.ts` | **Non rimuovere**; spostalo da `dependencies` → `devDependencies` (tidy) |
| `autoprefixer`, `postcss` "unused" | usati da `postcss.config.js` (Tailwind)  | **Non rimuovere** (falsi positivi)                                       |

Nessuna dipendenza realmente da rimuovere.

## Database

48 tabelle referenziate nel codice (FE + edge). Un check "tabelle/colonne morte" va fatto **solo come flag** (possibile uso da trigger/RPC/realtime) e mai rimosso autonomamente (metodologia §8). Rimandato.

## Aura compliance (separato dal dead-code)

- ~**148** colori hex grezzi in `.tsx` → mappare a token.
- ~**25** `style={{…}}` inline in `components/coach/**` e `pages/coach/**` → convertire.

## ✅ Pulito

- **0** `console.log/warn/error` fuori da `src/lib/logger.ts`.

## Cosa è sicuro fare ORA (cleanup minimale, in Claude Code)

1. **Rimuovere `src/lib/ai-error.ts`** (obsoleto post-OpenAI) + eventuali import residui. Commit `chore(cleanup)`.
2. **Spostare `@playwright/test`** in `devDependencies`. Commit `chore(deps)`.
3. **`utils/translations.ts`: TENERE** (deciso da Nick) — nessuna azione.
4. **NON** toccare i moduli WIP: vanno semmai **tracciati e collegati**, non cancellati.
5. Lanciare `npm run audit:all` in locale (conferma con knip) + (separato) pass Aura token.

## Prompt di trasferimento — Claude Code (cleanup mirato)

```
Prosecuzione nc-performance-hub — CLEANUP MIRATO. Leggi PRIMA docs/HANDOFF.md,
.claude/methodology/05-DEAD-CODE-AUDIT.md e docs/D8_AUDIT_CODICE_MORTO.md (v2).

Contesto: audit fatto. 24 file orfani (~4192 righe) ma ~22 sono FEATURE WIP nel PRODUCT_SPEC
→ NON cancellare. Codice morto reale: solo src/lib/ai-error.ts (vecchio gateway).

GUARDRAIL: italiano; branch claude/oauth-migration; commit atomici; build gate
tsc --noEmit -p tsconfig.app.json verde; MAI push; non mescolare cleanup e feature.

OBIETTIVO:
1) Rimuovi src/lib/ai-error.ts (showAiGatewayError/withTimeout, obsoleti post-OpenAI) +
   import residui. Verifica con grep che non sia referenziato. Commit chore(cleanup).
2) Sposta @playwright/test da dependencies a devDependencies. Commit chore(deps).
3) translations.ts: TENERE (deciso da Nick) — non rimuovere.
4) Esegui `npm run audit:all` (knip+depcheck+ts-prune) per conferma e allega il delta a D8.
5) NON rimuovere i moduli WIP (readiness/ACWR/periodizzazione/nutrizione/TDEE/FMS/offline/
   media/quota/gating): proponi invece un piano per collegarli quando svilupperemo le feature.
Esplora→pianifica e proponi il piano PRIMA di modificare.
```

---

_D8 v2 · Cowork · 2026-06-14. ts-prune+depcheck+grep autoritativi; knip da rilanciare in Claude Code._

---

## Delta audit — Claude Code (2026-06-14, branch `claude/oauth-migration`)

Cleanup eseguito (commit atomici, no push):

- `517fea1` chore(cleanup): rimosso `src/lib/ai-error.ts` (gateway Lovable, 0 callsite verificati con grep).
- `a5f29e1` chore(deps): `@playwright/test` → `devDependencies` + `package-lock.json` riallineato.
- `d7b9f1d` chore(cleanup): 21 moduli WIP aggiunti all'`ignore` di `knip.config.ts` + tracker `docs/WIP_MODULES.md` (committato).
- `8343836` chore(cleanup): aggiunti `src/lib/math/constants.ts` + `trainingMetrics.ts` all'ignore WIP (dipendenze di `useAcwrData`, emerse da knip dopo l'ignore degli altri math).

`npm run audit:all` — **knip ORA gira nativamente su Windows** (binari corretti):

- **knip** (dopo ignore WIP): 1 unused file = `src/utils/translations.ts` (KEEP per Nick, **non** ignorato di proposito → riemerge consapevolmente); 1 unused export = `Confetti.triggerConfetti` (vedi flag); restanti unlisted/error = falsi positivi (sotto).
- **depcheck**: 0 dipendenze realmente inutilizzate (falsi positivi noti: `@playwright/test`, `autoprefixer`, `postcss`).
- **ts-prune**: 281 segnalazioni, **tutte** nei moduli WIP o falsi positivi (entry-point `App.tsx`, shadcn `components/ui/**`, `types.ts` autogen). **0 dead code reale nuovo**.

### ⚠️ Da flaggare (NON risolto qui — fuori scope cleanup, richiede decisione)

1. **`playwright.config.ts` importa `lovable-agent-playwright-config`** (modulo Lovable non installato) → knip/Playwright non caricano la config: **i test E2E rischiano di non girare**. Residuo Lovable da sostituire con una config Playwright nativa.
2. **`src/components/celebration/Confetti.tsx` → `triggerConfetti`** export non importato (non era in D8 v2). Verificare se è usato dinamicamente o destinato a una feature prima di rimuoverlo.
3. **`unlisted: npm`** nei 3 edge Stripe → falso positivo di knip sugli import Deno (`npm:`), nessuna azione.
