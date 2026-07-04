# AUTO-MIGLIORAMENTO — diario di processo (nc-performance-hub)

> **Cos'è.** Le lezioni su **COME lavorare** su questo repo (non sul contenuto-metodo: quello vive in `.claude/methodology/`). Serve a non ripetere gli errori e a standardizzare ciò che funziona. Vale per **Claude Code** e per **Cowork**.
> **Quando si usa.** Si **legge all'INIZIO** di ogni sessione (dopo `CLAUDE.md`/`COWORK.md` + `00-CORE.md`) e si **aggiorna alla FINE**, con una RETRO subito prima dell'handoff.
> **Regola d'oro.** Concreto e **falsificabile**, niente auto-elogio: se una voce non cambierebbe un comportamento, non si scrive.

## Come si usa (rituale)

- **INIZIO:** leggi «Cosa funziona» + «Fragilità & errori ricorrenti» + le ultime 1-2 voci del Log → entri in sessione sapendo dove si inciampa.
- **FINE (prima dell'handoff):** RETRO in 3 caselle + una voce datata nel Log:
  1. **Funzionato** (da tenere) · 2. **Subottimale** (+ il fix, anche sui propri passi falsi) · 3. **Migliorie azionabili** (dove le persisti).
- **Promozione:** una lezione che si ripete → spostala da «Log» a «Cosa funziona»/«Fragilità». Il Log è append-only.

---

## DA NON FARE — paletti (controlla prima di agire)

> Divieti netti e **falsificabili**. Nati da incidenti reali o da regole non negoziabili di `CLAUDE.md`/`COWORK.md`.

**Git & repo**

- **NON** `push` mai: si opera in `.claude/worktrees/<slug>` su branch `claude/<slug>`; sincronizza **Nick** via GitHub Desktop (`CLAUDE.md` legge #8).
- **NON** committare con il **build-gate rosso**: `npx tsc --noEmit -p tsconfig.app.json` deve essere verde (legge #3).
- **NON** fare git di **scrittura dalla sandbox Cowork** su repo montato: lascia `.git/index.lock` non rimovibile e **blocca il Pull di GitHub Desktop**. Cowork = git **read-only** (`COWORK.md` legge #1).
- **(Cowork) NON** scrivere file nel working tree (nemmeno `HANDOFF`/migrazioni): sono untracked → **stash-loop** al primo switch. Li committa **Code** (`COWORK.md` legge #2).

**DB & security**

- **(Code) NON** applicare migration/DDL sul DB: niente MCP Supabase in Code → proponi il **FILE** `supabase/migrations/*`. Il DB lo opera **Cowork** col benestare di Nick (`CLAUDE.md` legge #11).
- **NON** usare l'**hand-patch `types.ts`** storico (droppare/ripristinare `appointments`): con il DB di proprietà è **obsoleto** → rigenera via `supabase gen types typescript --linked` (legge #7).
- **NON** toccare RLS/`SECURITY DEFINER`/advisor "perché posso": ownership condivisa → **STOP & ASK** (`CLAUDE.md §5`).
- **NON** proporre un distruttivo (drop, `stash drop`, `rm`) senza averne ispezionato il contenuto prima (`COWORK.md` legge #3).

**Codice & scope**

- **NON** "while you're here": un commit = un intervento logico; flagga il resto, non mescolare scope (legge #2/#4).
- **NON** mescolare token Coach/Athlete: `src/components/coach/**` non usa `.theme-athlete` e viceversa (`CLAUDE.md §2`).
- **NON** mettere hook dopo un `return` early: tutti gli hook prima (legge #6; `00-CORE §8`).
- **NON** fidarsi del "success" di uno strumento (Lovable, connettore, form-builder): **verifica nel diff reale / nel browser** prima di dire fatto.

**Segreti & confini**

- **NON** stampare/committare `.env`, secrets, chiavi Stripe/Google: sono di **Nick** (`COWORK.md` legge #4).
- **NON** committare `console.log`: usa `src/lib/logger.ts` (legge #10).

## Cosa funziona (tenere / standardizzare)

1. **Misura prima di agire** (`wc -l`/`Grep` mirato): mai indovinare la struttura di un file.
2. **Commit atomici + verifica-commit immediata** (`git log -1` + `git status`): lo stato è sempre noto.
3. **Build-gate deterministico** (hook `tsc --noEmit` PostToolUse): "il modello non può dimenticare".
4. **Worktree isolato** per branch: il `main` resta pulito, il merge lo fa Nick.
5. **Verifica-nel-diff, non nel "success"**: dopo un tool esterno, `git diff` reale (o browser) prima di fidarsi.
6. **STOP & ASK sui casi §5** (data loss / RLS / breaking API / business): una decisione alla volta, dichiarata in 1 riga.
7. **Divisione DB/codice**: Cowork opera il DB (connettore + advisors), Code scrive i file di migrazione → niente "lethal trifecta" in mano all'esecutore-codice.

## Fragilità & errori ricorrenti (+ guardia)

1. **Sandbox `.git/index.lock`** (git write da Cowork) → blocca GHD. Guardia: Cowork solo git read-only.
2. **"Success" ingannevole** degli strumenti AI (Lovable/form-builder/connettore): il messaggio non prova il risultato → verifica reale.
3. **Sync Lovable silenzioso** (se Lovable è nel giro): l'editor può non riflettere i commit esterni → verifica l'allineamento prima di editarci; mai due strumenti sugli stessi file insieme.
4. **types.ts**: dopo un cambio schema, dimenticare `supabase gen types --linked` → tipi stale. Guardia: rigenera + build-gate.

---

## Log delle retrospettive (append-only)

### 2026-07-04 — metodo v2: allineamento dei file-guida al DB di proprietà

**Funzionato.** Il pacchetto "metodo v2" ha allineato `CLAUDE.md`/`COWORK.md`/`03`/`04` alla realtà (Supabase proprio + 5 attori), eseguendo il piano già scritto in `docs/DB_MIGRATION.md §8/App.A` invece di re-deciderlo → chiusa la **D5** (security ownership) col modello a ownership condivisa.
**Subottimale (+fix).** I file-guida erano rimasti indietro rispetto allo stack reale (Lovable-ism sparsi). **Fix:** questo file + il rituale RETRO a ogni sessione, così lo scarto file-guida↔realtà si nota subito.
**Migliorie azionabili.** (1) Leggere questo file a inizio sessione (aggiunto a `CLAUDE.md §4/§6`). (2) A ogni cambio di stack/ownership, `grep` dei termini obsoleti (es. "Lovable Cloud", "Lovable Security Agent") come check di regressione.

### 2026-07-04 — applicazione del pacchetto metodo v2 (Claude Code, branch `claude/metodo-v2`)

**Funzionato.** Spec chirurgiche con acceptance-grep falsificabili: 8 commit atomici applicati senza ambiguità; la review avversariale multi-agente post-sweep ha trovato 2 residui reali (un qualificatore difforme dalla legge #11 in `03 §0`; uno "Stitch" in un report di esempio di `05` r.416) poi corretti.
**Subottimale (+fix).** (1) Gli acceptance-grep "=0" del pacchetto non prevedevano che le bozze stesse citassero i termini obsoleti per negarli (`CLAUDE.md` legge #11, `COWORK.md` legge 5, l'esempio di grep qui sopra) né le righe diff storiche di `DB_MIGRATION.md App.A`: eccezioni documentate a mano. **Fix:** nei prossimi pacchetti, dichiarare le eccezioni attese direttamente nell'acceptance. (2) Micro-tensione interna al pacchetto: `CLAUDE.md` legge #11 dice "niente MCP Supabase in Code" ma la toolmap `COWORK.md §4` concede a Code le letture MCP (e `docs/CLAUDE_CODE_SETUP.md §1` configura l'MCP read-only in Code) → da riconciliare con Nick alla prossima revisione dei file-guida.
**Migliorie azionabili.** Il check di regressione (2) della voce precedente è stato eseguito qui e funziona: tenerlo come passo standard dopo ogni sweep di rename/ownership.
