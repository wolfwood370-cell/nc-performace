# PROMPT per Claude Code — Fetta archiviazione atleti end-to-end

> Estratto 1:1 dal blocco IL PROMPT di `app/spec-archiviazione-atleti-2026-07-19.md` (fonte unica, corsia Cowork).
> Eseguito il 2026-07-20 su branch `claude/athlete-archive`. Piano approvato da Nick con: deroga su `src/hooks/useAthletesRiskOverview.ts` (il roster legge da lì, non da `useCoachData` — erratum registrato lato spec) e conferma fuori-scope dei 7 roster paralleli (chip in HANDOFF).
> L'Appendice A è racchiusa in un fence `sql` per proteggerla dal formatter; il file-specchio byte-identico vive in `supabase/migrations/20260720070340_athlete_archive_restore_rpc.sql`.

---

**Task:** Archiviazione atleti end-to-end: cablare il menu «⋯» della pagina atleta, filtrare gli archiviati dal roster attivo con vista «Archiviati» + ripristino, specchiare la migrazione DB già applicata. NIENTE nuove env, NIENTE edge functions, NIENTE DDL da applicare (già fatto via connettore: tu SPECCHI il file).
**Data:** 2026-07-19
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** claude/athlete-archive

Lavori sul repo NC Performance Hub (frontend Vite SPA). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- `src/pages/coach/AthleteDetail.tsx` — menu «⋯» con 3 voci SENZA handler (~r.3060-3080: Archive, Edit Profile, Message); il dialog canonico di archiviazione + `archiveAthleteMutation` (RPC `archive_athlete`, toast, navigate) esistono già nel tab Impostazioni (~r.2144, ~r.2384): NON duplicarli.
- `src/hooks/useCoachData.tsx` — query profili athlete del coach (r.97-100, r.121-124), select `*` senza filtro archived: il campo `settings` arriva GIÀ al client.
- `src/pages/coach/CoachAthletes.tsx` — roster con bucket/pill calcolati client-side (r.139-153): è il punto d'innesto naturale del filtro.
- `src/types/profile.ts` — tipi `archived?: boolean` e `archived_at?: string | null` GIÀ definiti: usali, non ridefinirli.
- DB LIVE (già migrato, migration `athlete_archive_restore_rpc`): `archive_athlete(p_athlete_id)` setta `settings.archived=true` + `settings.archived_at=now()`; `unarchive_athlete(p_athlete_id)` rimuove entrambe le chiavi. Entrambe SECURITY DEFINER, guardia `is_coach_of_athlete`, EXECUTE solo per `authenticated`. Il file-specchio VERBATIM è in fondo al prompt (Appendice A): va in `supabase/migrations/` con timestamp coerente — NON applicarlo, NON modificarlo.
- `src/integrations/supabase/types.ts` — contiene `archive_athlete`, NON `unarchive_athlete`: nel PIANO dichiara come tipizzi la nuova RPC (rigenerazione types.ts se il flusso repo lo consente, altrimenti cast locale tipizzato e commentato accanto alla chiamata).

## OBIETTIVO (osservabile)

1. Menu «⋯» → «Archive» apre il DIALOG CANONICO esistente (stessa conferma, stessa mutation). Zero percorsi di conferma nuovi.
2. Menu «⋯» → «Edit Profile» porta al tab Impostazioni della stessa pagina (destinazione esistente).
3. Menu «⋯» → «Message»: cablala SOLO se esiste una destinazione reale raggiungibile in modo banale (es. pagina Messaggi, anche senza preselezione atleta — dichiaralo); altrimenti RIMUOVI la voce. Decidi nel PIANO col costo reale alla mano.
4. Roster: di default mostra SOLO i non-archiviati (criterio unico: `settings?.archived === true` ⇒ archiviato; assente/false ⇒ attivo). Gli archiviati NON compaiono nei bucket esistenti (Tutti/Attivi/…).
5. Roster: pill/vista «Archiviati» (visibile sempre o solo se count>0 — scegli nel PIANO) che elenca gli archiviati con azione «Ripristina» (RPC `unarchive_athlete`, senza dialog: azione non distruttiva — decisione dichiarata) → l'atleta torna negli attivi.
6. Pagina atleta di un archiviato: il badge di stato in header dice «Archiviato» (estendi la badge-config esistente) e la card del tab Impostazioni diventa condizionale: «Archivia» se attivo / «Ripristina» se archiviato.
7. Dopo archivia/ripristina le liste si aggiornano senza reload manuale (invalidation delle query coinvolte).

## ARCHITETTURA (dove va la logica)

- **Criterio unico:** un helper puro `isArchived(profile)` (posizione a tua scelta, es. accanto ai tipi profilo) usato da roster, badge e card — MAI il criterio ripetuto inline in più punti.
- **Filtro client-side** nei bucket esistenti di CoachAthletes (i dati arrivano già col select `*`): niente cambi di query se non necessari — se nel PIANO emergono motivi per filtrare server-side, proponilo col perché (il criterio jsonb resta lo stesso).
- **Scritture SOLO via RPC** (`archive_athlete` / `unarchive_athlete` con `supabase.rpc`): MAI `.update()` diretti su `profiles.settings` dal client (ownership server-side + niente clobber di altre chiavi jsonb).

## OUTPUT / CONTRATTO

- Nessun contratto di rete nuovo: 2 RPC esistenti via `supabase.rpc`.
- Stringhe-utente in italiano («Archiviato», «Ripristina», toast «Atleta ripristinato»…); coerenti col copy esistente del dialog.

## INVARIANTI DA NON ROMPERE

1. Un solo percorso di conferma archiviazione (il dialog canonico); la voce menu lo APRE, non lo duplica.
2. Scritture stato SOLO via RPC; zero `.update()` su `profiles` dal client in questa fetta.
3. A fine fetta OGNI DropdownMenuItem di AthleteDetail ha un handler o non esiste (niente false affordance).
4. Archiviare non tocca nessun altro dato; ripristinare riporta allo stato vergine (chiavi rimosse) — comportamento delle RPC, non ri-implementarlo.
5. Il file-specchio della migrazione è VERBATIM (Appendice A): zero modifiche, zero ri-applicazioni.
6. `mode`/`tier`/altre chiavi di `settings` mai toccate dal FE.
7. Niente edge functions, niente nuove env, niente altre pagine.
8. La suite esistente resta verde; `npx tsc --noEmit` verde.

## FILE

- NUOVI: `supabase/migrations/<timestamp>_athlete_archive_restore_rpc.sql` (specchio verbatim) · eventuali test dei nuovi helper (convenzioni suite).
- MODIFICATI: `src/pages/coach/AthleteDetail.tsx` (menu + card condizionale + badge) · `src/pages/coach/CoachAthletes.tsx` (filtro + vista Archiviati + Ripristina) · `src/hooks/useCoachData.tsx` SOLO se serve (dichiaralo) · `src/types/profile.ts` SOLO se aggiungi l'helper lì · `src/integrations/supabase/types.ts` SOLO per rigenerazione dichiarata.
- VIETATI: `supabase/functions/**` · `_shared/**` · `config.toml` · pagine/hook non elencati. Niente "while you're here".

## COME LAVORI

- Prima il PIANO (punto d'innesto esatto del filtro, scelta su «Message», tipizzazione `unarchive_athlete`, elenco test, come verifichi ogni pezzo) → STOP per il mio OK → poi commit atomici (proposta: 1 specchio+tipi+helper · 2 AthleteDetail · 3 roster).
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = io (Nick) da GitHub Desktop.

## APPENDICE A — migrazione GIÀ APPLICATA (specchio VERBATIM, non applicare)

```sql
-- Fetta archiviazione atleti end-to-end (2026-07-19, sess.79)
-- 1) archive_athlete: aggiunge archived_at accanto ad archived
--    (il tipo FE src/types/profile.ts prevede già entrambe le chiavi)
CREATE OR REPLACE FUNCTION public.archive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(auth.uid(), p_athlete_id) THEN
    RAISE EXCEPTION 'Not authorized to archive this athlete';
  END IF;

  UPDATE public.profiles
  SET settings = jsonb_set(
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          '{archived}', 'true'::jsonb, true
        ),
        '{archived_at}', to_jsonb(now()), true
      ),
      updated_at = now()
  WHERE id = p_athlete_id;
END;
$function$;

-- 2) unarchive_athlete: speculare (stessa guardia); rimuove le chiavi
--    così il profilo torna allo stato vergine (attivo = flag assente/false)
CREATE OR REPLACE FUNCTION public.unarchive_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_coach_of_athlete(auth.uid(), p_athlete_id) THEN
    RAISE EXCEPTION 'Not authorized to unarchive this athlete';
  END IF;

  UPDATE public.profiles
  SET settings = (COALESCE(settings, '{}'::jsonb) - 'archived') - 'archived_at',
      updated_at = now()
  WHERE id = p_athlete_id;
END;
$function$;

-- 3) least-privilege sulla NUOVA funzione (pattern record_consent_rpc):
--    niente EXECUTE per anon/PUBLIC; solo authenticated (guardia interna resta).
--    archive_athlete esistente NON viene toccata nei grant (fetta hardening dedicata).
REVOKE ALL ON FUNCTION public.unarchive_athlete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unarchive_athlete(uuid) TO authenticated;
```
