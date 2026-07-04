# 01 — Coach Platform (web-first, responsive mobile)

> Metodologia per lavoro su `src/pages/coach/**`, `src/components/coach/**`, hook coach, store coach.
>
> Target: **desktop primary**, ma **deve essere usable su mobile** (Coach può ricevere alert e rispondere da telefono).

---

## Indice

1. [Route map + auth guard](#1-routes)
2. [Aura Health System — token completi](#2-aura)
3. [Layout patterns canonical](#3-layouts)
4. [Responsive breakpoints + mobile considerations](#4-responsive)
5. [Stores Coach (Zustand)](#5-stores)
6. [TanStack Query patterns Coach](#6-query)
7. [Stripe integration (subscription gate)](#7-stripe)
8. [AI Copilot patterns](#8-ai)
9. [Anti-pattern Coach-specific](#9-antipatterns)

---

<a id="1-routes"></a>

## 1. Route map + auth guard

Tutte le route coach sono **lazy-loaded** (`React.lazy()`) e wrappate in `<SubscriptionGuard>`.

```tsx
<Route
  path="/coach/programs"
  element={
    <SubscriptionGuard>
      <ProgramBuilder />
    </SubscriptionGuard>
  }
/>
```

`SubscriptionGuard` (`src/components/auth/SubscriptionGuard.tsx`):

- Verifica `auth.uid()` esista
- Verifica `role === 'coach'`
- Verifica Stripe subscription attiva (status `active` o `trialing`)
- Redirect a `/auth` o billing setup se fail

### 1.1 Route map completa

| Path                 | Page                |      LOC | Aura status              |
| -------------------- | ------------------- | -------: | ------------------------ |
| `/coach`             | `CoachHome`         |      715 | ✅ refactored            |
| `/coach/athletes`    | `CoachAthletes`     |     ~400 | ✅ refactored            |
| `/coach/athlete/:id` | `AthleteDetail`     | **3200** | ⚠️ split needed          |
| `/coach/programs`    | `ProgramBuilder`    |      843 | ✅ refactored            |
| `/coach/calendar`    | `CoachCalendar`     |      739 | ✅ refactored            |
| `/coach/messages`    | `CoachMessages`     |     ~500 | ✅ refactored            |
| `/coach/library`     | `CoachLibrary`      |     ~400 | parziale                 |
| `/coach/exercises`   | `ExerciseDatabase`  |     ~350 | parziale                 |
| `/coach/analytics`   | `CoachAnalytics`    |     ~500 | TODO                     |
| `/coach/business`    | `CoachBusiness`     |     ~400 | TODO                     |
| `/coach/inbox`       | `CoachCheckinInbox` |      842 | ✅ refactored            |
| `/coach/fms`         | `FmsScreening`      |     ~400 | TODO                     |
| `/coach/knowledge`   | `KnowledgeBase`     |      586 | TODO                     |
| `/coach/copilot`     | `MasterCopilot`     |     ~500 | TODO                     |
| `/coach/settings`    | `CoachSettings`     |      829 | TODO — split per sezione |

### 1.2 Come aggiungere una nuova route coach

```
1. Crea file in src/pages/coach/CoachXxx.tsx
2. Aggiungi lazy import in src/App.tsx:
     const CoachXxx = lazy(() => import("./pages/coach/CoachXxx"));
3. Aggiungi <Route> wrappato in <SubscriptionGuard>:
     <Route path="/coach/xxx" element={<SubscriptionGuard><CoachXxx /></SubscriptionGuard>} />
4. Aggiungi link in CoachSidebar (src/components/coach/CoachSidebar.tsx)
5. Aggiungi voce in CoachBottomNav se serve in mobile
```

<a id="2-aura"></a>

## 2. Aura Health System — token completi

Source of truth: `src/index.css` (CSS vars `:root`) + `tailwind.config.ts` (Tailwind mapping).

### 2.1 Background

```
bg-background                 hsl(207 100% 98%) — surface base
bg-card                       white — Level 1 elevation
bg-surface                    alias di background
bg-surface-container-lowest   #ffffff
bg-surface-container-low      #eaf5ff (sky-tinted muted)
bg-surface-container          #def0ff
bg-surface-container-high     #d2ecff
bg-surface-container-highest  #cbe6fb
bg-muted                      #eaf5ff (alias di low)
```

### 2.2 Primary brand

```
bg-primary                    #003e62 (deep navy CTA)
text-primary
text-primary-foreground       white
bg-primary-container          #005685 (button bg)
text-on-primary-container     #91cbff
```

### 2.3 Secondary / tertiary / accent

```
bg-secondary                  #b2d8ff (soft sky)
text-on-secondary-container   #385f81
bg-accent                     #b2d8ff (hover)
bg-tertiary-container         #774616 (warm — "Attenzione" badges)
text-on-tertiary-container    #fcb67c
```

### 2.4 Text

```
text-foreground               #001e2d (on-surface primary)
text-muted-foreground         #41474f (alias di on-surface-variant)
text-on-surface-variant       #41474f (muted body)
```

### 2.5 Border

```
border-border                 #c1c7d0 (outline-variant)
border-outline                #717880
border-outline-variant/15     hairline glass
border-outline-variant/40     visible separator
```

### 2.6 Radius

```
rounded-sm                    0.5rem
rounded                       1rem (default)
rounded-md                    1.5rem (24px — cards)
rounded-lg                    2rem (32px — large cards)
rounded-xl                    custom — input/select
rounded-3xl                   ultra-rounded card aura
rounded-full                  pill button
```

### 2.7 Typography (Manrope + Inter + Geist Mono)

```
font-sans                     Inter (body)
font-display                  Manrope (heading)
font-mono                     Geist Mono

text-headline-md              hero H1/H2
text-label-md                 section label
text-body-md                  paragraph
text-2xs                      11px (badges)
text-3xs                      10px (micro tags)
text-4xs                      9px (super-micro)
text-5xs                      8px (eccezionale)
```

### 2.8 Status colors

```
bg-destructive                #ba1a1a (error)
bg-warning                    #774616 (warm/attenzione)
bg-success                    emerald (preserved non-Aura)
```

### 2.9 Charts

```
stroke-chart-volume           emerald
stroke-chart-intensity        violet
stroke-chart-fatigue          rose
stroke-chart-grid             slate-200
stroke-chart-axis             slate-500
stroke-chart-muted            slate-400
stroke-chart-calories         sky-500
stroke-chart-weight           amber-500
```

### 2.10 Audit grep (Aura compliance)

```bash
# Deve ritornare 0 hits NEW dentro src/components/coach/** e src/pages/coach/**
grep -rn -E "(#[0-9a-fA-F]{3,8}|rgb\(|bg-(blue|gray|slate|stone|zinc)-[0-9])" \
  src/components/coach src/pages/coach \
  | grep -v "node_modules\|\.test\.\|\.spec\."
```

<a id="3-layouts"></a>

## 3. Layout patterns canonical

### 3.1 `CoachLayout` wrapper (default)

```tsx
<CoachLayout title="Program Builder" subtitle="Design periodized training blocks">
  {/* contenuto pagina */}
</CoachLayout>
```

- Header sticky con titolo + sottotitolo
- `CoachSidebar` 4-block (Operative / Performance & Strategy / Intelligence / Scaling)
- `CoachBottomNav` glassmorphism su mobile (<lg breakpoint)
- Identity tile in basso a sidebar
- Token: `bg-surface`, `border-outline-variant/15`, `rounded-3xl`

### 3.2 3-column workspace (es. CoachMessages, AthleteDetail)

```tsx
<div className="h-[calc(100vh-2rem)] flex overflow-hidden p-4 gap-6 bg-surface">
  {/* Left rail: directory / list */}
  <aside className="w-[320px] flex-shrink-0 rounded-3xl bg-surface-container-lowest ...">
    {/* ChatList o AthleteList */}
  </aside>
  {/* Main: workspace */}
  <main className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-3xl ...">
    {/* ChatPane o ProgramBuilder grid */}
  </main>
  {/* Right rail: context panel */}
  <ProgressionInspector /> {/* o AthleteContextPane */}
</div>
```

### 3.3 Bento dashboard (es. CoachHome)

Grid 12-col responsive con tile a span variabile:

```tsx
<div className="grid grid-cols-12 gap-4 p-4">
  <Tile className="col-span-12 lg:col-span-8" /> {/* Centrale Operativa */}
  <Tile className="col-span-12 lg:col-span-4" /> {/* Triage */}
  <Tile className="col-span-12 md:col-span-6 lg:col-span-4" /> {/* Pulse */}
  {/* ... */}
</div>
```

### 3.4 Split-pane (es. CoachCheckinInbox)

Left list + right preview, responsive collapse a mobile.

<a id="4-responsive"></a>

## 4. Responsive breakpoints + mobile considerations

Coach platform è **desktop-first** ma **deve funzionare su mobile**.

### 4.1 Tailwind breakpoints (default)

| Breakpoint | Min width | Target tipico                    |
| ---------- | --------- | -------------------------------- |
| (default)  | 0         | Mobile portrait                  |
| `sm:`      | 640px     | Mobile landscape                 |
| `md:`      | 768px     | Tablet portrait                  |
| `lg:`      | 1024px    | Tablet landscape / Desktop small |
| `xl:`      | 1280px    | Desktop standard                 |
| `2xl:`     | 1536px    | Desktop large                    |

### 4.2 Pattern responsive

```tsx
{/* 3-column desktop → 1-column stacked mobile */}
<div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
  <aside className="w-full lg:w-[320px]">{/* list */}</aside>
  <main className="flex-1">{/* main */}</main>
  <aside className="w-full lg:w-[360px]">{/* context */}</aside>
</div>

{/* Sidebar nascosta su mobile, hamburger menu */}
<CoachSidebar className="hidden lg:flex" />
<CoachBottomNav className="lg:hidden" />

{/* Bento: tile full-width mobile, side-by-side desktop */}
<div className="grid grid-cols-12 gap-4">
  <Tile className="col-span-12 md:col-span-6 lg:col-span-4" />
</div>
```

### 4.3 Touch target

Su mobile, pulsanti `h-9` (36px) sono al limite. Per CTA primari Coach mobile, usa `h-11` (44px Apple guideline) o `h-12` (48px Material).

### 4.4 Horizontal scroll vs collapse

- **Horizontal scroll OK** per Macro-Timeline, Week Grid, tabelle dati
- **Collapse a single column** per layout multi-column workspace
- **Sheet drawer** per right-rail context panel (vedi `src/components/ui/sheet.tsx`)

<a id="5-stores"></a>

## 5. Stores Coach (Zustand)

### 5.1 Inventario stores

| File                                    |  LOC | Purpose                                                     |
| --------------------------------------- | ---: | ----------------------------------------------------------- |
| `src/stores/useAdvancedProgramStore.ts` | ~250 | Program V2 (ProgramBlock → Microcycle → Session → Exercise) |
| `src/stores/useProgramBuilderStore.ts`  | 1098 | Legacy V1 — migrazione a `programBuilder/` in corso         |
| `src/stores/programBuilder/`            |  398 | Slice pattern V2 — preferito per nuovi store                |
| `src/stores/useMovementStore.ts`        |  503 | Exercise library + filtri                                   |

### 5.2 Slice pattern (raccomandato per nuovi store >300r)

```ts
// src/stores/<dominio>/types.ts
export interface DomainState {
  /* ... */
}
export interface AllActions extends BlockActions, SelectionActions {
  /* ... */
}

// src/stores/<dominio>/blockSlice.ts
export const createBlockSlice: StateCreator<
  DomainState & AllActions,
  [["zustand/immer", never]],
  [],
  BlockActions
> = (set) => ({
  initializeBlock: (config) =>
    set((state) => {
      /* immer mutation */
    }),
});

// src/stores/<dominio>/index.ts
export const useStore = create<DomainState & AllActions>()(
  immer((...args) => ({
    ...initialState,
    ...createBlockSlice(...args),
    ...createSelectionSlice(...args),
  })),
);
```

### 5.3 Read pattern

```tsx
// Single value
const block = useStore((s) => s.block);

// Multi-field con useShallow (NO useShallow → re-render ogni cambio state)
const { initializeBlock, duplicateWeek } = useStore(
  useShallow((s) => ({
    initializeBlock: s.initializeBlock,
    duplicateWeek: s.duplicateWeek,
  })),
);
```

### 5.4 Write pattern (single-field patch)

```tsx
useStore.setState((state) => {
  if (!state.block) return;
  state.block.athlete_id = athleteId;
  state.isDirty = true;
});
```

<a id="6-query"></a>

## 6. TanStack Query patterns Coach

### 6.1 queryKey gerarchico

```ts
// ✅ Buon design — invalidazione granulare
queryKey: ["coach", "athletes", coachId];
queryKey: ["coach", "athletes", coachId, athleteId];
queryKey: ["coach", "athletes", coachId, athleteId, "readiness"];

// ❌ Male — flat
queryKey: ["athletesForCoachXYZ"];
```

### 6.2 enabled gating

```ts
useQuery({
  queryKey: ["coach", "athletes", user?.id],
  queryFn: async () => {
    /* ... */
  },
  enabled: !!user && profile?.role === "coach", // ← critico
  staleTime: 5 * 60 * 1000,
});
```

### 6.3 staleTime per tipo dato Coach

| Tipo dato                  | staleTime                 |
| -------------------------- | ------------------------- |
| Roster atleti              | 5 min                     |
| Risk overview / ACWR       | 5 min                     |
| Chat messages              | 0 + realtime subscription |
| Stripe subscription status | 1 min                     |
| AI quota                   | 30s                       |
| Block templates            | 10 min (cambia rara)      |
| Athlete readiness daily    | 5 min                     |
| Coach business metrics     | 5 min                     |

### 6.4 Mutation pattern (con invalidate granulare)

```ts
const { mutate, isPending } = useMutation({
  mutationFn: async (input) => {
    /* ... */
  },
  onSuccess: () => {
    toast.success("Salvato");
    queryClient.invalidateQueries({
      queryKey: ["coach", "athletes", coachId, athleteId], // ← specifico, NON ["coach"]
    });
  },
  onError: (e) => {
    toast.error("Errore", { description: extractMessage(e) });
  },
});
```

<a id="7-stripe"></a>

## 7. Stripe integration (subscription gate)

### 7.1 Flow

```
Coach signup → /auth (Supabase Auth)
            → Onboarding (collect coach profile)
            → Stripe Checkout (create-checkout-session edge)
            → Webhook (stripe-webhook edge) marca subscription active
            → SubscriptionGuard sblocca /coach/*
```

### 7.2 Touch points FE

- `src/components/auth/SubscriptionGuard.tsx` — gate
- `src/hooks/useBillingPlans.ts` — fetch plan disponibili
- `src/pages/coach/CoachBusiness.tsx` — manage billing + portal
- `src/pages/coach/CoachSettings.tsx` — link a Customer Portal

### 7.3 Failure modes

| Sintomo                       | Causa                                       | Fix                                                                   |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Coach loggato vede `/auth`    | Subscription expired                        | Verifica Stripe Dashboard subscription status                         |
| Webhook 401 silent            | `STRIPE_WEBHOOK_SECRET` env desync          | Confronta env var con Stripe Dashboard webhook endpoint secret        |
| Subscription mai attivata FE  | Webhook ricevuto ma write fail              | Service role key necessaria nell'edge — vedi `03-BACKEND-SUPABASE.md` |
| Bundle ha key staging in prod | `VITE_STRIPE_PUBLISHABLE_KEY` non rebildato | Trigger Lovable rebuild dopo env change                               |

Per pattern edge function Stripe vedi `03-BACKEND-SUPABASE.md §6`.

<a id="8-ai"></a>

## 8. AI Copilot patterns

### 8.1 Endpoint edge

| Function                  | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `ask-copilot`             | Master copilot Q&A su contesto coach         |
| `chat-with-coach`         | Chat realtime coach ↔ athlete con AI suggest |
| `generate-program`        | Generazione programma da prompt              |
| `generate-batch-checkins` | Batch checkin questions per athlete          |
| `analyze-athlete-week`    | Weekly summary AI                            |
| `ingest-knowledge`        | Aggiunge documento a knowledge base RAG      |

### 8.2 Hook FE

| Hook           | Usage                                                 |
| -------------- | ----------------------------------------------------- |
| `useAiQuota`   | Stato quota corrente coach (limit + usage + reset_at) |
| `useChatRooms` | Chat rooms + messages realtime                        |

### 8.3 Pattern

- **Quota gating**: prima di chiamare AI endpoint, verifica quota via `useAiQuota`. Se exhausted → CTA upgrade plan, non chiamata fail.
- **Streaming SSE**: per chat-with-coach + ask-copilot, usa Server-Sent Events. UX migliore di blocking JSON response.
- **System prompt versioning**: prompt vivono in DB (`ai_prompts` table o equiv), non hardcoded in TS.
- **Cost tracking**: ogni call logga `tokens_used + model` in `ai_usage_tracking`.
- **Fallback**: se AI fail (timeout, quota provider), UI mostra messaggio non-blocking + retry button. Niente toast errore Aggressivo.

<a id="9-antipatterns"></a>

## 9. Anti-pattern Coach-specific

| Anti-pattern                                                         | Perché evitarlo                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Token `.theme-athlete` (es. `var(--nc-primary)`) in componente Coach | Sbagli namespace tema                                            |
| `bg-white` / `text-black` raw in `src/components/coach/**`           | Rompe Aura compliance + futuro dark mode                         |
| `bg-blue-500` / Tailwind palette generica                            | Idem                                                             |
| Sidebar fissa visibile su mobile                                     | Coach NON è mobile-only ma deve usable da mobile — usa BottomNav |
| Subscription check solo FE (`SubscriptionGuard`) senza re-check edge | RLS bypassabile via API direct call                              |
| Hardcoded `staleTime: 0` su tutte le query                           | Spreca bandwidth + costo Supabase                                |
| Mutation senza `invalidateQueries` granulare                         | UI stale, utente vede vecchi dati                                |
| Chiamata AI senza check `useAiQuota`                                 | Errore brusco quando quota finita                                |
| Default + named export componenti dallo stesso file                  | Caos import                                                      |
