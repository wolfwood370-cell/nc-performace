# 00 — Core methodology

> Principi cross-progetto. Leggi sempre all'inizio sessione, insieme a `CLAUDE.md`.

---

## Indice

1. [Mindset esteso](#1-mindset)
2. [Decision framework (chiedere vs decidere)](#2-decision)
3. [Decision tree: state management](#3-state-tree)
4. [Decision tree: dove metto il file](#4-placement-tree)
5. [Decision tree: hook vs lib vs inline](#5-extraction-tree)
6. [Git workflow worktree](#6-git)
7. [Commit conventions](#7-commits)
8. [Hook order safety](#8-hook-order)
9. [types.ts: regen di proprietà (hand-patch OBSOLETO)](#9-handpatch)
10. [Pre-commit checklist](#10-precommit)
11. [Glossary dominio](#11-glossary)

---

<a id="1-mindset"></a>

## 1. Mindset esteso

1. **Misura prima di agire.** `wc -l src/**/*.tsx | sort -rn | head` o Grep mirato.
2. **Atomic changes.** 1 commit = 1 intervento. Revert chirurgico > bulk rollback.
3. **Build gate non-negoziabile.** `npx tsc --noEmit -p tsconfig.app.json` verde.
4. **Diminishing returns first.** I 3 file più pesanti = ROI massimo.
5. **No "while you're here".** Out-of-scope → `mcp__ccd_session__spawn_task`, mai mescolare.
6. **Aura/theme compliance non-negoziabile.** Coach usa Aura tokens; Athlete usa `.theme-athlete`. Mai mescolare.
7. **Hook order è legge.** Tutti gli hook PRIMA di qualsiasi return early. Anti-pattern canonico §8.
8. **Types ownership.** `types.ts` si rigenera con `supabase gen types typescript --linked` (DB di proprietà); l'hand-patch `appointments` è **obsoleto** (§9, `CLAUDE.md` legge #7).
9. **Worktree-isolated.** Tu (AI) operi in `.claude/worktrees/<slug>`, branch `claude/<slug>`. **Push consentito SOLO verso rami `claude/*`** — mai su `main`, mai `--force`, mai cancellazioni di rami; la fetta si chiude con una PR verso `main` e il merge lo fa Nicolò (§6).
10. **Codice snello.** No file >300r nuovi · no import inutili · no dead code · no `console.log` nuovi — **convenzione, non cancello**: `no-console` è a `warn` (`eslint.config.js:51`) e il ratchet CI conta solo `errorCount` (`.github/workflows/ci.yml:94`), per la scelta scritta a `eslint.config.js:56-57`.

<a id="2-decision"></a>

## 2. Decision framework: chiedere vs decidere

🔴 **La regola vive in `CLAUDE.md §5`, e la modalità di partenza della sessione è configurazione (`.claude/settings.json:3`, plan mode). Qui NON c'è una seconda regola: c'è il repertorio degli esempi.** Se questa tabella e `CLAUDE.md §5` divergono, vince `CLAUDE.md §5` e la divergenza si chiude lì, non qui. Casi in cui si chiede via `AskUserQuestion`:

| Caso                                                        | Esempio                                                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direzione architetturale ambigua**                        | "Usiamo Zustand o Context per il nuovo store?" — solo se l'impatto è cross-cutting (>3 file)                                                                         |
| **Breaking change su API pubblica**                         | Cambio props di un componente usato in 10+ posti                                                                                                                     |
| **Decisione commerciale/business**                          | Pricing, copy marketing, feature flag, default plan                                                                                                                  |
| **Conflitto fra istruzioni**                                | User dice X, DESIGN.md dice Y                                                                                                                                        |
| **Possibile data loss**                                     | Migration destructive, drop column, cascade delete                                                                                                                   |
| **RLS bypass o Stripe destructive**                         | Disabilitazione policy, modifica webhook event handling                                                                                                              |
| **Security issue / Advisor warning**                        | **SEMPRE chiedi** — default: Cowork prepara il fix (advisors/RLS via connettore), Nick approva; Code propone il FILE di migration (vedi `03-BACKEND-SUPABASE.md §0`) |
| **Color/spacing non mappabile** handoff Design → token Aura | Hex che non corrisponde a nessun token esistente                                                                                                                     |

Se decidi senza chiedere, **dichiara** in 1 riga nella risposta:

> "Decisione: useShallow per leggere `block + dirty` in un solo selector — minor coupling vs 2 hook separati."

<a id="3-state-tree"></a>

## 3. Decision tree: state management

```
Il dato vive sul server (Supabase)?
  ├── SÌ → TanStack Query
  │        - queryKey gerarchico ["domain", "subdomain", id]
  │        - invalidateQueries dopo mutation
  │        - staleTime tipato (vedi 01-COACH-PLATFORM §6 o 02-ATHLETE-APP §5)
  │
  └── NO → è state client-only
           │
           Lo state è condiviso fra >2 component non-contigui?
             ├── SÌ → Zustand store in src/stores/
             │        - slice pattern se >300r
             │        - useShallow per oggetti multi-field
             │        - immer middleware
             │
             └── NO → è state locale di 1 component?
                      ├── SÌ → useState/useReducer in-component
                      │
                      └── NO → è cross-cutting (theme/auth/i18n)?
                               └── Context Provider in src/providers/
```

**Esempi reali**:

- `block` (ProgramBuilder) → Zustand (consumato da Header, MacroTimeline, WeekGrid, ProgressionInspector)
- `selectedWeekId` (ProgramBuilder) → useState locale
- `athletes` (roster coach) → TanStack Query
- `dark mode` → next-themes Context
- `offline queue` → OfflineSyncProvider custom

<a id="4-placement-tree"></a>

## 4. Decision tree: dove metto il file

```
È una pagina collegata a una route?         → src/pages/<coach|athlete|legal|onboarding>/
È un sub-componente Coach?                  → src/components/coach/<area>/<Name>.tsx
È un sub-componente Athlete?                → src/components/athlete/ o components/mobile/
È una primitiva UI riusabile cross-tema?    → src/components/ui/<lowercase-name>.tsx
È un custom hook React?                     → src/hooks/use<Name>.ts
È pure logic (math, mapping, validation)?   → src/lib/<dominio>/<name>.ts
È uno store Zustand?                        → src/stores/use<Name>Store.ts o src/stores/<dominio>/
È un context provider?                      → src/providers/<Name>Provider.tsx
È un domain type?                           → src/types/<dominio>.ts
È una edge function Deno?                   → supabase/functions/<kebab-name>/index.ts
È un test E2E?                              → tests/<name>.spec.ts
```

<a id="5-extraction-tree"></a>

## 5. Decision tree: hook vs lib vs inline

| Caratteristica                                   | Custom hook | Lib helper  | Inline |
| ------------------------------------------------ | ----------- | ----------- | ------ |
| Usa React hooks (useState, useEffect, useQuery)? | **SÌ**      | NO          | sì     |
| Pure logic (`(input) => output`)?                | NO          | **SÌ**      | varia  |
| Riusato in 2+ component?                         | sì → estrai | sì → estrai | NO     |
| Side-effect (DB write, toast, navigate)?         | **SÌ**      | NO          | rare   |

**Regola pratica**:

- Logica che chiama `useQuery`, `useStore`, `useEffect` → **hook** in `src/hooks/`
- Funzione pura → **lib** in `src/lib/`
- Helper usato 1 volta e <20r → **lascia inline**

### 5.1 Quando rompo in più file?

```
Il blocco JSX è > 40 righe?
  ├── NO → inline
  │
  └── SÌ → ha state/handler propri?
           ├── NO → function locale nel file (sub-component privato)
           │
           └── SÌ → è riusabile in altri file?
                    ├── NO → function locale nel file
                    │
                    └── SÌ → file separato in src/components/<area>/<Name>.tsx
```

<a id="6-git"></a>

## 6. Git workflow worktree

Flusso (legge #8 rivista 2026-08-01): ramo `claude/<slug>` → commit atomici → **push del ramo** → **PR verso `main`** → i 2 controlli obbligatori verdi (`Tipi · lint · unit (web)` + `Unit edge function (Deno)`) → **merge di Nicolò dalla PR**.

**Dove sta il cancello vero: sul server.** Il ruleset del repository su `main` (PR obbligatoria, bypass list vuota) è fuori dalla portata di qualunque agente. L'hook locale `.claude/hooks/hooks.mjs` (push solo verso `claude/*`, niente `--force`, niente cancellazioni — intercetta i comandi del tool Bash) è una cintura di sicurezza, non il cancello. Pattern:

### 6.1 Setup (una tantum, eseguito dall'utente o dall'AI nella prima sessione)

```bash
# Dal repo principale
git worktree add .claude/worktrees/<slug> -b claude/<slug>
```

### 6.2 Loop AI (per ogni intervento)

```bash
git status                                    # 1. Verifica pulizia
# ... edit/extract/fix via tool calls ...    # 2. Cambi
npx tsc --noEmit -p tsconfig.app.json        # 3. Build gate
git add <files specifici, no -A>             # 4. Stage
git commit -m "<tipo>(<area>): <msg ita>     # 5. Commit + co-author
# 6. Verifica commit success (sempre, auto, immediato)
git log --oneline -1                          # → mostra hash + msg del nuovo commit
git status                                    # → working tree clean
# 7. A fine fetta: push del ramo + PR (§6.4) — mai push su main
```

### 6.3 Verifica commit success (sempre, auto)

Dopo ogni `git commit`, IMMEDIATAMENTE:

```bash
git log --oneline -1     # Conferma hash + msg del commit appena creato
git status               # Conferma working tree clean (no file modificati residui)
```

Se commit ha emesso warning prettier/lint-staged (es. CRLF/LF, reformat), è OK — il commit è andato. Se invece `git status` mostra "Changes not staged" → il commit non ha incluso tutti i file: STOP e segnala all'utente.

### 6.4 Chiusura fetta — push del ramo + PR (sostituisce il vecchio loop GitHub Desktop)

1. **Base aggiornata**: il ramo nasce da `origin/main` (`git fetch` prima di crearlo); se `main` è avanzato durante la fetta, riallinea PRIMA della PR — **merge di `origin/main` nel ramo, MAI rebase di un ramo già pushato** (richiederebbe il `--force` vietato).
2. **Verifica `types.ts`**: se lo schema è cambiato e i tipi sono stale, rigenera con `npm run gen:types` (§9) prima della PR.
3. **Passata indipendente** (`.claude/agents/`, contesto proprio, sola lettura, ≤250 parole ciascuno): `supabase-rls-auditor` se la fetta ha toccato `supabase/**` · `aura-theme-auditor` se ha toccato UI Coach/Athlete · `code-reviewer` sul diff · `code-test-verifier` sui gate. Sono già scritti e tarati su questo repo: usare agenti improvvisati al loro posto ha già costato due lezioni (`docs/auto-miglioramento.md:127`, `:474`).
4. `git push -u origin claude/<slug>` — **unica destinazione consentita: un ramo `claude/*`** (hook come cintura; il ruleset server è il cancello).
5. **Apri la PR verso `main`** (API GitHub col token del credential manager — la CLI `gh` non è installata su questa macchina).
6. I 2 controlli obbligatori devono essere verdi; **il merge dalla PR lo fa Nicolò**, mai l'agente.

### 6.5 Verifica push (subito dopo il TUO push) e stato del merge

Il push del ramo lo fai tu → lo verifichi subito, come il commit:

```bash
git status -sb    # atteso: ## claude/<slug>...origin/claude/<slug> senza ahead/behind
```

| Output `git status -sb`                               | Significato                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `## claude/<slug>...origin/claude/<slug>` senza ahead | ✅ Push del ramo riuscito                                     |
| `[ahead N]`                                           | ❌ Push non riuscito/parziale — N commit locali non su origin |
| `[behind N]` / `[ahead N, behind M]`                  | ⚠️ Origin ha commit che il locale non ha — riallinea il ramo  |

Il **merge in `main`** resta di Nicolò: NON verificarlo in automatico. Solo quando lui lo conferma (o lo chiede): `git fetch origin` + `git log --oneline -3 origin/main` per vedere il merge della PR.

### 6.6 Cleanup branch (post-merge in main)

```bash
# Dal repo principale (NON dal worktree)
git worktree remove .claude/worktrees/<slug>
git branch -d claude/<slug>
```

<a id="7-commits"></a>

## 7. Commit conventions

### 7.1 Format

```
<tipo>(<area>): <descrizione concisa italiano>

[corpo opzionale: perché, non cosa]

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 7.2 Tipi

| Tipo                 | Uso                                                             |
| -------------------- | --------------------------------------------------------------- |
| `feat:`              | Nuova feature                                                   |
| `fix:`               | Bug fix                                                         |
| `refactor:`          | Refactor senza cambio comportamento                             |
| `style:` / `design:` | Solo cosmetic / Aura tokens / implementazione da handoff Design |
| `chore:`             | Config, deps, lint                                              |
| `docs:`              | Solo documentazione                                             |
| `perf:`              | Performance optimization                                        |
| `test:`              | Solo test                                                       |

### 7.3 Aree esempio

`coach`, `athlete`, `auth`, `pwa`, `stripe`, `ai`, `db`, `ui`, `edge`, `deps`, `tokens`.

### 7.4 Esempi reali

```
fix(coach): sposta hooks prima del early return in ProgramBuilder (Rendered more hooks bug)
feat(athlete): aggiungi daily-checkin streak counter
refactor(coach): estrai WeekTimelineCard da ProgramBuilder (-79 righe)
style(athlete): porta AthleteDashboard ai token .theme-athlete
design(coach): implementa da handoff Design CoachInbox layout 3-column
chore(deps): aggiungi knip + depcheck per audit codice morto
```

<a id="8-hook-order"></a>

## 8. Hook order safety

### Sintomo

```
Error: Rendered more hooks than during the previous render.
```

### Causa

Hook (`useState`, `useMemo`, `useCallback`, `useEffect`, custom hooks) chiamato **dopo** un return condizionale.

### Anti-pattern

```tsx
function Page() {
  const block = useStore((s) => s.block);
  if (!block) return <Loading />;        // ← early return
  const count = useMemo(...);            // ❌ hook dopo return
}
```

### Pattern corretto

```tsx
function Page() {
  const block = useStore((s) => s.block);

  // ✅ Hook PRIMA dei return, deps nullable-safe
  const count = useMemo(() => (block?.weeks ?? []).length, [block?.weeks]);

  if (!block) return <Loading />;

  return <div>{count}</div>;
}
```

### Checklist per ogni componente toccato

- [ ] Tutti `useState` prima di qualsiasi return
- [ ] Tutti `useMemo` / `useCallback` prima di qualsiasi return
- [ ] Tutti `useEffect` prima di qualsiasi return
- [ ] Tutti custom hook (`useQuery`, `useStore`, …) prima di qualsiasi return
- [ ] Deps usano `?.` / fallback per state nullable

Caso canonico applicato: commit `b7cef88` su `ProgramBuilder.tsx`.

<a id="9-handpatch"></a>

## 9. types.ts — regen di proprietà (hand-patch OBSOLETO)

> **OBSOLETO (nota storica).** L'hand-patch del blocco `appointments` serviva quando `types.ts` era rigenerato dalla piattaforma Lovable, che lo droppava a ogni regen. Con il DB di proprietà il regen è deterministico e **include `appointments`**: niente più drop, niente cast `(supabase as any)`.

**Oggi** (allineato a `CLAUDE.md` legge #7): dopo ogni cambio di schema →

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
npx tsc --noEmit -p tsconfig.app.json
```

<a id="10-precommit"></a>

## 10. Pre-commit checklist

- [ ] `npx tsc --noEmit -p tsconfig.app.json` verde
- [ ] Hook order check sui file toccati (§8)
- [ ] Theme audit sui file toccati (Coach: token Aura · Athlete: `.theme-athlete`)
- [ ] No `console.log` residui (usa `src/lib/logger.ts`) — **voce a occhio umano**: nessuno strumento la verifica al commit (`no-console` è `warn`, il ratchet CI conta solo `errorCount`)
- [ ] No `// TODO` introdotti senza ticket
- [ ] Import orfani rimossi
- [ ] Commit message italiano, prefisso `<tipo>:` corretto
- [ ] `Co-Authored-By: Claude`

**Nota Husky**: prettier riformatta `*.{ts,tsx,css,md,json}` al commit. Diff finale può differire dal write (line wrap, trailing comma) — non rifare Read solo per verificare.

<a id="11-glossary"></a>

## 11. Glossary dominio

### Training science

| Termine        | Significato                                              |
| -------------- | -------------------------------------------------------- |
| **ACWR**       | Acute:Chronic Workload Ratio. >1.5 = rischio infortunio  |
| **RPE**        | Rate of Perceived Exertion (1-10). RPE 10 = no reps left |
| **RIR**        | Reps In Reserve. RIR 0 ≈ RPE 10                          |
| **%1RM**       | Percentage of 1-Rep Max                                  |
| **FMS**        | Functional Movement Screen (7 movimenti, 0-3 cad)        |
| **VBT**        | Velocity-Based Training                                  |
| **HRV**        | Heart Rate Variability                                   |
| **TDEE**       | Total Daily Energy Expenditure                           |
| **Mesocycle**  | Blocco 4-12 settimane                                    |
| **Microcycle** | 1 settimana (`Microcycle` in `src/types/training.ts`)    |
| **Macrocycle** | Periodo lungo (`ProgramBlock`)                           |
| **Deload**     | Settimana volume ridotto per recupero                    |

### Roles & flow

| Termine              | Significato                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Coach**            | `role = 'coach'`. Accede a `/coach/*`. Web-first responsive                                                                    |
| **Athlete**          | `role = 'athlete'`. Accede a `/athlete/*`. Ha `coach_id` FK. Mobile PWA                                                        |
| **Subscription**     | Stripe subscription gating `/coach/*`                                                                                          |
| **Onboarding**       | Multi-step wizard athlete (biometrics + lifestyle + neurotype)                                                                 |
| **Readiness**        | Score giornaliero athlete (sleep + HRV + stress + soreness)                                                                    |
| **Aura**             | Design system Coach (refactor attivo)                                                                                          |
| **`.theme-athlete`** | Tema CSS scope per Athlete PWA                                                                                                 |
| **Claude Design**    | Corsia design: design system + prototipi → handoff a Code (`docs/DESIGN.md`)                                                   |
| **Lovable**          | Lovable.dev — editor visuale opzionale su `main`; ex hosting backend (migrato a Supabase di proprietà, `docs/DB_MIGRATION.md`) |

### Tech terms

| Termine             | Significato                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **Worktree**        | `.claude/worktrees/<slug>` — copia branch isolata per AI agent                                     |
| **Hand-patch**      | Modifica manuale a file auto-generato — storico: il caso `types.ts`/`appointments` è obsoleto (§9) |
| **Slice pattern**   | Zustand store splittato in più file per dominio (`src/stores/programBuilder/`)                     |
| **Aura compliance** | Uso di soli token Aura/`.theme-athlete`, mai hex raw                                               |
| **PWA install**     | Athlete app installabile come app nativa su mobile                                                 |
