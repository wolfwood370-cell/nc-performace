# COWORK.md — Entry point per sessioni Cowork

> **Complementa `CLAUDE.md`** (che è il manuale di **Claude Code**). Se operi in **Cowork** su
> nc-performance-hub, questo è il tuo punto di ingresso.
> `CLAUDE.md` = corsia **Code** (codice / branch / commit). Questo file = corsia **Cowork**
> (infra / connettore / ricerca / planning / doc / **DB via connettore**) + il **contratto di handoff** fra i due.
> Stesso ingegnere senior, stesso repo, stessa lingua — strumenti e poteri diversi.

---

## 1. Chi sei (lane)

|               | **Cowork (tu, qui)**                                                                                                                        | **Claude Code**                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fa            | esplorazione read-only · **DB via connettore Supabase (DDL/DML)** · Claude-in-Chrome · ricerca web · **planning** · draft doc · **handoff** | edita `src/**` · build-gate · branch · commit |
| Git           | **read-only**                                                                                                                               | read **+ write** (commit)                     |
| DB            | **read + write con disciplina** (§4-bis) — è il tuo binario                                                                                 | **solo i FILE di migrazione** (niente MCP DB) |
| Output tipico | piano + prompt di trasferimento, migrazioni applicate + SQL da committare, verifica dati, doc                                               | diff + commit atomico                         |

Se un task richiede di **scrivere codice o committare** → non è tuo: prepara il piano e passa a Code.
Il **DB invece è tuo**: lo operi via connettore (§4-bis), e il **file** di migrazione lo committa Code.

---

## 2. Le leggi Cowork (vincolanti)

1. **Git = READ-ONLY.** Mai `branch` / `add` / `commit` / `stash` / `rm` / `reset` / `checkout`.
   Il sandbox può lasciare un `index.lock` non rimovibile e `git status` mostra CRLF falsi.
   Letture ok: `git log`, `git stash list`, `git branch --show-current`, `git ls-files`, `git show`.
2. **Niente scritture nel repo.** Ogni file scritto nel working tree è **untracked** sul branch
   corrente → GitHub Desktop lo stasha al primo switch (**stash-loop**). Piani e output → **in chat**
   o nello **scratchpad** (`outputs/`). Se serve un file _nel repo_ (incluso un file di migrazione o
   `HANDOFF`) → lo crea e committa **Code** su branch.
3. **Verifica prima di ogni distruttivo.** Mai proporre `git stash drop` / `rm` / DDL distruttivo
   senza prima ispezionarne il contenuto (read-only). `CLAUDE.md §5` "possibile data loss" = **STOP & ASK**.
4. **Secrets / `.env` / Stripe / Google = Nick.** Non li tocco, non li committo, non li stampo.
5. **Security = ownership condivisa (non più defer a Lovable).** Non esiste più un Lovable Security Agent.
   Advisor Supabase, RLS, `SECURITY DEFINER`, edge auth, Realtime scoping: **review e applicazione DB = tuoi**
   (via connettore, §4-bis, col benestare di Nick); **codice sicuro + `/security-review` ai milestone = Code**.
6. **Mai push da Cowork** (git è read-only, legge #1). Nota: dal 2026-08-01 questa NON è più la regola di Code — Code pusha i SUOI rami `claude/*` e apre la PR verso `main`; il merge resta di Nick, dietro ruleset server (PR obbligatoria, check verdi).
7. **Esplora → pianifica → proponi PRIMA di agire.** Non sconfinare nella corsia di Code "perché posso".
   (Il DB è l'eccezione esplicita: lì agisci, con la disciplina §4-bis + STOP-per-OK sui distruttivi.)

---

## 3. Cosa eredito da CLAUDE.md

Lingua **italiano** · **misura prima di agire** (legge #1) · **decision framework** (§5: chiedi vs decidi,
e _dichiara_ la decisione in 1 riga) · output style (**tabelle > paragrafi**, `file:line`, conciso) ·
dual-interface/Aura awareness se mai tocco design · **lezioni di processo** (`docs/auto-miglioramento.md`: leggi a inizio, RETRO a fine).

---

## 4. Toolmap — chi fa cosa

| Strumento                                                                    | Cowork | Code | Nick |
| ---------------------------------------------------------------------------- | :----: | :--: | :--: |
| Read / Grep / bash **read-only**                                             |   ✅   |  ✅  |      |
| Supabase MCP — **letture** (`list_tables`, `execute_sql` SELECT, advisors)   |   ✅   |  ✅  |      |
| Supabase MCP — **scritture** (`apply_migration` DDL, `execute_sql` DML/seed) |   ✅   |      |      |
| Claude-in-Chrome (avvisa Nick **prima**)                                     |   ✅   |      |      |
| Ricerca web / draft doc nello scratchpad                                     |   ✅   |      |      |
| Edit `src/**` · `tsc --noEmit -p tsconfig.app.json` · knip/depcheck/ts-prune |        |  ✅  |      |
| **File** di migrazione in `supabase/migrations/**` (dal SQL di Cowork)       |        |  ✅  |      |
| Git write · commit atomico · push del ramo `claude/*` + apertura PR          |        |  ✅  |      |
| Merge delle PR in `main` · secrets/`.env` · operazioni distruttive           |        |      |  ✅  |

---

## 4-bis. Disciplina DB (connettore Supabase) — è il binario di Cowork

- **Ogni DDL passa da `apply_migration`** (tracciata nella storia del DB) **e lo stesso SQL si salva come file**
  `supabase/migrations/<timestamp>_<nome>.sql` con lo stesso nome/versione → il **file lo committa Code** (legge 2).
  Mai schema remoto fuori dai file di migrazione, o `db push` va in errore di sync.
- **`execute_sql` solo per DML/query** (seed dati, letture, fix puntuali). Niente DDL da lì.
- **`get_advisors(security)` dopo ogni DDL** + backup della tabella prima di operazioni distruttive.
  Rollback su prod = **migrazione correttiva in avanti**, mai reset.
- **Deviazione dichiarata:** Supabase raccomanda ufficialmente di NON puntare l'MCP alla produzione
  ("development and testing"). La usiamo per scelta di Nick, con mitigazioni: oggi **zero dati reali di clienti**;
  approvazione manuale di ogni chiamata; scoping sul progetto; letture read-only quando possibile.
  **Da irrigidire al go-live coi clienti veri** (read-only di default + finestre di scrittura pianificate).
- **Free-tier pausing:** il progetto va in pausa dopo ~7 giorni di inattività → **resume prima di ogni lavoro DB**
  (dashboard/connettore, dati intatti entro 90 giorni). Branching DB = piano a pagamento → per ora niente branch DB.

---

## 5. Contratto di handoff (il cuore della sinergia)

- **Cowork → Code**: consegno un **piano azionabile** — `file:line`, breakdown in commit atomici,
  comando build-gate, edit knip/doc, **+ eventuale SQL di migrazione già applicato sul DB** (perché Code
  crei il file `supabase/migrations/*` corrispondente) — + un **prompt di trasferimento** (`HANDOFF §8`). Non eseguo codice.
- **Code → Cowork**: Code mi passa **hash commit + stato**; io **preparo il delta `HANDOFF`** (§2/§3/§4 + prompt)
  in chat/scratchpad e lo passo a **Code, che lo committa** — Cowork non scrive nel repo nemmeno per `HANDOFF` né per i file di migrazione (vedi §2 legge 2).
- **Nick**: merge delle PR in `main` (ruleset server coi check obbligatori), secrets, operazioni distruttive, approvazione delle chiamate DB.
- I prompt **§8 (Code)** e **§9 (Cowork)** vivono in `docs/HANDOFF.md` → usali, **non duplicarli** qui.

---

## 6. Context & handoff automatico

Monitoro il contesto: a **~85%** mi fermo, lo dichiaro, preparo **handoff aggiornato + prompt di
ripartenza**. Preferenza Nick: **sempre**, a fine milestone o quando la chat si allunga, senza che lo chieda.

---

## 7. Fatti operativi durevoli (consolidati da memoria + HANDOFF §5)

- **Sandbox bash**: file montati con **NUL-padding** → usa `Read` / `grep -a` (non `cat`/`sed` grezzi).
- **`.env.local`** (gitignored) ripunta il FE al backend nuovo — **TEMPORANEO**, non è il cutover D6.
- **Supabase di proprietà**: ref `xgxtplqlewpqjzghvbke` — **read + write con disciplina** dal connettore in Cowork (§4-bis).
  Può risultare **INACTIVE** (free-tier pausing) → **resume prima di ogni lavoro DB**.
- **Tooling audit** (knip/depcheck/ts-prune) e **build-gate**: solo in **Code**.
- **Doc / file di migrazione untracked**: finché non sono tracked, GHD li stasha agli switch → preferire commit (via Code).

---

_COWORK.md — corsia Cowork, complemento di CLAUDE.md. Da committare in repo via Code (branch `claude/metodo-v2`)._
