# 02 — Athlete App (mobile-only)

> Metodologia per lavoro su `src/pages/athlete/**`, `src/components/{athlete,mobile,pwa}/**`, hook athlete, store athlete.
>
> Target: **mobile-only** (PWA rimossa — `vite.config.ts:5`; eventuali residui offline/Wake Lock = moduli scollegati, `docs/WIP_MODULES.md`). Touch-first UX.

---

## Indice

1. [Route map + auth guard](#1-routes)
2. [`.theme-athlete` token system](#2-theme)
3. [PWA offline-first stack](#3-pwa)
4. [Stores Athlete](#4-stores)
5. [TanStack Query persist + staleTime PWA](#5-query)
6. [Timer + Wake Lock + Web Audio](#6-timers)
7. [Touch UX + mobile patterns](#7-touch)
8. [Daily checkin + readiness](#8-checkin)
9. [Workout execution patterns](#9-workout)
10. [Anti-pattern Athlete-specific](#10-antipatterns)

---

<a id="1-routes"></a>

## 1. Route map + auth guard

Tutte le route athlete sono **lazy-loaded** + wrappate in `<ProtectedAthleteRoute>`.

```tsx
<Route
  path="/athlete"
  element={
    <ProtectedAthleteRoute>
      <AthleteShell />
    </ProtectedAthleteRoute>
  }
>
  <Route index element={<AthleteDashboard />} />
  <Route path="training" element={<AthleteTraining />} />
  <Route path="profile" element={<AthleteProfile />} />
</Route>
```

`ProtectedAthleteRoute` (`src/components/auth/ProtectedAthleteRoute.tsx`):

- Verifica autenticato
- Verifica `role === 'athlete'`
- Verifica onboarding completato (`profile.onboarding_completed === true`)
- Redirect a onboarding wizard se fail

### 1.1 Route map completa

| Path                      | Page               |  LOC | Note                             |
| ------------------------- | ------------------ | ---: | -------------------------------- |
| `/athlete`                | `AthleteDashboard` |  695 | Focus dashboard + readiness gate |
| `/athlete/training`       | `AthleteTraining`  |  914 | Workout execution                |
| `/athlete/profile`        | `AthleteProfile`   | ~400 |                                  |
| `/athlete/daily-checkin`  | `DailyCheckin`     | ~300 | Gate readiness daily             |
| `/athlete/readiness`      | `ReadinessDetails` |  636 | Detail readiness score           |
| `/athlete/exercise/:id`   | `ExercisePreview`  |  836 | Pre-workout exercise preview     |
| `/athlete/active-workout` | `ActiveWorkout`    |  713 | Live workout in-progress         |

### 1.2 Onboarding gate

Athlete fresh signup → `<ProtectedAthleteRoute>` rileva `onboarding_completed === false` → redirect a `/onboarding/*` wizard multi-step:

1. Biometrics (height, weight, age, sex)
2. Lifestyle (sleep avg, stress, training history)
3. Neurotype (questionario)
4. Conferma + activate

<a id="2-theme"></a>

## 2. `.theme-athlete` token system

### 2.1 Setup

Lo scope `.theme-athlete` è applicato al wrapper root dell'app athlete (es. `<AthleteShell>` o `<AthleteDashboard>` root div):

```tsx
<div className="theme-athlete min-h-screen">{/* contenuto athlete */}</div>
```

### 2.2 CSS vars disponibili

Source: `src/index.css` `.theme-athlete { ... }`.

```css
--nc-surface: #ffffff /* background base */ --nc-ink: #043555 /* testo principale */
  --nc-muted: #50768e /* testo secondario */ --nc-primary: #226fa3 /* brand primario */
  --nc-deep: #093858 /* brand scuro / contrast */ --nc-track: #f1f5f9
  /* progress track / sfondo card */;
```

### 2.3 Uso in JSX

```tsx
{
  /* Inline via Tailwind arbitrary value */
}
<div className="bg-[var(--nc-surface)] text-[var(--nc-ink)]">
  <button className="bg-[var(--nc-primary)] text-[var(--nc-surface)]">CTA</button>
</div>;

{
  /* Oppure via class .font-display (Manrope su athlete) */
}
<h1 className="font-display text-[var(--nc-ink)]">Workout</h1>;
```

### 2.4 Font system athlete

```css
.theme-athlete           → Inter (body)
.theme-athlete .font-display  → Manrope (heading)
```

### 2.5 Shadcn UI primitives sotto `.theme-athlete`

Le primitive in `src/components/ui/**` usano i token shadcn (`bg-background`, `text-foreground`, `border-border`) che vengono **ridefiniti automaticamente** sotto `.theme-athlete` per puntare ai `--nc-*`.

Quindi `<Button>`, `<Card>`, `<Input>` funzionano in entrambi i temi senza modifiche.

### 2.6 Audit grep (theme-athlete compliance)

```bash
# Componenti athlete che usano token Aura Coach per errore — deve essere 0
grep -rn -E "(bg-primary-container|text-on-surface-variant|surface-container-)" \
  src/components/athlete src/components/mobile src/pages/athlete \
  | grep -v "node_modules\|\.test\."

# Hex raw in componenti athlete — deve essere 0
grep -rn -E "#[0-9a-fA-F]{3,8}" \
  src/components/athlete src/components/mobile src/pages/athlete \
  | grep -v "node_modules\|\.test\."
```

<a id="3-pwa"></a>

## 3. PWA offline-first stack

### 3.1 Componenti chiave

| Layer             | File                                      | Purpose                      |
| ----------------- | ----------------------------------------- | ---------------------------- |
| Service Worker    | `vite.config.ts` (vite-plugin-pwa)        | Cache shell + assets         |
| IndexedDB wrapper | `src/lib/offlineStorage.ts`               | API custom per workout queue |
| Query persist     | `src/lib/queryPersister.ts`               | TanStack Query → IndexedDB   |
| Network detection | `src/components/ui/NetworkBadge.tsx`      | Banner offline               |
| Sync provider     | `src/providers/OfflineSyncProvider.tsx`   | Queue → server al reconnect  |
| SW update prompt  | `src/components/pwa/SwUpdatePrompt.tsx`   | Toast "nuova versione"       |
| Install prompt    | `src/components/mobile/InstallPrompt.tsx` | Add-to-home-screen           |

### 3.2 Strategia caching

| Risorsa                | Strategia                                 |
| ---------------------- | ----------------------------------------- |
| HTML shell             | CacheFirst + revalidate on SW update      |
| JS/CSS assets          | CacheFirst con hash (immutable)           |
| Workout data           | `staleTime: Infinity` + IndexedDB persist |
| User profile           | `staleTime: 10min` + persist              |
| Realtime chat          | `staleTime: 0` (no persist)               |
| Images (exercise demo) | CacheFirst con max-age 7gg                |

### 3.3 Bundle versioning + SW update

Quando deploy nuovo bundle:

- Nuovo hash JS → SW invalida + scarica
- `<SwUpdatePrompt>` mostra toast "Aggiornamento disponibile"
- User click "Aggiorna" → `skipWaiting()` + reload

**ATTENZIONE**: se cambi shape di una query persistita, **bump il queryKey** (es. `["v2", "workout"]`) altrimenti utenti con bundle vecchio rieseguono parse stale e crash.

<a id="4-stores"></a>

## 4. Stores Athlete

### 4.1 Inventario

| File                                     |  LOC | Purpose                                                          |
| ---------------------------------------- | ---: | ---------------------------------------------------------------- |
| `src/stores/useAthleteWorkoutStore.ts`   | ~150 | Workout in-progress state (timer, set log, exercise progression) |
| `src/stores/useAthleteReadinessStore.ts` | ~100 | Daily checkin in-progress                                        |

### 4.2 Pattern: workout in-progress

Lo stato di un workout in corso vive in Zustand (NO Query) perché è:

- Client-only fino al save finale
- Mutato frequentemente (ogni set)
- Persiste fra refresh (zustand `persist` middleware con localStorage)

```ts
export const useAthleteWorkoutStore = create<WorkoutState>()(
  persist(
    immer((set) => ({
      activeWorkout: null,
      currentExerciseIdx: 0,
      currentSetIdx: 0,
      // ...
      logSet: (setIdx, data) =>
        set((state) => {
          /* immer */
        }),
      finishWorkout: async () => {
        /* save to server + clear */
      },
    })),
    { name: "athlete-workout-store" },
  ),
);
```

<a id="5-query"></a>

## 5. TanStack Query persist + staleTime PWA

### 5.1 Setup persist client

Vedi `src/lib/queryPersister.ts`. Il `QueryClient` è creato in `src/main.tsx` con persist plugin che salva snapshot in IndexedDB.

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // 24h — sopravvive a refresh
      retry: (failureCount, error) => {
        if (isOffline()) return false; // no retry offline
        return failureCount < 3;
      },
    },
  },
});

persistQueryClient({
  queryClient,
  persister: idbPersister,
  buster: BUNDLE_VERSION, // ← invalida persist se bundle hash cambia
});
```

### 5.2 staleTime per tipo dato athlete

| Tipo dato                           | staleTime            | Note                          |
| ----------------------------------- | -------------------- | ----------------------------- |
| Workout block (programma settimana) | `Infinity` + persist | Vita lunga, scarica una volta |
| Exercise library                    | `Infinity` + persist | Pratically static             |
| Active workout state                | (Zustand, non Query) | Vedi §4                       |
| Daily readiness                     | 5 min                | Cambia ogni giorno            |
| Profile + biometrics                | 10 min               | Cambia rara                   |
| Chat coach (real-time)              | 0 + subscription     |                               |
| Notifications                       | 1 min                |                               |

### 5.3 Offline mutation queue

Mutation con `useOfflineSync` (custom hook):

- Se online → esegue normalmente
- Se offline → mette in queue IndexedDB
- Al reconnect → drain queue in ordine FIFO + retry con backoff

```ts
const { mutate } = useOfflineSyncMutation({
  mutationFn: (input) => supabase.from("workout_logs").insert(input),
  // ...
});
```

<a id="6-timers"></a>

## 6. Timer + Wake Lock + Web Audio

### 6.1 Timer rest (drift-proof)

**MAI** `setInterval` per timer rest — pausa quando screen off su Android.

✅ Pattern timestamp-based:

```ts
const [elapsed, setElapsed] = useState(0);
const startRef = useRef(Date.now());

useEffect(() => {
  const tick = () => {
    setElapsed(Date.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(rafRef.current);
}, []);
```

Salva `startTimestamp` in store, così se l'app si "sveglia" (refresh, app switch) ricalcola elapsed dal real timestamp.

### 6.2 Wake Lock API

Per evitare screen-off durante workout:

```ts
useEffect(() => {
  let lock: WakeLockSentinel | null = null;
  navigator.wakeLock?.request("screen").then((l) => (lock = l));
  return () => lock?.release();
}, []);
```

**Fallback**: alcuni device Android killano comunque WakeLock. Il timer DEVE comunque essere timestamp-based (§6.1).

### 6.3 Web Audio (timer beep)

iOS richiede **user gesture** per primo unlock dell'AudioContext. Pattern:

```ts
// src/lib/audioFeedback.ts (esistente)
let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  // Oscillator warmup silente per unlock iOS
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.01);
}

// Chiama unlockAudio() al PRIMO tap dell'utente (es. "Inizia workout")
```

<a id="7-touch"></a>

## 7. Touch UX + mobile patterns

### 7.1 Touch target size

| Elemento               | Min size    | Note                                             |
| ---------------------- | ----------- | ------------------------------------------------ |
| CTA primario           | 48px (h-12) | Material guideline                               |
| CTA secondario         | 44px (h-11) | Apple HIG min                                    |
| Tab/Nav item           | 48px h      |                                                  |
| Icon button standalone | 40px (h-10) | Solo se non-critico                              |
| Card tap area          | full card   | Wrap intera card in `<button>` per accessibility |

### 7.2 Bottom-nav primaria

Athlete usa **bottom nav fissa** (no top nav). Pattern in `src/components/athlete/BottomNav.tsx` o equivalente.

### 7.3 Safe area (notch, home indicator)

```tsx
<div style={{
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'env(safe-area-inset-bottom)',
}}>
```

O Tailwind plugin `safe-area-inset`.

### 7.4 No hover-dependent UX

Mobile non ha hover. UI deve funzionare solo con tap. Stati hover Tailwind (`hover:`) sono OK come progressive enhancement, mai come unica indicazione.

### 7.5 Pull-to-refresh

NON aggiungere PTR custom — confonde con browser native. Se serve refresh, button esplicito.

### 7.6 Confetti / celebrazioni

`src/components/celebration/Confetti.tsx` per achievements + workout completion. Performante (canvas), accessibile (rispetta `prefers-reduced-motion`).

<a id="8-checkin"></a>

## 8. Daily checkin + readiness

### 8.1 Flow

```
App boot → AthleteDashboard
        → Check ultimo daily_checkin (today)
        ├── Compilato → mostra dashboard normale
        └── Non compilato → redirect a /athlete/daily-checkin
                          → User compila (sleep, stress, soreness, mood)
                          → Calcola readiness score (math in src/lib/math/readinessMath.ts)
                          → Save + redirect a dashboard
```

### 8.2 Hook chiave

| Hook                      | Purpose                          |
| ------------------------- | -------------------------------- |
| `useAthleteHealthProfile` | Profile + biometrics + neurotype |
| `useAthleteAcwrData`      | ACWR calc                        |
| `useAthleteRiskAnalysis`  | FMS-based risk per exercise      |

### 8.3 Readiness score

Calcolo deterministico in `src/lib/math/readinessMath.ts` (testabile, pure). Output 0-100. Soglie:

| Score  | Interpretazione | Azione UI                     |
| ------ | --------------- | ----------------------------- |
| 80-100 | Optimal         | Verde — vai a workout         |
| 60-79  | Adequate        | Giallo — workout ridotto      |
| 40-59  | Marginal        | Arancio — solo mobility       |
| <40    | Poor            | Rosso — rest day raccomandato |

<a id="9-workout"></a>

## 9. Workout execution patterns

### 9.1 Flow

```
/athlete/training (lista oggi)
   ↓ select workout
/athlete/active-workout
   ↓ per ogni exercise
       ↓ per ogni set
           ↓ log (peso, reps, RPE)
           ↓ start rest timer
       ↓ next set / next exercise
   ↓ finish
Save batch + confetti + redirect dashboard
```

### 9.2 Stato

- `activeWorkout` → Zustand store `useAthleteWorkoutStore` (persist localStorage)
- Logged sets → buffered in Zustand fino a finish, poi batch insert
- Offline → queue via `useOfflineSync` → drain al reconnect

### 9.3 Velocity-Based Training (VBT)

Hook `useAthleteVbtData`. Se device ha sensor o coach assegna `vbt_target`, mostra velocity gauge live.

### 9.4 Auto-progression suggestion

Quando coach ha settato progression rule, dopo set logged, UI suggerisce next set weight/reps in tempo reale.

<a id="10-antipatterns"></a>

## 10. Anti-pattern Athlete-specific

| Anti-pattern                                                    | Perché evitarlo                                      |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| Token Aura Coach (`bg-primary-container`) in componente Athlete | Sbagli namespace tema                                |
| Hex raw in `src/components/athlete/**` o `src/pages/athlete/**` | Rompe `.theme-athlete` compliance                    |
| `setInterval` per timer rest                                    | Pausa quando screen off Android                      |
| Audio play senza warmup user-gesture                            | iOS blocca                                           |
| `staleTime: 0` su workout data                                  | Re-fetch ogni mount → UX laggy                       |
| Mutation server-sync senza `useOfflineSync`                     | Workout perso se offline mid-sync                    |
| Hover-only affordance                                           | Touch device non ha hover                            |
| Sidebar laterale fissa                                          | Athlete è mobile-only, NO desktop layout             |
| Pull-to-refresh custom                                          | Conflict con browser PTR                             |
| Forms con `<input>` senza `inputMode` / `autoComplete`          | UX mobile pessima                                    |
| Cambio shape query persistita senza bump queryKey               | Crash utenti con bundle vecchio                      |
| Bundle senza `<SwUpdatePrompt>`                                 | Utenti rimangono su versione vecchia indefinitamente |
| Confetti senza check `prefers-reduced-motion`                   | Accessibilità rotta                                  |
