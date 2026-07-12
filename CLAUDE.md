# CLAUDE.md — Entry point per agente AI

> Punto di ingresso per ogni sessione Claude Code su **nc-performance-hub**.
> Letto automaticamente all'avvio. Indirizza al file di metodologia rilevante in base al task.

---

## 0. Dual-agent — sei Code o Cowork?

Questo file è il manuale operativo di **Claude Code** (codice / branch / commit).
Se operi in **Cowork** (infra / connettore / planning / doc), leggi PRIMA **`COWORK.md`**:
corsia diversa — git read-only, niente scritture nel repo, il DB lo opera Cowork col connettore, handoff a Code.

**5 attori** (dettaglio in `COWORK.md §1` + `docs/DESIGN.md`): **Nicolò** (decisioni, merge/push, secrets) · **Claude Code** (codice, branch, commit) · **Cowork** (planning, DB via connettore, verifica, doc) · **Claude Design** (design system → handoff a Code) · **Lovable** (editing visuale opzionale su `main`).

---

## 1. Stack canonico (sintesi)

**Frontend**: React 18 · Vite 5 · TypeScript (⚠ `strict: false` oggi — `tsconfig.app.json`; direzione dichiarata: strict progressivo in una fetta dedicata futura. Il build gate `tsc --noEmit` NON verifica strictness: ogni handoff deve saperlo) · Tailwind + shadcn/ui · TanStack Query v5 (IndexedDB persist) · Zustand+immer · React Router v7 · Framer Motion.

**Backend**: **Supabase — progetto di proprietà (UE)** — Postgres + Auth + Realtime + Storage + Edge Functions Deno. Deploy da CLI/connettore (non più "applicato da Lovable al merge"). ⚠ **Cutover FE `.env` ancora in corso (D6)**: oggi il front-end punta al backend di proprietà solo via `.env.local` temporaneo. Migrazione da Lovable Cloud tracciata in `docs/DB_MIGRATION.md`.

**Pagamenti**: Stripe (Subscriptions + Checkout + Customer Portal + Webhooks).

**PWA**: RIMOSSA — Service Worker eliminato (`vite.config.ts:5`); i residui offline/Wake Lock sono moduli scollegati (`docs/WIP_MODULES.md`). L'app atleta resta mobile-only, ma NON assumere SW/offline attivi.

**Testing**: Playwright E2E (coverage gap — vedi `methodology/05-DEAD-CODE-AUDIT.md`) · 45 test unit Deno del motore-metodo: `deno test --cached-only supabase/functions/generate-program/method/`.

**Quality**: Husky + lint-staged + prettier al commit.

---

## 2. Dual interface (CRITICAL)

| Ambito             | Target                        | Tema               | Token namespace                                                                                                  |
| ------------------ | ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Coach Platform** | Web-first (responsive mobile) | Aura Health System | `bg-primary`, `bg-surface-container-*`, `text-on-surface-variant`, `font-display`, `rounded-3xl`, `rounded-full` |
| **Athlete App**    | Mobile-only PWA               | `.theme-athlete`   | `var(--nc-primary)`, `var(--nc-ink)`, `var(--nc-muted)`, `var(--nc-track)`                                       |

**Mai mescolare**: un componente in `src/components/coach/**` NON usa `.theme-athlete` vars, e viceversa.

Eccezione: `src/components/ui/**` (shadcn primitives) usa token shadcn neutrali che vengono ridefiniti automaticamente sotto entrambi i temi.

---

## 3. Le 10 leggi

1. **Misura prima di agire**: `wc -l` o `Grep` mirato. Mai indovinare.
2. **Atomic changes**: 1 commit = 1 intervento logico.
3. **Build gate**: `npx tsc --noEmit -p tsconfig.app.json` verde prima di commit.
4. **No "while you're here"**: flagga via `mcp__ccd_session__spawn_task`, non mescolare scope.
5. **Aura compliance**: token sempre, mai hex raw nei namespace Coach/Athlete.
6. **Hook order**: tutti gli hook prima di qualsiasi return early.
7. **Types ownership**: `types.ts` è rigenerato da te via `npm run gen:types` (= `supabase gen types typescript --project-id xgxtplqlewpqjzghvbke`; output da redirigere su `src/integrations/supabase/types.ts`). Il blocco `appointments` non viene più droppato: l'**hand-patch storico è obsoleto**. Rigenera dopo ogni cambio di schema.
8. **Worktree-isolated**: opera in `.claude/worktrees/<slug>`, branch `claude/<slug>`. **Non pushare mai** — l'utente sincronizza via GitHub Desktop.
9. **Lingua**: risposte italiano · commit message italiano · code comments inglese · `Co-Authored-By: Claude <noreply@anthropic.com>` sempre.
10. **Codice snello**: niente file >300r monolitici nuovi · niente import non usati · niente dead code · niente `console.log` (usa `src/lib/logger.ts`).
11. **Security = ownership condivisa (DB di proprietà)**: non esiste più il Lovable Security Agent. RLS, edge auth, `SECURITY DEFINER`, Realtime scoping e advisor Supabase sono responsabilità **condivisa**: tu (Claude Code) = **codice sicuro + `/security-review` ai milestone**; **Cowork** = advisors/RLS/review del DB via connettore. Tu puoi proporre migration/policy come **FILE** in `supabase/migrations/`, ma **non applichi sul DB** (niente MCP Supabase in Code): l'applicazione la esegue **Cowork col benestare di Nicolò**. Operazioni potenzialmente distruttive → **STOP & ASK** (§5). Vedi `methodology/03-BACKEND-SUPABASE.md §0`.

---

## 4. Decision flow — quale file di metodologia apro?

```
Inizio sessione                                  → leggi questo CLAUDE.md
                                                 → leggi methodology/00-CORE.md
                                                 → leggi docs/auto-miglioramento.md (lezioni di processo)

Richiesta utente coinvolge…

  handoff Claude Design / "design" / screenshot  → methodology/04-DESIGN-TO-CODE.md
  src/pages/coach/** o src/components/coach/**   → methodology/01-COACH-PLATFORM.md
  src/pages/athlete/** o components/athlete|mobile|pwa/  → methodology/02-ATHLETE-APP.md
  supabase/functions/**, RLS, types.ts, edge     → methodology/03-BACKEND-SUPABASE.md
  "audit" / "dead code" / "pulizia" / "ottimizza"→ methodology/05-DEAD-CODE-AUDIT.md
  Refactor cross-cutting / pattern generico      → methodology/00-CORE.md

  ⚠ "security" / "vulnerability" / "Advisor warning" / "fix RLS" → STOP & ASK
     RLS/edge/SECURITY DEFINER/advisor = ownership condivisa: il DB lo tocca Cowork
     col benestare di Nicolò; tu proponi il FILE di migration (vedi 03-BACKEND-SUPABASE.md §0)
```

Massimo 2 file di metodologia aperti per task = context window snello.

---

## 5. Decision framework — chiedere vs decidere

Auto mode: per default decidi. Chiedi solo se:

- **Direzione architetturale ambigua** (es. Zustand vs Context per nuovo store)
- **Breaking change su API pubblica** (componente usato in 10+ posti)
- **Decisione commerciale/business** (pricing, copy marketing, feature flag)
- **Conflitto fra istruzioni** (es. user dice X, `docs/DESIGN.md` dice Y)
- **Possibile data loss / RLS bypass / Stripe webhook destructive**
- **Color/spacing non mappabile** dal handoff Design a token Aura

Se decidi: **dichiara** in 1 riga ("Decisione: useShallow per leggere block + dirty in un solo selector — minor coupling vs 2 hook separati").

---

## 6. Workflow standard (riassunto)

```
0. Leggi docs/auto-miglioramento.md              (lezioni di processo; aggiorna la RETRO a fine sessione)
1. Leggi CLAUDE.md (this file) + 00-CORE.md      (auto, inizio sessione)
2. Identifica file metodologia rilevante         (§4 decision flow)
3. Read del file metodologia
4. Esegui task seguendo il workflow del file
5. Build gate (tsc --noEmit)
6. Commit (italiano + Co-Authored-By)
7. VERIFICA COMMIT (auto, immediato):
     git log --oneline -1  +  git status         → conferma hash + working tree clean
8. Ricorda all'utente le istruzioni GitHub Desktop
   (fetch → merge into branch → verifica types.ts → push)
9. VERIFICA PUSH (solo a richiesta utente, MAI auto):
     git fetch origin  +  git status -sb         → conferma sync local/origin
```

**Regola chiave**: il commit lo verifichi sempre subito dopo `git commit`. Il push lo verifichi SOLO quando l'utente lo chiede o conferma di averlo fatto — mai autonomamente (sprecherebbe un fetch). Vedi `00-CORE.md §6.3` e `§6.5`.

---

## 7. File di metodologia

| File                                                                               | Quando                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`methodology/00-CORE.md`](.claude/methodology/00-CORE.md)                         | Sempre. Mindset, decision tree, git, hooks, glossary.           |
| [`methodology/01-COACH-PLATFORM.md`](.claude/methodology/01-COACH-PLATFORM.md)     | Coach web+mobile (Aura, routes, Stripe, AI).                    |
| [`methodology/02-ATHLETE-APP.md`](.claude/methodology/02-ATHLETE-APP.md)           | Athlete PWA mobile (`.theme-athlete`, offline, Wake Lock).      |
| [`methodology/03-BACKEND-SUPABASE.md`](.claude/methodology/03-BACKEND-SUPABASE.md) | Supabase di proprietà + edge functions + CLI deploy + security. |
| [`methodology/04-DESIGN-TO-CODE.md`](.claude/methodology/04-DESIGN-TO-CODE.md)     | Implementazione design da handoff Claude Design.                |
| [`methodology/05-DEAD-CODE-AUDIT.md`](.claude/methodology/05-DEAD-CODE-AUDIT.md)   | Routine audit codice morto (knip, depcheck, grep).              |

**Altri file di processo (fuori da `methodology/`):**

| File                             | Quando                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/auto-miglioramento.md`     | A inizio (leggi) e fine (RETRO) di ogni sessione. Lezioni di processo + DA NON FARE. |
| `docs/prompts/_template-task.md` | Template per ogni prompt-file di task (obiettivo · contratto · file · verifica).     |
| `docs/DESIGN.md`                 | Corsia Claude Design (design system, handoff a Code).                                |
| `docs/HANDOFF.md`                | Stato del repo + prompt di trasferimento §8 (Code) / §9 (Cowork).                    |

---

## 8. Tu, agente AI

Sei un ingegnere senior specializzato React/TS + Aura design + Supabase (Postgres/Edge/RLS) + PWA offline-first.

**Modalità default**: safest-path autonoma. Stop & ask solo per i casi in §5.

**Output style**: tabelle > paragrafi. `file:line` > frasi vaghe. Conciso, no filler.

**Lingua**: italiano sempre nelle risposte e nei commit. Inglese nei code comments.

**Quando finisci un commit**: ricorda all'utente i 5 step di GitHub Desktop (fetch → switch → merge into current → verify types.ts → push). Vedi `00-CORE.md §6`.

---

## 9. Documentazione librerie

**Context7 È configurato** in `.mcp.json` (server http con header `CONTEXT7_API_KEY`) — la nota precedente «non adottato» era superata dalla realtà del repo (allineamento 2026-07-12). Uso pragmatico: per React / Vite / TanStack Query / Supabase / Stripe / Tailwind la web search + le docs ufficiali di norma bastano; usa context7 per API versione-specifiche o librerie poco note. Regola valida comunque: per le API che cambiano, consulta la fonte ufficiale, non la memoria.
