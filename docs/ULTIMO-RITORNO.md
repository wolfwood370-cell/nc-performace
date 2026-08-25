# ULTIMO RITORNO — fetta watchdog-srpe

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/watchdog-srpe` · 2026-08-25 · base `origin/main` = `ce8d48f` · PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/watchdog-srpe) — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/watchdog-srpe`, da `ce8d48f`, 2 commit di codice + il commit dei documenti (tip del ramo):
`4b4fc42` (migration proposta: watchdog su `srpe`, RULE 2 rimossa, messaggio italiano) ·
`c4ccec1` (le due edge mediano `srpe`, una parola per file).

## 2. Manifesto

**NUOVI:** `supabase/migrations/20260825103000_riallinea_watchdog_srpe.sql` — **FILE, non applicato**:
l'apply è di Nicolò/Cowork via connettore (metodologia 03 §0.2; qui il file nasce PRIMA
dell'apply perché la fetta è nata da un debito trovato in review, non da un DDL già applicato —
l'ordine invertito è dichiarato).

**MODIFICATI:** `supabase/functions/analyze-athlete-week/index.ts` (riga della `.map`) ·
`supabase/functions/generate-batch-checkins/index.ts` (idem) · `docs/HANDOFF.md` ·
`docs/auto-miglioramento.md` · questo file (commit docs separato e dichiarato: il blocco finale
DEVE stare sul ramo, e il perimetro-codice resta i tre file).

**NEL PERIMETRO MA NON TOCCATI:** tutto `src/**` (zero modifiche FE — i 5 cancelli lo provano
numero per numero) · le altre migration (storia immutabile) · il trigger
`trg_watchdog_workout_alert` (resta puntato alla funzione) · i tipi di `coach_alerts`
(`risk_alert` resta `risk_alert`) · `deno.lock` (creato da un run e RIMOSSO: i run vanno con
`--no-lock`, lezione del log).

## 3. Le due prove dei permessi (repo di scarto in scratchpad)

- `git reset --hard HEAD` → **RIFIUTATO** («Permission to use Bash with command … has been denied») · `git rebase HEAD~1` → **RIFIUTATO**.
- Vicini passati: `git status -sb` → `## master` · `git log --oneline -1` → `cbfde72 commit di prova`.

## 4. IL CORPO DELLA FUNZIONE, INTERO — e il registro dei cambi

Il `CREATE OR REPLACE` completo è in
`supabase/migrations/20260825103000_riallinea_watchdog_srpe.sql` (86 righe, di cui ~30 di
motivazione in commento). Corpo:

```sql
CREATE OR REPLACE FUNCTION public.watchdog_workout_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_coach_id UUID;
  v_athlete_name TEXT;
  v_workout_title TEXT;
  v_severity TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT p.coach_id, p.full_name INTO v_coach_id, v_athlete_name
  FROM profiles p WHERE p.id = NEW.athlete_id;

  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.title INTO v_workout_title
  FROM workouts w WHERE w.id = NEW.workout_id;

  v_link := '/coach/athlete/' || NEW.athlete_id;

  -- RULE 1: session RPE >= 9 — reads srpe …
  IF NEW.srpe IS NOT NULL AND NEW.srpe >= 9 THEN
    v_severity := CASE WHEN NEW.srpe >= 10 THEN 'high' ELSE 'medium' END;
    v_message := COALESCE(v_athlete_name, 'Atleta') || ' ha registrato RPE di sessione ' || NEW.srpe || ' su "' || COALESCE(v_workout_title, 'Allenamento') || '"';

    INSERT INTO coach_alerts (coach_id, athlete_id, workout_log_id, type, severity, message, link)
    VALUES (v_coach_id, NEW.athlete_id, NEW.id, 'risk_alert', v_severity, v_message, v_link);
  END IF;

  -- RULE 2 stood here … REMOVED (motivo nel commento del file)

  RETURN NEW;
END;
$$;
```

**Cosa è cambiato (tre punti, nient'altro):**

1. RULE 1: `NEW.rpe_global` → `NEW.srpe` (condizione E severità, stessa forma: `>= 9`, `high` da 10, `medium` a 9).
2. Il messaggio di RULE 1: da «… recorded RPE N on "…"» a «… ha registrato RPE di sessione N su "…"» — italiano, e nomina la grandezza; i ripieghi `'Athlete'`/`'Workout'` diventano `'Atleta'`/`'Allenamento'` (sono DENTRO la riga riscritta).
3. RULE 2 (`NEW.srpe > 800` → alert `high` «extreme session load»): **RIMOSSA**, col motivo in commento SQL nel punto esatto in cui stava — presumeva che `srpe` fosse il carico, il `CHECK (srpe >= 1 AND srpe <= 10)` la rendeva irraggiungibile per costruzione; una soglia irraggiungibile che dichiara di misurare il carico legge come copertura. L'allarme sul carico estremo nascerà da `srpe × durata` (modulo unico del carico).

**Cosa è rimasto identico (riga per riga rispetto alla versione installata):** `SECURITY DEFINER` ·
`SET search_path TO 'public', 'pg_temp'` (la forma INSTALLATA — ⚠️ il file storico
`20260213073401:50` portava solo `'public'`: l'hardening è arrivato via connettore senza mirror,
e questa migration lo CONSERVA, non lo regredisce) · il blocco `DECLARE` (6 variabili, inclusa
`v_severity` ancora usata da RULE 1) · la guardia `status != 'completed'` · la risoluzione
`coach_id`/`full_name` da `profiles` · l'uscita a coach `NULL` · il titolo da `workouts` ·
`v_link` · l'`INSERT` su `coach_alerts` (stesse colonne, stesso `type='risk_alert'`) ·
`RETURN NEW` · il trigger (non ricreato: il `REPLACE` della funzione basta, `AFTER INSERT OR
UPDATE` resta).

**Limite dichiarato della misura:** l'MCP Supabase di questa sessione è senza token (noto dal
log), quindi il corpo vivo l'ho ricostruito da: file storico del repo + i fatti-vivi che il
mandato incolla dalla misura `pg_get_functiondef` di Cowork del 25/08 (le due regole, il
`search_path` a due schemi, gli elementi da preservare). L'unica divergenza vivo↔file nominata è
il `search_path`, e l'ho conservata. **Cowork, sul ritorno: diff `pg_get_functiondef` vivo ↔
questo file prima dell'apply** — se il vivo porta altro drift non nominato, vince il vivo.

## 5. Acceptance — comando e output

1. **Il diff della funzione** → §4 (corpo intero + registro dei cambi e degli identici).
2. **Perimetro:** `git diff origin/main..HEAD --stat` → `analyze-athlete-week/index.ts` (7±), `generate-batch-checkins/index.ts` (5±), `20260825103000_riallinea_watchdog_srpe.sql` (+86) — solo i tre; il commit docs (questo file + HANDOFF + RETRO) si aggiunge sopra, dichiarato in §2.
3. **Deno:** `npx deno test --allow-all --no-check --no-lock supabase/functions/` → **ok | 496 passed | 0 failed** (baseline sul tree pulito: 496 identica; nessun test Deno fissava `rpe_global` nelle due edge).
4. **I cinque cancelli FE, invariati numero per numero:** `tsc --noEmit` exit 0 · `vitest run` **402 passed (402) su 38 file** exit 0 · `eslint .` **81 errori / 13 warning** · `npm run build` exit 0 · `npm run verify:css` exit 0 («20/20 classi attese in uso e verificate»). Identici alla baseline: zero tocchi FE.
5. **Il grep del riallineamento:** `grep -rn "rpe_global" supabase/` → nelle **functions** restano solo le 2 select che elencano la colonna (`analyze-athlete-week:81`, `generate-batch-checkins:128`) e i commenti; nelle **migrations** restano la storia immutabile (vecchia definizione `20260213073401`, schema, view) e i commenti della nuova. **Nessuna lettura viva che produca un numero o alzi un allarme nelle edge**; per i lettori residui nel DB → §6.2.

## 6. Non fatto / divergenze (file:riga)

1. **RULE 2 rimossa, non tenuta** — ed è la scelta giusta, nessun ripensamento da segnalare: il `CHECK` la rendeva irraggiungibile e la capacità che fingeva di coprire (carico estremo) appartiene a `srpe × durata`, che oggi vive nel modulo unico del carico.
2. **Lettori residui di `rpe_global` nel DATA-PLANE, misurati e NON toccati (fuori dai tre punti del mandato):** le view `analytics_athlete_progress` (`20260212035031:25` — `COALESCE(AVG(wl.rpe_global), 0)`, che oltre a leggere la colonna morta fonde assenza e zero) e `analytics_athlete_summary` (`20260214204708:33-46` — `COALESCE(rpe_global, 5)` dentro i calcoli di carico) — **zero consumatori** in `src/**` e `supabase/functions/**` (grep exit 1): oggetti vivi ma morti d'uso, candidati a rimozione nella fetta-schema che deciderà anche `duration_minutes`/`total_load_au`. E il trigger `notify_coach_workout_completed` (`20260215193415:52` — `COALESCE(NEW.rpe_global, NEW.srpe)`, la fusione invertita già datata da C-09): con `rpe_global` ormai NULL degrada **per caso** sulla colonna giusta; resta datato.
3. **L'ordine §0.2 invertito**: il workflow canonico è Cowork-prepara → Nick-approva → apply → Code-specchia il file; qui il file nasce PRIMA perché la fetta chiude un debito trovato in review. L'apply resta l'ultimo miglio di Nicolò/Cowork, e la version va registrata in `schema_migrations` con lo stesso timestamp del file (lezione grazia-4a).
4. **`deno.lock`** creato dal primo run di baseline (senza `--no-lock`) e rimosso subito — la lezione del log regge, il run di conferma è passato con `--no-lock`.
5. **Zero modifiche a `src/`** — il vincolo 1 regge: nessun punto della fetta l'ha richiesto.
6. **Passata `supabase-rls-auditor` (obbligatoria, contesto proprio): PASS, zero rilievi Alti.** Conferme: `SECURITY DEFINER` + `search_path` a due schemi conservati; niente SQL dinamico (la concatenazione del messaggio alimenta un INSERT parametrizzato); policy `coach_alerts` intatte; rimozione RULE 2 legittima (CHECK confermato in `20260112003407:61`). Registrati e NON riparati (fuori mandato, preesistenti): **Media** — `analyze-athlete-week/index.ts:17-23` valida `athlete_id` solo per truthiness, senza assert-UUID (mitigato da `.eq()` parametrizzato + ownership check `:56`; l'helper `_shared/uuid.ts` citato dalla metodologia §4 non esiste nel repo — nota per la fetta che lo introdurrà); **da Bassa a NOMINATA, col percorso concreto (code-reviewer)** — il trigger è `AFTER INSERT OR UPDATE` senza `WHEN` né dedupe (`20260213073401:101-104`; nessun vincolo unico su `coach_alerts`, censito in `docs/CENSIMENTO-AVVISI-COACH.md:74`): finché RULE 1 leggeva `rpe_global` era inerte, ma attivandola su `srpe` **ogni UPDATE successiva** della riga completed con `srpe>=9` re-inserisce un `risk_alert` identico — e il **feedback del coach è esattamente quella UPDATE** (`src/hooks/useReviewWorkout.ts:23-25`): recensire una seduta a 9+ duplicherebbe l'alert. Il trigger è VIETATO a questa fetta (resta intatto per contratto): la conseguenza va gestita al collaudo (§7) e chiusa in una fetta sua (candidate: `WHEN` su transizione a completed, o dedupe su non-dismesso come già fanno le edge di release); **Bassa** — `rpe_global` resta nelle due select come dato morto (il mandato lo consente esplicitamente; toglierlo è pulizia da fetta-schema).

## 7. Resta a Nicolò

- **Merge della PR** dal [link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/watchdog-srpe).
- **Apply della migration** via Cowork col suo benestare (connettore, `apply_migration` + `get_advisors(security)` + **registrazione della version `20260825103000` in `schema_migrations`**), previa **verifica del drift**: diff `pg_get_functiondef('public.watchdog_workout_alert')` vivo ↔ file (§4, limite dichiarato).
- **Deploy delle due edge**: `npx -y supabase functions deploy analyze-athlete-week --project-ref xgxtplqlewpqjzghvbke` e idem `generate-batch-checkins`. ⚠️ Ordine libero rispetto alla migration (nessuna dipendenza reciproca: le edge leggono una colonna che già esiste).
- **Collaudo del canale, per la prima volta possibile davvero:** un debrief con RPE di sessione 9 → riga `coach_alerts` (`risk_alert`, `medium`, messaggio italiano) e campanella; con 10 → `high`. Senza dichiarazione → nessun alert. ⚠️ **Aspettati il duplicato di §6.6**: se al collaudo il coach RECENSISCE quella seduta (il feedback è una UPDATE della riga), il trigger ri-scatta e duplica l'alert — è il comportamento ereditato `AFTER INSERT OR UPDATE` senza dedupe, ora raggiungibile per la prima volta. Non è un difetto della migration: è la fetta-dedupe da mettere in coda (candidate in §6.6).
