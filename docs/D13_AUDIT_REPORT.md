# D13 — Audit report finale (Epic B)

> **Report-only.** Output annotato di `npm run audit:all` a fine campagna D13.
> Stato repo: `main` dopo il merge di Epic A + C1–C5 + D (E2E). Generato 2026-06-18.
> Metodologia: `.claude/methodology/05-DEAD-CODE-AUDIT.md`.

---

## 0. Esito in una riga

**Nessun nuovo codice morto introdotto dalla campagna.** I 7 hook WIP collegati (C1–C5)
sono ora raggiungibili e **rimossi dall'`ignore` di knip**; l'audit riporta esclusivamente il
**baseline noto** (ignori strutturali, WIP intenzionali ancora non collegati, e i soliti
falsi-positivi di knip/depcheck). Le tre suite escono con i codici attesi (knip exit 1 perché
trova SEMPRE almeno gli item baseline — non è una regressione).

---

## 1. Cosa ha collegato la campagna (non più orfani)

| Epic | Hook/modulo collegato                        | Dove                                                         |
| ---- | -------------------------------------------- | ------------------------------------------------------------ |
| C1   | `useAiQuota`                                 | `AiQuotaBadge` → MasterCopilot + KnowledgeBase               |
| C2   | `useFeatureAccess`                           | `FeatureGate` → video/AI/ProgramBuilder                      |
| C3   | `useCoachNutritionAnalytics`                 | `NutritionAdherenceCard` → tab Strategia                     |
| C4   | `useAthleteHealthProfile`, `useFmsAlerts`    | `HealthProfileTab` (tab Salute) + `FmsContraindicationBadge` |
| C5   | `usePeriodization`, `useCoachTrainingBlocks` | `PeriodizationTab` + `TrainingBlocksTimeline`                |

Tutti rimossi da `knip.config.ts` e da `docs/WIP_MODULES.md`, con `audit:all` riverificato pulito
a ogni scollegamento (rail R5).

---

## 2. `npm run audit:dead` (knip) — annotato

```
Unused files (1)
  src/utils/translations.ts                ← INTENZIONALE (decisione Nick: i18n WIP), non in ignore
Unused dependencies (1)
  immer                                    ← FALSO POSITIVO (usato via middleware zustand)
Unused devDependencies (1)
  depcheck, eslint, ts-prune               ← FALSO POSITIVO (usati via npm scripts/tooling)
Unlisted dependencies (3)
  npm (3 edge functions Stripe)            ← FALSO POSITIVO (import Deno, non npm)
Unlisted binaries (2)
  lint-staged / vite / eslint / …          ← FALSO POSITIVO (tooling via script)
Unused exports (1)
  aiProgramMapper.ts: UNLINKED_EXERCISE_ID,
  UNLINKED_EXERCISE_NOTE, parseLoad,
  matchExerciseId                          ← SENTINEL D11 (libreria esercizi vuota), intenzionale
Unused exported types (1)
  aiProgramMapper.ts: AiProgramExercise    ← idem (tipo del mapper SENTINEL)
```

**Verdetto knip**: identico al baseline pre-campagna. **Zero** nuovi file/orfani introdotti da C1–C5.
Nessun "unused ignore pattern" (gli ignore rimossi erano tutti per moduli ora raggiungibili).

---

## 3. `npm run audit:deps` (depcheck) — annotato

```
Unused devDependencies
  autoprefixer                             ← FALSO POSITIVO (usato da postcss.config.js)
  postcss                                  ← FALSO POSITIVO (pipeline PostCSS/Tailwind)
```

Entrambe servono alla build CSS (PostCSS + Autoprefixer via `postcss.config.js`); depcheck non
traccia la config PostCSS. Nessuna azione.

---

## 4. `npm run audit:exports` (ts-prune) — sintesi

264 righe, in larghissima parte **"(used in module)"**: type/funzioni esportate ma consumate solo
nel proprio modulo (es. `NutritionAnalyticsResult`, `TrainingBlock`, `CreatePhaseInput`,
`FmsAlertData`, `AthleteHealthProfile`, …). **Non sono dead code**: sono la superficie-tipo pubblica
degli hook (alcuni esportano tipi per estensibilità). ts-prune non rispetta l'`ignore` di knip,
quindi elenca anche i moduli WIP.

Voci **non** "(used in module)" — genuinamente non importate, tutte **WIP intenzionali**:

| Voce ts-prune                                           | Stato                                                  |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `useCyclePhasing.ts:103 useCyclePhasing`                | WIP — ciclo mestruale athlete-side (fuori scope coach) |
| `useOfflineSync.ts:317 useOfflineSync`, `:100 getQueue` | WIP — PWA offline (rimossa da vite.config)             |
| `App.tsx:369 default`                                   | Falso positivo (entry, usato da `main.tsx`)            |

---

## 5. Moduli WIP residui (ancora in `knip.config.ts` ignore — intenzionali)

| Categoria       | File                                                                                                               | Perché resta                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Ciclo (athlete) | `useCyclePhasing.ts`                                                                                               | Feature athlete-side, fuori scope coach (D13 §5 C5)                 |
| Offline / PWA   | `useOfflineSync.ts`, `offlineStorage.ts`                                                                           | Richiede re-introdurre la PWA (rimossa da `vite.config.ts`)         |
| Math            | `readinessMath.ts`, `adaptiveTDEE.ts`, `biometrics.ts`, `nutritionMath.ts`, `constants.ts`, `types/progression.ts` | Lib pure consumate dagli hook readiness/TDEE (non ancora collegati) |
| Media           | `media.ts`, `mediaSession.ts`, `imageCompression.ts`                                                               | Upload foto/video (host da definire)                                |
| Food search     | `services/foodApi.ts`                                                                                              | `FoodSearchDialog` rinviato in C3 (no host coach chiaro)            |
| Tipi JSONB      | `types/database.ts`                                                                                                | Task tipi separato (non gating/Stripe)                              |

Ignori **strutturali** (non WIP): `src/integrations/supabase/types.ts` (auto-gen Lovable) e
`src/components/ui/**` (primitive shadcn tenute per Stitch futuri).

---

## 6. Set B dead-code (D12) — NON rimosso

`src/lib/math/readinessMath.ts` + `src/lib/math/constants.ts` sono **tenuti** (decisione D12: roadmap
readiness documentata). **Non rimossi in questa campagna.** Rimozione SOLO su conferma esplicita di
abbandono della feature readiness da parte di Nick → **STOP & ASK** (rail R9 / D13 §4).

---

## 7. Raccomandazioni

1. **Pre-release**: rivedere `docs/WIP_MODULES.md` — se un modulo resta WIP a lungo senza host,
   decidere se è ancora in roadmap o se è diventato dead-code da rimuovere.
2. **`translations.ts`**: continuerà a comparire come file orfano finché non viene usato (scelta
   consapevole di Nick). Quando le label i18n verranno consumate, sparirà dall'audit.
3. **Falsi-positivi tooling** (immer, autoprefixer/postcss, npm Deno): stabili e attesi — nessuna
   azione, documentati qui per non riaprirli a ogni audit.
4. **Set B**: invariato finché Nick non conferma l'abbandono di readiness.

---

_D13 Epic B — report finale, report-only. Nessuna modifica al codice. Generato da Claude Code._
