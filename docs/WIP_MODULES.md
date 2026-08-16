# WIP_MODULES — moduli feature non ancora collegati

> ⚠️ **RIVEDERE PRIMA DI OGNI RELEASE.** Questi moduli esistono nel codebase e nel
> `PRODUCT_SPEC` ma **non sono ancora agganciati** a route/UI. Sono elencati nell'`ignore`
> di [`knip.config.ts`](../knip.config.ts) così gli audit non li segnalano come codice morto.
> **Non sono dead code** — ma se un modulo resta qui a lungo senza essere collegato, valutare
> se è ancora in roadmap o se è diventato davvero morto. Quando colleghi un modulo:
> **rimuovilo da questa tabella e dall'`ignore` di `knip.config.ts`**, poi rilancia
> `npm run audit:all`.

Origine: audit **D8** (2026-06-14; report potato il 2026-08-16, storia nei commit).

| Feature                           | File                                                                                                                                | Punto di aggancio previsto                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Ciclo mestruale (athlete)         | `src/hooks/useCyclePhasing.ts`                                                                                                      | feature athlete-side, fuori scope coach (D13 §5 C5)            |
| Math readiness / TDEE / biometria | `src/lib/math/readinessMath.ts`, `adaptiveTDEE.ts`, `biometrics.ts`, `nutritionMath.ts`, `constants.ts`, `src/types/progression.ts` | lib pure → consumate dagli hook qui sopra                      |
| Nutrizione (food search)          | `src/services/foodApi.ts`                                                                                                           | dialog ricerca cibo (Open Food Facts) — host coach da definire |
| Offline / PWA                     | `src/hooks/useOfflineSync.ts`, `src/lib/offlineStorage.ts`                                                                          | ⚠️ richiede re-introdurre la PWA (rimossa da `vite.config.ts`) |
| Media / immagini                  | `src/lib/media.ts`, `src/lib/mediaSession.ts`, `src/lib/imageCompression.ts`                                                        | upload foto/video                                              |
| Tipi DB JSONB (task separato)     | `src/types/database.ts`                                                                                                             | tipi JSONB generici (non gating/Stripe — vedi D13 §5 C2)       |

## Note

- `src/utils/translations.ts` è **tenuto per decisione di Nick** (etichette i18n per le feature
  WIP) ma **non** è in questa tabella né nell'`ignore` di knip: continuerà a comparire negli
  audit come export/file orfano finché non verrà usato. Scelta consapevole.
- Procedura di aggancio di un modulo: collega l'hook/lib alla UI → rimuovi la voce da
  `knip.config.ts` e da questa tabella → `npm run audit:all` per confermare che non risulti
  più orfano e che non abbia introdotto nuovi export morti.
