# 05 — Dead code audit & efficiency

> Routine periodica per identificare e rimuovere codice morto, dipendenze inutili, import orfani. Mantiene il bundle snello e il codebase navigabile.
>
> Attivata quando l'utente dice: "fai audit", "pulisci il codice", "cerca codice morto", "ottimizza", "snellisci".

---

## Indice

1. [Setup tooling (knip + depcheck + ts-prune)](#1-setup)
2. [Quando eseguire l'audit](#2-when)
3. [Pipeline audit completa](#3-pipeline)
4. [Categorie codice morto](#4-categories)
5. [Decision rules: rimuovere vs flaggare](#5-decisions)
6. [Manual grep helpers](#6-manual-grep)
7. [Bundle analysis](#7-bundle)
8. [Database dead columns/tables](#8-db-dead)
9. [Report finale](#9-report)
10. [Cleanup workflow](#10-cleanup)

---

<a id="1-setup"></a>

## 1. Setup tooling (knip + depcheck + ts-prune)

### 1.1 Installazione (una tantum)

```bash
npm install --save-dev knip depcheck ts-prune
```

### 1.2 Configurazione knip

File `knip.config.ts` nella root:

```ts
import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "src/main.tsx",
    "src/App.tsx",
    "supabase/functions/*/index.ts",
    "tests/**/*.spec.ts",
    "vite.config.ts",
    "tailwind.config.ts",
    "playwright.config.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "supabase/functions/**/*.ts"],
  ignore: [
    "src/integrations/supabase/types.ts", // auto-gen, ignore
    "src/components/ui/**", // shadcn primitives, may be unused per-file ma usabili in futuro
  ],
  ignoreDependencies: [
    // Husky e prettier sono usati via lint-staged, knip non li rileva
    "husky",
    "lint-staged",
  ],
};

export default config;
```

### 1.3 npm scripts

Aggiungi a `package.json`:

```json
{
  "scripts": {
    "audit:dead": "knip --reporter compact",
    "audit:deps": "depcheck --skip-missing",
    "audit:exports": "ts-prune -p tsconfig.app.json",
    "audit:all": "npm run audit:dead && npm run audit:deps && npm run audit:exports"
  }
}
```

### 1.4 Uso

```bash
npm run audit:all       # esegue tutti i check
npm run audit:dead      # solo knip (export + file orfani)
npm run audit:deps      # solo depcheck (dipendenze package.json)
npm run audit:exports   # solo ts-prune (export TS non importati)
```

<a id="2-when"></a>

## 2. Quando eseguire l'audit

| Trigger                                                      | Frequenza    |
| ------------------------------------------------------------ | ------------ |
| Utente chiede esplicitamente "fai audit"                     | On-demand    |
| Dopo grandi refactor (>5 commit di refactor)                 | Manuale      |
| Pre-release (RC bump)                                        | Manuale      |
| Mensile (suggerito)                                          | Routine      |
| Bundle warning > 500 KB                                      | Auto-trigger |
| Sensazione "il progetto è cresciuto, qualcosa sarà obsoleto" | On-demand    |

NON eseguire dopo ogni commit — è overkill e l'output va perso.

<a id="3-pipeline"></a>

## 3. Pipeline audit completa

```
1. Run npm run audit:all
   → cattura output (può essere 100+ righe)

2. Categorizza findings:
   - Export TS non importati (knip + ts-prune)
   - File mai importati (knip)
   - Dipendenze package.json non usate (depcheck)
   - Hook custom mai chiamati (manual grep)
   - Componenti definiti ma mai usati (manual grep)
   - Helper lib non usati (manual grep)
   - console.log / TODO stantii (manual grep)
   - Tabelle/colonne DB non referenziate (manual grep — §8)
   - Bundle chunk warning > 500 KB (npm run build)

3. Filtra false positive:
   - Re-export pubblici (intended)
   - shadcn primitives (potenzialmente futuri)
   - Polyfill / shim
   - Lazy-import dinamici (knip può perdere)

4. Compila report (§9) e mostra all'utente

5. Utente decide cosa rimuovere → applica modifiche atomic (§10)
```

<a id="4-categories"></a>

## 4. Categorie codice morto

### 4.1 Export TS mai importati (alta confidence)

```bash
npm run audit:exports
# Output esempio:
# src/lib/oldHelper.ts:5 - exportedButUnused
```

Action: se conferma e nessun lazy-import dinamico → rimuovi.

### 4.2 File mai importati (alta confidence)

knip output:

```
src/components/legacy/OldCard.tsx (unused file)
```

Action: verify con `grep -rn "OldCard" src/` → se 0 hits import → cancella file.

### 4.3 Dipendenze package.json non usate (media confidence)

```bash
npm run audit:deps
# Output:
# Unused dependencies: lodash, moment
```

Action: verify (potrebbe essere usato in modo dinamico o in edge function). Se conferma:

```bash
npm uninstall lodash moment
```

### 4.4 Hook custom mai chiamati

```bash
# Per ogni hook in src/hooks/
for f in src/hooks/use*.ts src/hooks/use*.tsx; do
  name=$(basename "$f" .ts)
  name=$(basename "$name" .tsx)
  count=$(grep -rn "from.*['\"][^'\"]*${name}['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
  [ "$count" -eq 0 ] && echo "ORFANO: $f"
done
```

Action: rimuovi file hook + import residui.

### 4.5 Componenti definiti ma mai usati

```bash
# Per ogni .tsx in src/components/
for f in src/components/**/*.tsx; do
  name=$(basename "$f" .tsx)
  count=$(grep -rn "<${name}\|from.*['\"][^'\"]*${name}['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
  [ "$count" -eq 0 ] && echo "ORFANO: $f"
done
```

(meglio knip — questo grep è euristico)

### 4.6 console.log dimenticati

```bash
grep -rn "console\.\(log\|warn\|error\|debug\|trace\)" src/ \
  | grep -v "logger\.\|// eslint-disable\|/lib/logger"
```

Action:

- Sostituisci con `logger.info(...)` / `logger.error(...)` (vedi `src/lib/logger.ts`)
- O cancella se debug residuo

### 4.7 TODO/FIXME stantii

```bash
grep -rnE "(TODO|FIXME|HACK|XXX)" src/ supabase/functions/ \
  | grep -v "node_modules"
```

Action:

- Se ancora valido → crea task tracking (linka issue tracker)
- Se obsoleto → rimuovi commento

### 4.8 Const / type non usati

ts-prune o eslint `@typescript-eslint/no-unused-vars` (already in eslint.config.js).

### 4.9 CSS class / token non usate

```bash
# Token custom in index.css usati 0 volte
grep -E "^\s+--[a-z-]+:" src/index.css | while read line; do
  token=$(echo "$line" | sed -E 's/^\s+--([a-z-]+):.*/\1/')
  count=$(grep -rn "var(--${token})\|${token}" src/ --include="*.tsx" --include="*.ts" --include="*.css" | wc -l)
  [ "$count" -le 1 ] && echo "TOKEN ORFANO: --${token}"
done
```

### 4.10 Type domain non più usati

```bash
# Type esportato in src/types/ ma non importato
grep -rn "export (type|interface)" src/types/ | while IFS=: read file _; do
  # ... grep cross-file
done
```

(usa ts-prune output filtrato per `src/types/**`)

<a id="5-decisions"></a>

## 5. Decision rules: rimuovere vs flaggare

| Categoria                                           | Rule                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Export TS unused (high confidence)                  | Rimuovi se non re-export pubblico                                 |
| File completamente orfano                           | Rimuovi (verifica con grep manuale prima)                         |
| Dipendenza package.json unused                      | Rimuovi se confermato (chiedi se uncertain)                       |
| Hook custom orfano                                  | Rimuovi (likely safe)                                             |
| Componente shadcn-style in `ui/` ma non usato       | **NON** rimuovere — primitive future-usable                       |
| Componente custom non usato in `components/<area>/` | Rimuovi                                                           |
| `console.log` debug                                 | Rimuovi o convert a logger                                        |
| `console.error` con full err object                 | Convert a logger (no PII leak)                                    |
| TODO con data >30 giorni                            | Flag al user, chiedi se ancora valido                             |
| Token CSS unused                                    | Flag — può servire a una futura implementazione da handoff Design |
| Migration vecchia                                   | **MAI** rimuovere — storica                                       |
| File `*.test.ts` non eseguito                       | Rimuovi o aggiungi a test suite                                   |

### 5.1 Casi STOP & ASK

- File con commenti tipo `// Public API` o che dichiarano un contratto esterno
- Tabelle DB referenziate solo in edge functions (grep solo `src/` può mancarle)
- Componenti shadcn customizzati internamente
- Hook di feature non ancora rilasciata (in attesa di routing)

<a id="6-manual-grep"></a>

## 6. Manual grep helpers (rapidi)

```bash
# Import orfani specifici dopo refactor
grep -n "import.*<Symbol>" src/<file>

# Helper duplicati cross-file
grep -rn "^(function|const|export function|export const) <name>" src/

# Type duplicati
grep -rn "interface <Name>\|type <Name>" src/

# Hardcoded magic numbers
grep -rnE "= [0-9]{3,}" src/ | grep -v "test\|spec"   # threshold raw, falsi positivi attesi

# Stringhe duplicate (candidate per i18n)
grep -rn 'toast.success("' src/ | sort -u

# Inline style residui (Aura compliance)
grep -rn 'style={{' src/components/coach/ src/pages/coach/

# Magic colors not tokenized
grep -rnE "#[0-9a-fA-F]{6}" src/ --include="*.tsx" | grep -v "test\|spec\|index.css"
```

<a id="7-bundle"></a>

## 7. Bundle analysis

### 7.1 Build + measure

```bash
npm run build
# Vite mostra tree-map dei chunks
```

### 7.2 Chunks warning

Cerca:

- Chunks > 500 KB → estrai vendor (vedi `00-CORE` o `01-COACH-PLATFORM`)
- Chunks duplicati (stessa lib in più chunks) → manualChunks config
- Route lazy che non è effettivamente lazy (importi statici in App.tsx)

### 7.3 Visualize

```bash
# Install una tantum
npm install --save-dev rollup-plugin-visualizer

# Aggiungi a vite.config.ts (sotto plugins)
# import { visualizer } from "rollup-plugin-visualizer";
# plugins: [..., visualizer({ open: true })]

npm run build
# Apre treemap HTML interattivo
```

### 7.4 Heavy vendor candidate (oggi)

| Vendor                 | Peso tipico           | Strategia                                          |
| ---------------------- | --------------------- | -------------------------------------------------- |
| @radix-ui/\* (28+ pkg) | 200-300 KB gz         | `vendor-radix` chunk                               |
| @supabase/supabase-js  | ~100 KB gz            | `vendor-supabase` chunk                            |
| @tanstack/react-query  | ~50 KB gz             | `vendor-tanstack` chunk                            |
| recharts + d3          | 150-200 KB gz         | `vendor-charts` chunk + lazy in `/coach/analytics` |
| framer-motion          | ~80 KB gz             | `vendor-motion` chunk                              |
| lucide-react           | varia (tree-shakable) | `vendor-icons` chunk                               |
| @dnd-kit/\*            | ~50 KB gz             | `vendor-dndkit` chunk                              |
| stripe-js              | ~50 KB gz             | `vendor-stripe` chunk + lazy in `/coach/business`  |
| date-fns               | ~30 KB gz             | `vendor-datefns` chunk                             |

<a id="8-db-dead"></a>

## 8. Database dead columns/tables

### 8.1 Trovare tabelle/colonne mai usate nel FE

```bash
# Lista tabelle referenziate nel FE
grep -rn "\.from('" src/ | grep -oP "from\('[^']+'" | sort -u

# Confronta con types.ts (tutte le tabelle)
grep -E "^      [a-z_]+: \{$" src/integrations/supabase/types.ts | head -50
```

Tabelle in `types.ts` ma non greppate nel FE → candidate dead. **Verifica anche edge functions**:

```bash
grep -rn "\.from('" supabase/functions/ | grep -oP "from\('[^']+'" | sort -u
```

### 8.2 Colonne mai usate

Per una tabella sospetta:

```bash
# Lista colonne dalla type
# Per ogni colonna, grep nel FE
grep -rn "\.<column_name>" src/ supabase/functions/
```

Se 0 hits → candidate dead column. **NON cancellare** senza verificare:

- Trigger SQL che la usa
- View / RPC che la legge
- Backup / export workflow

Flag al user, non rimuovere autonomamente.

<a id="9-report"></a>

## 9. Report finale

Output structure proposta:

```
═══════════════════════════════════════════════════
DEAD CODE AUDIT REPORT (2026-05-24)
═══════════════════════════════════════════════════

## High confidence (rimuovere)

- src/hooks/useOldHelper.ts          [hook orfano, 0 callsite]
- src/components/legacy/OldCard.tsx  [file orfano, 0 import]
- src/lib/deprecated/parser.ts       [export orfano]
- console.log dimenticato:           src/pages/coach/X.tsx:42

## Media confidence (verificare)

- npm dep: `moment`                  [non importato — confermare]
- src/components/ui/menubar.tsx      [primitive shadcn non usata — keep?]
- src/types/oldShape.ts              [type esportato non importato]

## Low confidence (chiedere)

- DB column `profiles.legacy_field`  [0 hits FE, possibile uso edge/trigger]
- TODO obsoleto (>30gg):             src/lib/x.ts:88
- Token CSS `--accent-soft`          [0 hits, possibile uso futuro Stitch]

## Bundle warnings

- main chunk: 480 KB gz              [under threshold]
- vendor-radix: 250 KB gz            [estratto, OK]

## Suggested actions

1. Rimuovere 4 file high-confidence (delta -245 righe)
2. Decidere su 3 medium-confidence (chiedere user)
3. Flaggare 3 low-confidence per review manuale
```

<a id="10-cleanup"></a>

## 10. Cleanup workflow

```
1. Genera report (§9)
2. Mostra all'utente
3. Utente conferma quali categorie procedere
4. Per ogni rimozione:
   - Edit/Write per rimuovere
   - Grep cross-file per import orfani residui
   - Build gate (tsc + vite build)
   - Commit atomic con prefisso `chore:`
5. Run audit di nuovo per verificare delta
```

### 10.1 Commit pattern cleanup

```
chore(cleanup): rimuovi 4 file orfani identificati da audit (-245 righe)

- src/hooks/useOldHelper.ts (0 callsite)
- src/components/legacy/OldCard.tsx (0 import)
- src/lib/deprecated/parser.ts (export orfano)
- src/pages/legacy/OldPage.tsx (route rimossa)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

### 10.2 Mai mescolare cleanup con feature/fix

Audit cleanup = commit dedicati. NON aggiungere refactor o feature nello stesso commit — rompi atomic principle.
