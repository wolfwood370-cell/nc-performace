# D10 — Guard auth route Coach (gap diffuso + fix centralizzato)

> Cowork, 2026-06-14. Finding emerso dai test E2E (D9) e dalla diagnosi di Claude Code. Ambito: frontend access-control. **Nessun problema RLS** (verificato).

## Finding

- `SubscriptionGuard` **non è un auth-guard**: per un utente anonimo lascia passare (gestisce solo il gating abbonamento dei coach).
- Il redirect auth è **per-pagina** (`useEffect(() => { if (!authLoading && !user) navigate("/auth") }, …)`).
- **10 pagine coach su 15 lo OMETTONO** → renderizzano la shell della dashboard a un utente non autenticato.

| Stato             | Pagine                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ ha il redirect | CoachHome, CoachAthletes, CoachCalendar, CoachAnalytics, CoachMessages                                                                                     |
| ❌ **manca**      | ProgramBuilder, AthleteDetail, CoachBusiness, CoachCheckinInbox, CoachLibrary, CoachSettings, ExerciseDatabase, FmsScreening, KnowledgeBase, MasterCopilot |

## Gravità: medio-bassa (nessun dato esposto)

RLS verificata (D5, sola lettura): le tabelle `program*`, `exercises`, `workout_exercises` hanno **RLS attiva** e ogni policy SELECT richiede `auth.uid()` → un anonimo riceve **0 righe**. Quindi le pagine non protette mostrano una **shell vuota**, non dati reali. È un gap di **difesa in profondità** lato frontend, non una falla dati. (Nota minore D5: alcune policy hanno `roles={public}` invece di `{authenticated}` — funzionalmente sicuro perché il `qual` gate su `auth.uid()`; eventuale tidy lato Lovable.)

## Fix raccomandato (frontend-only): guard centralizzato

Le route **atleta** usano già `src/components/auth/ProtectedAthleteRoute.tsx` (auth + ruolo + onboarding, centralizzato). Replicare lo stesso pattern per i coach risolve **tutte e 10** le pagine in un colpo ed è robusto contro future omissioni.

1. Creare `src/components/auth/ProtectedCoachRoute.tsx` speculare a `ProtectedAthleteRoute`:
   - `loading` → `<LoadingSpinner/>`; `!user` → `<Navigate to="/auth"/>`; `!profile` → spinner; `role !== "coach"` → `<Navigate to="/athlete"/>`; altrimenti `children`.
2. In `App.tsx` wrappare **tutte** le route `/coach/*` con `<ProtectedCoachRoute>`, componendolo con l'esistente `<SubscriptionGuard>` (ProtectedCoachRoute esterno, SubscriptionGuard interno).
3. (cleanup opz.) rimuovere i redirect `useEffect` per-pagina ora ridondanti nelle 5 pagine che li hanno.
4. Verifica: coach autenticato raggiunge `/coach/*`; anonimo rediretto a `/auth` da **tutte** le route coach. Build gate verde + `npx playwright test` (6/6, incluso #4).

Solo frontend — **nessun tocco a RLS/edge/DB**.

## Prompt di trasferimento — Claude Code

```
Aggiornamento scope (autorizzato, SOLO frontend, no RLS/edge/DB). L'audit ha rivelato che NON è
solo ProgramBuilder: 10/15 pagine coach non hanno il redirect auth (vedi docs/D10). Dati protetti
da RLS (anonimo = 0 righe), ma il gap di guard è diffuso. Le route atleta usano già un guard
centralizzato: src/components/auth/ProtectedAthleteRoute.tsx.

OBIETTIVO (fix centralizzato, preferito al patch della singola pagina):
1) Crea src/components/auth/ProtectedCoachRoute.tsx speculare a ProtectedAthleteRoute, con
   role !== "coach" → <Navigate to="/athlete" replace/> (loading→spinner; !user→/auth; !profile→spinner).
2) In App.tsx wrappa TUTTE le route /coach/* con <ProtectedCoachRoute>…</ProtectedCoachRoute>,
   componendolo con l'esistente <SubscriptionGuard> (ProtectedCoachRoute esterno).
3) (cleanup opz.) rimuovi i redirect useEffect per-pagina ridondanti in CoachHome/CoachAthletes/
   CoachCalendar/CoachAnalytics/CoachMessages.
4) Verifica: coach autenticato raggiunge /coach/*; anonimo rediretto a /auth da TUTTE le route coach.
   Build gate tsc verde + npx playwright test (6/6, incluso #4).
Commit fix(routing): guard coach centralizzato. Tieni separati i commit test(e2e) e chore(gitignore)
già pronti. Esplora→pianifica, proponi il piano PRIMA di modificare.
```

---

_D10 · Cowork · 2026-06-14. Frontend-only; RLS confermata a posto (D5)._
