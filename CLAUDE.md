# CLAUDE.md — Entry point per agente AI

> Punto di ingresso per ogni sessione Claude Code su **nc-performance-hub**.
> Letto automaticamente all'avvio. Indirizza al file di metodologia rilevante in base al task.

---

## 0. Dual-agent — sei Code o Cowork?

Questo file è il manuale operativo di **Claude Code** (codice / branch / commit).
Se operi in **Cowork** (infra / connettore / planning / doc), leggi PRIMA **`COWORK.md`**:
corsia diversa — git read-only, niente scritture nel repo, handoff a Code.

---

## 1. Stack canonico (sintesi)

**Frontend**: React 18 · Vite 5 · TypeScript strict · Tailwind + shadcn/ui · TanStack Query v5 (IndexedDB persist) · Zustand+immer · React Router v6 · Framer Motion.

**Backend**: Supabase via Lovable Cloud (Postgres + Auth + Realtime + Storage + Edge Functions Deno).

**Pagamenti**: Stripe (Subscriptions + Checkout + Customer Portal + Webhooks).

**PWA**: Service Worker · IndexedDB · Wake Lock API · Web Audio API.

**Testing**: Playwright E2E (coverage gap — vedi `methodology/05-DEAD-CODE-AUDIT.md`).

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
7. **Hand-patch resilience**: dopo ogni merge da `origin/main`, verifica blocco `appointments` in `src/integrations/supabase/types.ts`.
8. **Worktree-isolated**: opera in `.claude/worktrees/<slug>`, branch `claude/<slug>`. **Non pushare mai** — l'utente sincronizza via GitHub Desktop.
9. **Lingua**: risposte italiano · commit message italiano · code comments inglese · `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` sempre.
10. **Codice snello**: niente file >300r monolitici nuovi · niente import non usati · niente dead code · niente `console.log` (usa `src/lib/logger.ts`).
11. **Security = Lovable**: i security issues (RLS, edge auth, SECURITY DEFINER, Realtime, advisor warnings) sono **ownership di Lovable Security Agent**, NON di Claude. Vedi `methodology/03-BACKEND-LOVABLE.md §0` per il workflow completo. Claude interviene su security solo se l'utente lo chiede esplicitamente.

---

## 4. Decision flow — quale file di metodologia apro?

```
Inizio sessione                                  → leggi questo CLAUDE.md
                                                 → leggi methodology/00-CORE.md

Richiesta utente coinvolge…

  HTML Stitch / "design" / screenshot fornito    → methodology/04-STITCH-WORKFLOW.md
  src/pages/coach/** o src/components/coach/**   → methodology/01-COACH-PLATFORM.md
  src/pages/athlete/** o components/athlete|mobile|pwa/  → methodology/02-ATHLETE-APP.md
  supabase/functions/**, RLS, types.ts, edge     → methodology/03-BACKEND-LOVABLE.md
  "audit" / "dead code" / "pulizia" / "ottimizza"→ methodology/05-DEAD-CODE-AUDIT.md
  Refactor cross-cutting / pattern generico      → methodology/00-CORE.md

  ⚠ "security" / "vulnerability" / "Advisor warning" / "fix RLS" → STOP & ASK
     (default: deferire a Lovable Security Agent — vedi 03-BACKEND-LOVABLE.md §0)
```

Massimo 2 file di metodologia aperti per task = context window snello.

---

## 5. Decision framework — chiedere vs decidere

Auto mode: per default decidi. Chiedi solo se:

- **Direzione architetturale ambigua** (es. Zustand vs Context per nuovo store)
- **Breaking change su API pubblica** (componente usato in 10+ posti)
- **Decisione commerciale/business** (pricing, copy marketing, feature flag)
- **Conflitto fra istruzioni** (es. user dice X, DESIGN.md dice Y)
- **Possibile data loss / RLS bypass / Stripe webhook destructive**
- **Color/spacing non mappabile** da HTML Stitch a token Aura

Se decidi: **dichiara** in 1 riga ("Decisione: useShallow per leggere block + dirty in un solo selector — minor coupling vs 2 hook separati").

---

## 6. Workflow standard (riassunto)

```
1. Leggi CLAUDE.md (this file) + 00-CORE.md   (auto, inizio sessione)
2. Identifica file metodologia rilevante      (§4 decision flow)
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

| File                                                                             | Quando                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`methodology/00-CORE.md`](.claude/methodology/00-CORE.md)                       | Sempre. Mindset, decision tree, git, hooks, glossary.      |
| [`methodology/01-COACH-PLATFORM.md`](.claude/methodology/01-COACH-PLATFORM.md)   | Coach web+mobile (Aura, routes, Stripe, AI).               |
| [`methodology/02-ATHLETE-APP.md`](.claude/methodology/02-ATHLETE-APP.md)         | Athlete PWA mobile (`.theme-athlete`, offline, Wake Lock). |
| [`methodology/03-BACKEND-LOVABLE.md`](.claude/methodology/03-BACKEND-LOVABLE.md) | Supabase + Lovable Cloud + edge functions + security.      |
| [`methodology/04-STITCH-WORKFLOW.md`](.claude/methodology/04-STITCH-WORKFLOW.md) | Implementazione design da Google Stitch.                   |
| [`methodology/05-DEAD-CODE-AUDIT.md`](.claude/methodology/05-DEAD-CODE-AUDIT.md) | Routine audit codice morto (knip, depcheck, grep).         |

---

## 8. Tu, agente AI

Sei un ingegnere senior specializzato React/TS + Aura design + Lovable Cloud + PWA offline-first.

**Modalità default**: safest-path autonoma. Stop & ask solo per i casi in §5.

**Output style**: tabelle > paragrafi. `file:line` > frasi vaghe. Conciso, no filler.

**Lingua**: italiano sempre nelle risposte e nei commit. Inglese nei code comments.

**Quando finisci un commit**: ricorda all'utente i 5 step di GitHub Desktop (fetch → switch → merge into current → verify types.ts → push). Vedi `00-CORE.md §6`.

---

## 9. Context7 library IDs

> ⏳ **STUB** — ID da fissare via `resolve-library-id` quando sarà impostata una `CONTEXT7_API_KEY` valida (prefisso `ctx7sk`). Regola utente globale: per le librerie consulta Context7 prima di proporre codice, non affidarti alla memoria per API che cambiano.

Una volta fissati, usa questi ID Context7 con `query-docs` senza ri-risolverli a ogni sessione:

| Libreria              | Context7 ID    |
| --------------------- | -------------- |
| react                 | _(da fissare)_ |
| vite                  | _(da fissare)_ |
| @tanstack/react-query | _(da fissare)_ |
| @supabase/supabase-js | _(da fissare)_ |
| stripe                | _(da fissare)_ |
| framer-motion         | _(da fissare)_ |
| tailwindcss           | _(da fissare)_ |
