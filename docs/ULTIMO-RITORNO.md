# ULTIMO RITORNO — fetta durata-unica

> **Cos'è questo file.** Il blocco «COSA RIMANDI INDIETRO» dell'ultima fetta chiusa da Claude Code,
> in un file SOLO, **sovrascritto a ogni fetta**: la storia la tiene git, non serve un file per fetta.
> Fetta: `claude/durata-unica` · 2026-08-27 · base `origin/main` = `df7d4ee` (post-merge PR #65) ·
> PR verso `main` **da aprire da Nicolò**
> ([link crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/durata-unica)
> — dal 20/08 il classificatore nega le credenziali all'agente).

## 1. Ramo e commit

`claude/durata-unica`, da `df7d4ee`, 3 commit di codice + il commit dei documenti (tip del ramo):

- `59f53c0` — la migration (NON applicata) + il test di parità che deriva tipo ed espressione
  dal file e li confronta con `computeAcwr`.
- `e73ed65` — le due edge smettono di leggere `rpe_global` e `duration_minutes`.
- `361557b` — il pannello coach legge i secondi e mostra minuti-vista; la coda offline
  (scollegata) scrive i secondi; `formatDurataSeduta` + 3 file di test.
- il 4° commit di codice — esito della review (§9.0): il volume del check-in smette di
  fabbricare «0 UA» dall'assenza (`generate-batch-checkins`, somma sui soli carichi presenti,
  campo assente + «N/A» quando nessuna seduta è misurata).

## 2. Manifesto

**NUOVI:** `supabase/migrations/20260827130000_durata_unica_carico_sui_secondi.sql` ·
`src/lib/format/durataSeduta.ts` (vista dei minuti, pure logic → lib per il decision tree §4) ·
`src/lib/math/__tests__/caricoParita.test.ts` · `src/lib/format/__tests__/durataSeduta.test.ts` ·
`src/components/coach/messages/__tests__/AthleteContextPane.durata.render.test.ts`.

**MODIFICATI:** `supabase/functions/analyze-athlete-week/index.ts` (select :81) ·
`supabase/functions/generate-batch-checkins/index.ts` (select :128) ·
`src/hooks/useOfflineSync.ts` (:36, :186 — secondi) ·
`src/components/coach/messages/AthleteContextPane.tsx` (select :89, vista :185-190 e :423) ·
`src/components/coach/messages/__tests__/AthleteContextPane.render.test.ts` (fixture allineata,
scoperta dal grep di acceptance — non era nel censimento del prompt) ·
`docs/HANDOFF.md` · `docs/auto-miglioramento.md` (RETRO) · questo file.

**NEL PERIMETRO MA NON TOCCATI:** `src/lib/math/acwr.ts` (VIETATO: 0 righe di diff — il test lo
LEGGE per derivare l'espressione) · `sessionRpe.ts` · `src/lib/program/**` · `vite.config.ts` ·
`src/main.tsx` · `scripts/verify-css-tokens.mjs` · **`types.ts`: NON rigenerato, dichiarato** —
il cambio integer→numeric mappa comunque su `number | null` e la migration non è applicata: la
regen post-apply resta a valle (col DB vivo il gen produrrebbe lo schema VECCHIO) ·
`duration_minutes` come colonna: RESTA nel DB (la rimozione è un secondo passo dopo la produzione).

## 3. Le prove dei permessi (repo di scarto in scratchpad)

1. `git reset --hard HEAD~1` → **RIFIUTATO** · `git rebase HEAD~1` → **RIFIUTATO**.
2. I vicini passano: `git status -sb` → `## master` · `git log --oneline -2` → 2 commit.
3. ⚠️ `git -C <percorso> rebase HEAD~1` → **PASSATA** (eseguita: «Current branch master is up to
   date», no-op innocuo). Stessa misura di stamattina sulla fetta alpha-vivi: il classificatore
   non è deterministico su questa forma — la chip per le deny esplicite `-C`/`--git-dir` resta aperta.

## 4. La migrazione, per intero

File: `supabase/migrations/20260827130000_durata_unica_carico_sui_secondi.sql` (166 righe — il
testo completo è nel file; qui la spina dorsale):

```sql
DROP VIEW public.analytics_athlete_summary;          -- dipende dalla colonna

ALTER TABLE public.workout_logs DROP COLUMN total_load_au;
ALTER TABLE public.workout_logs
  ADD COLUMN total_load_au numeric GENERATED ALWAYS AS
    (srpe::numeric * duration_seconds::numeric / 60.0) STORED;

COMMENT ON COLUMN public.workout_logs.total_load_au IS '…';
CREATE OR REPLACE VIEW public.analytics_athlete_summary … ;  -- BYTE-IDENTICA alla 20260214204708
```

**Il tipo: `numeric`, col perché.** `integer` su `srpe×secondi/60` arrotonda 6,0666… → 6 — lo
stesso difetto della colonna vecchia in scala più piccola; `real`/`double` metterebbero float
binario in un dato che il FE confronta col mirror JS. `numeric` è esatto, e l'arrotondamento
appartiene alla VISTA (`formatDurataSeduta`), mai al dato. **Niente COALESCE**: srpe o durata
mancanti → NULL — la stessa semantica di `computeAcwr`, che ESCLUDE la seduta invece di azzerarla.

**Cosa succede alle 16 righe esistenti** (misura live 27/08: 6 con secondi, 4 con srpe, 4 con
entrambi, 0 con minuti, 0 con carico ≠ 0): STORED ricalcola al `ADD COLUMN` — le **4 righe con
srpe+durata ricevono il carico vero**, le **altre 12 passano da 0 a NULL** (assenza dichiarata).
La 52 s × sRPE 7 del criterio varrà 364/60 = **6,0666… AU** (≈ 6,07 alla vista).

**La view**: ricreata byte-identica (diff = zero byte contro la 20260214204708; la definizione
live coincide, verificata via `pg_get_viewdef` prima di scrivere; `security_invoker=true`
preservato). I grant erano i default Supabase (verificati via `role_table_grants`) e tornano dai
default privileges — nessun GRANT da riemettere. ⚠️ Reperto per Cowork in §9/§10: col carico
ripopolato si attiva il ramo `total_load_au * COALESCE(rpe_global,5)` della view — il doppio
conteggio già censito il 25/08, NON corretto qui di proposito.

## 5. Il viaggio della durata

```
timer      useAthleteWorkoutStore.elapsedTime (:49-50, tick del cronometro)
   ↓       PostWorkoutDebrief.tsx:340        duration_seconds: elapsedTime
scrittura  useAthleteWorkoutHooks.ts:176     UPDATE workout_logs SET duration_seconds
   ‖       useOfflineSync.ts:189             (coda offline, modulo scollegato: ora stessi secondi)
colonna    workout_logs.duration_seconds     — UNA colonna, quella che A-02 nomina
   ↓       migration 20260827130000          total_load_au = srpe × secondi / 60  (numeric, NULL-onesta)
carico     generate-batch-checkins:180       somma di total_load_au → metrics_snapshot.total_volume (:201→:272)
   ‖       acwr.ts:144                       load = srpe × (durationSeconds/60)   (stessa formula, inchiodata)
schermo    AthleteContextPane.tsx:89         select duration_seconds
   ↓       durataSeduta.ts                   minuti ARROTONDATI SOLO IN VISTA
           AthleteContextPane.tsx:423        «52 min» — o NIENTE quando manca, mai «0 min»
```

## 6. Le due formule, inchiodate

Vivono in: **la colonna generata** (migration `20260827130000`) e **`acwr.ts:144`**
(`s.srpe * (s.durationSeconds / 60)`). Il test `src/lib/math/__tests__/caricoParita.test.ts` le
inchioda **derivando entrambe dai sorgenti a ogni esecuzione** (regex sul file di migration →
tipo + espressione; regex su acwr.ts → l'espressione del load; un riferimento che invecchia non
si scrive, si deriva): pin delle due espressioni · stessa cifra su griglia di input (52 s×7;
3600×10; 1×1; 0×5; 90×8) · stessa semantica delle assenze (mirror → NULL; computeAcwr →
`excluded.senzaSrpe`/`senzaDurata` = 1, mai uno zero; durata 0 = DATO, nessuna esclusione).

## 7. Acceptance — comando ed esito

1. 🔴 **La prova rossa sulla scala**: incollata in §8 — il rosso nomina il valore troncato e a cosa.
2. **Le due formule danno lo stesso numero**: `npx vitest run src/lib/math/__tests__/caricoParita.test.ts`
   → 4 passed (pin derivati, griglia, assenze).
3. **Nessuno scrive più i minuti**: `grep -rn "duration_minutes" src supabase/functions` →
   restano SOLO `types.ts` (specchio dello schema: la colonna esiste ancora, per scelta),
   2 commenti-documentazione e il pin negativo del test di parità. **Zero scritture, zero select.**
   (`src/types/training.ts:121` è `estimated_duration_minutes`: la STIMA del template, un'altra
   grandezza — dichiarato, non toccato.)
4. **Il coach vede la durata derivata dai secondi, e non la vede quando manca**:
   `npx vitest run src/components/coach/messages/__tests__/AthleteContextPane.durata.render.test.ts`
   → 2 passed: con 3120 s legge «52 min»; con NULL la riga della seduta c'è (ancora «Upper A»)
   e la durata no — e mai «0 min» (più il property-test del formatter: nessun input produce «0 min»).
5. **`rpe_global` fuori dalle select**: `grep -n "rpe_global\|duration_minutes" supabase/functions/analyze-athlete-week/index.ts supabase/functions/generate-batch-checkins/index.ts`
   → solo 2 righe di commento («legacy and no longer written»), zero nelle select.
6. **I 5 gate** (miei + code-test-verifier in contesto proprio, exit code nudi):
   `npx tsc --noEmit -p tsconfig.app.json` → 0 · `npx vitest run` → **452/452 in 47 file**
   (baseline 442/44 + i 10 test nuovi in 3 file: divergenza = la fetta, dichiarata) ·
   `npx eslint .` → **64 = baseline 64** · `npm run build` → 0 · `npm run verify:css` → 0
   (245/245). Più le suite Deno: metodo **50** · release **36** · intake **54** (su main è
   cresciuta 52→54 prima di questa fetta).
7. **Perimetro**: `git diff origin/main..HEAD --stat` → 10 file (+ i 3 doc al commit finale),
   tutti nel manifesto §2; unico oltre la lista del prompt: la fixture del test render
   preesistente, scoperta dal grep dell'acceptance 3 — senza l'allineamento avrebbe tenuto in
   vita l'ultima occorrenza scritta di `duration_minutes`.

## 8. La prova rossa (backup per copia + `cmp`, mai `git checkout --`)

`integer` al posto di `numeric` nella migration → `npx vitest run src/lib/math/__tests__/caricoParita.test.ts`:

```
FAIL  … > 52 secondi × sRPE 7 valgono 6,07 AU — la scala non si tronca
AssertionError: 52 s × sRPE 7: attesi 6.0667 AU, la colonna «integer» li ha resi 6 —
il tipo ha troncato 6.0667 a 6: expected 6 to be close to 6.07 …
(+ rosso anche la parità caso-per-caso: 2 failed)
```

**Verde dopo il ripristino** (cmp col backup = identico): 4 passed. In più il falso-verde
smascherato durante la costruzione: il test render è nato verde per fortuna di timing (flush
solo-microtask) e l'ancora sul titolo l'ha fatto cadere — chiuso col macrotask hop e 4 run
verdi consecutivi (v. RETRO).

## 9. Non fatto / divergenze

0. **Esito delle passate indipendenti.** **code-reviewer**: «committabile no» per UN motivo,
   confermato e fondato — `generate-batch-checkins:182` sommava con `l.total_load_au || 0`, e
   con la colonna ora NULL-abile quel `|| 0` trasformava l'assenza in «0 UA» nel prompt AI, nel
   riassunto per il coach e in `metrics_snapshot`: l'invariante della fetta violato nel percorso
   appena toccato. **Chiuso in-branch** (4° commit): somma sui soli carichi presenti, arrotondata
   a 2 decimali (la colonna è numeric, lo snapshot è una vista), e con ZERO sedute misurate il
   campo resta ASSENTE (`undefined` → la key cade dal JSON → l'inbox mostra già «—»,
   `CoachCheckinInbox.tsx:712`) e i testi dicono «N/A» come il vicino `avgRpe`. Il resto del suo
   verdetto: scope pulito, view byte-identica transazionale, mirror JS fedele (`Math.round` ≡ cast
   Postgres per srpe CHECK 1-10), `formatDurataSeduta(0)`→«<1 min», zero file vietati toccati.
   **supabase-rls-auditor**: PASS con 1 media DELLA fetta — la decisione sul reperto-view va
   PRIMA dell'apply (recepito: §10.0) — più 2 preesistenti chip-flaggate (`analyze-athlete-week`
   parsa il body prima dell'auth e non usa `assertUuid`; `console.error` con possibili frammenti
   in `generate-batch-checkins`) e 1 bassa (ri-verifica dei grant post-apply, aggiunta a §10.2).
   **code-test-verifier**: 8 comandi, tutti verdi con gli exit code (i 5 gate + 3 suite Deno).
   **aura-theme-auditor NON lanciato, con motivo misurato**: v. §9.4.
1. **Il reperto-view si attiva**: con `total_load_au` finalmente popolata, il ramo
   `total_load_au * COALESCE(rpe_global,5)` di `analytics_athlete_summary` (righe 92-93 della
   migration nuova, ereditate byte-identiche dalla 0214) moltiplica il carico per un RPE
   FABBRICATO (5, perché `rpe_global` è vuota dal 24/08) — il doppio conteggio censito il 25/08.
   Ricrearla identica era il mandato («non la riscrivere di iniziativa»); il fix è SQL da un
   rigo ma cambia i numeri esposti (acute/chronic/current_acwr): decisione per Nicolò, blocco in §10.
2. **`useOfflineSync` è un modulo scollegato** (0 importatori, censito già il 25/08): la
   riscrittura ai secondi lo tiene coerente per quando verrà ricablato, ma NON c'è un percorso
   vivo che la eserciti — il percorso vivo è il debrief, che i secondi li scrive da prima.
3. **`types.ts` non rigenerato** (dichiarato in §2): `numeric` mappa su `number|null` come
   `integer`; regen dopo l'apply.
4. **Aura-theme-auditor non lanciato, con motivo misurato**: il diff non tocca UNA className
   (`git diff … | grep -c className` → 0) — cambiano solo dati e testo derivato.
5. **`estimated_duration_minutes`** (`src/types/training.ts:121`): grandezza diversa (stima del
   template, non misura della seduta) — fuori scope, nominata perché il grep la trova.

## 10. Resta a Nicolò

- **Merge della PR** ([crea-PR](https://github.com/wolfwood370-cell/nc-performace/pull/new/claude/durata-unica)).
- **Il blocco SQL che prepara Cowork** (dopo il merge, col benestare di Nicolò): 0. ⚠️ **PRIMA dell'apply, la decisione sul reperto-view** (§9.1 — riordinato qui su rilievo
  dell'auditor RLS: attivare il ramo tocca `current_acwr`, un indicatore che orienta decisioni
  di carico). Applicare la migration così com'è ATTIVA il doppio conteggio
  (`total_load_au * COALESCE(rpe_global,5)`) sulle 4 righe con carico vero. Le opzioni:
  (a) applicare e accettare il reperto finché una fetta dedicata corregge la view (fedele al
  mandato «non riscriverla di iniziativa»); (b) chiedere a Code il FILE con la correzione a un
  rigo (ramo 1 → `total_load_au`) PRIMA dell'apply — cambia i numeri esposti da
  `current_acwr`/`acute_load_raw`/`chronic_load_raw`.
  1. `apply_migration` con ESATTAMENTE il file `20260827130000_durata_unica_carico_sui_secondi.sql`
     (stesso nome/versione — workflow §8.2).
  2. Verifica post-apply:
     `SELECT count(*) FILTER (WHERE total_load_au IS NOT NULL) AS con_carico, count(*) FILTER (WHERE total_load_au IS NULL) AS senza, round(avg(total_load_au) FILTER (WHERE total_load_au IS NOT NULL), 2) AS media FROM workout_logs;`
     → attesi: 4 con carico, 12 senza (e la seduta 52 s × sRPE 7, se presente, a ≈6,07). E il
     check dei grant chiesto dall'auditor:
     `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='analytics_athlete_summary';`
     → attesi identici ai default pre-apply (misurati il 27/08: anon/authenticated/service_role/postgres, tutti i privilegi).
  3. `get_advisors(security)` di rito dopo il DDL.
  4. **Deploy delle due edge** (`analyze-athlete-week`, `generate-batch-checkins`) via connettore —
     le select ridotte sono compatibili anche PRIMA dell'apply (togliere colonne da una select non
     rompe), quindi l'ordine apply/deploy è libero.
- **L'ultimo miglio a occhio** (C9): atleta chiude una seduta col cronometro vero → Cowork
  interroga `SELECT srpe, duration_seconds, total_load_au FROM workout_logs ORDER BY started_at DESC LIMIT 1`
  → il carico è `srpe×secondi/60` con due decimali sensati, e il coach nel pannello messaggi
  legge la durata in minuti — o niente, se l'atleta non ha chiuso col debrief.
- **La rimozione di `duration_minutes`**: secondo passo, dopo che la produzione gira sui secondi.
