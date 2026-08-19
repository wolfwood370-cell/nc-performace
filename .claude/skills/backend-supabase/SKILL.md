---
name: backend-supabase
description: Metodologia backend del repo — scatta quando il task tocca supabase/functions/**, edge function, migration, RLS, policy, SECURITY DEFINER, advisor Supabase o la rigenerazione di types.ts.
---

# Backend Supabase — la metodologia sta in un solo posto

Leggi `.claude/methodology/03-BACKEND-SUPABASE.md` PRIMA di toccare `supabase/**`:
lì vivono edge functions e test Deno, le migration proposte come FILE in
`supabase/migrations/`, la rigenerazione di `types.ts`, il deploy da CLI e i pattern RLS.

Una sola regola ripetuta qui, perché è un cancello e non un rimando:

> **security / RLS / `SECURITY DEFINER` / advisor = STOP & ASK.**
> Il DB non lo applichi tu: lo opera Cowork, col benestare di Nicolò.
> Tu proponi al più il file di migration — mai l'apply.

Dettaglio del confine e workflow: `03-BACKEND-SUPABASE.md §0` + `CLAUDE.md` legge #11.

## Chiusura: chiama l'auditor, non rifare il suo lavoro

Questa skill è il **cancello di ingresso**: ti dice dove fermarti prima di scrivere. Non contiene
checklist tecniche di proposito — quelle vivono in `.claude/agents/supabase-rls-auditor.md`, che gira
in un contesto proprio e in sola lettura, e vale come **secondo parere non correlato** sul lavoro finito.

**A fine fetta, prima della PR, lancialo sui file backend toccati** — è l'ultimo passo di questa skill,
non un optional: `supabase-rls-auditor` su `supabase/functions/<toccate>` + le migration proposte.
Precedente misurato: `docs/auto-miglioramento.md:146` — PASS con 1 warning REALE, chiuso in-branch
prima del merge (`eb93fe7`).
