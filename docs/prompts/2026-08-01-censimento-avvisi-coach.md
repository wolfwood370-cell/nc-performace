# Task: censimento-avvisi-coach — ricognizione read-only dello strato di avvisi al coach

> Prompt-file trascritto dal blocco «IL PROMPT» di `app/spec-censimento-avvisi-coach-2026-08-01.md` (Cowork, OK di Nick 2026-08-01).
> Committato da Code come parte dell'unico commit del branch `claude/censimento-avvisi-coach`.
> Esito: `docs/CENSIMENTO-AVVISI-COACH.md` (stesso commit).

**Task:** censire lo strato di avvisi al coach. RICOGNIZIONE IN SOLA LETTURA: non modificare NESSUN file di codice. L'unico output scrivibile è un documento di esito. Serve a decidere se quello strato va ricablato, ritirato o sostituito — la decisione la prende Nick dopo aver letto il censimento.
**Data:** 2026-08-01
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** `claude/censimento-avvisi-coach`

Lavori sul repo NC Performance Hub. Questa volta NON proponi un piano di modifica: produci una MAPPA. Se durante la ricognizione ti viene voglia di correggere qualcosa, fermati e mettilo nel documento.

## COSA DEVI PRODURRE

Un documento `docs/CENSIMENTO-AVVISI-COACH.md` con tre elenchi e un confronto.

### Elenco 1 — Avvisi PRODOTTI

Ogni segnale che il sistema genera per il coach, ovunque nasca:

- gli issue-type prodotti in `src/hooks/useCoachData.tsx` (pain_reported, low_readiness, high_stress, low_mood, e ogni altro che trovi): per ognuno la condizione esatta, la gravita, e `file:riga`
- le righe scritte in `coach_alerts` dalle edge function: quali funzioni, quale `type`, quale `severity`, con `file:riga`
- qualunque altra fonte che trovi

### Elenco 2 — Avvisi MOSTRATI

Ogni superficie dell'interfaccia coach che mostra un segnale a un essere umano:

- da quale hook prende i dati, e se quell'hook e' davvero raggiungibile (esportato E importato)
- dove e' montata nell'albero dei componenti, con `file:riga`
- includi almeno: `HealthProfileTab`, `CoachAthletes` (i painMarkers a :363-365), `CoachHome`, `AthleteDetail`, e qualunque campanella o centro notifiche

### Elenco 3 — Il confronto

Una tabella «prodotto → mostrato». Per ogni segnale prodotto: dove viene mostrato, oppure **NESSUNA SUPERFICIE**. È il cuore del censimento: voglio sapere quanti segnali clinici nascono e muoiono senza che nessuno li veda.

### In coda — Proposta

Tre opzioni valutate, con costo e rischio di ognuna, e la tua raccomandazione motivata:
(a) ricablare gli hook morti; (b) ritirarli e affidarsi alle superfici vive; (c) sostituirli leggendo `coach_alerts`, che e' gia' la tabella scritta dalle edge function ed e' gia' popolata.
Nella valutazione tieni conto dei difetti noti del codice morto (commento «last 7 days» che non corrisponde alla query, payload illimitato in IndexedDB, query senza staleTime): ricablare significa anche ereditarli.

## VERITA' DI RIFERIMENTO (verificate da Cowork il 2026-07-31)

- `useCoachData.tsx` esporta SOLO `useCoachAthletes` (:87); unico importatore `CoachAnalytics.tsx:3`.
- `useCoachDashboardData()` (:109) e `useCoachData()` (:516) non esportati, zero call-site.
- L'avviso `pain_reported` sta a :293-300, gravita critical; il ramo «Dolore generico» a :300.
- La superficie VIVA del dolore: `useAthleteHealthProfile.ts:285-291` -> `HealthProfileTab.tsx:52` -> `AthleteDetail.tsx` tab Salute.
- Dal 2026-08-01 `daily_readiness.has_pain` viene finalmente valorizzato dal check-in: quella superficie si accende da sola.

## INVARIANTI

1. **SOLA LETTURA.** Zero modifiche a file di codice. L'unico file nuovo e' `docs/CENSIMENTO-AVVISI-COACH.md`.
2. Ogni riga del censimento porta `file:riga`. Un'affermazione senza riferimento non entra.
3. Se un hook sembra morto, provalo: cerca l'import, non dedurlo dal nome. Se non sei sicuro, scrivi «non determinato» invece di scegliere.
4. Non giudicare la gravita clinica di un segnale: quello lo fa Nick. Tu dici cosa esiste e cosa si vede.
5. Niente «gia' che ci sono».

## FILE

- NUOVI: `docs/CENSIMENTO-AVVISI-COACH.md` · `docs/prompts/2026-08-01-censimento-avvisi-coach.md`
- VIETATI: tutto il resto. Ogni singolo file di codice.

## COME LAVORI

- Nessun PIANO da approvare: parti direttamente, e' sola lettura.
- Un commit solo, `docs(census)`, in italiano, con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Merge = Nick, via Pull request.
- A fine ricognizione dichiara cosa NON sei riuscito a determinare.

---

## Aggiornamenti in esecuzione (Code, 2026-08-01)

- **Base del censimento:** il worktree è nato dal main locale `a9427b0`, ma `origin/main` era già avanti di un merge (PR #16 `canale-dolore`, commit `5e4eaa8`) che valorizza `has_pain` dal check-in — esattamente la quinta verità di riferimento. Il branch è stato fast-forwardato a `5e4eaa8` PRIMA di scrivere il censimento, così la mappa riflette lo stato reale del repo remoto. Conseguenza per l'acceptance: `git diff --name-only` va misurato contro `origin/main`, non contro il main locale stale.
- **Correzione di realtà sulla spec:** gli issue-type del hook morto sono **8**, non 4 (in più: `no_checkin`, `digestion_issues`, `overreaching_risk`, `active_injury`). `useCoachData()` sta a `:516` (definizione), il file è di 523 righe.
- Metodo: ricognizione multi-agente (6 lenti parallele in sola lettura + 1 verificatore avversariale per lente che ha riletto ogni `file:riga` citato) + spot-check diretti sui file portanti.
