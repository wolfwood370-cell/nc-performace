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

### 2026-07-05 — invito nativo + email automatica (branch `claude/invito-nativo-auto-email`)

**Funzionato.** Il prompt-file con "verità di riferimento" (file + righe esatte da cambiare) ha azzerato l'esplorazione a vuoto; la version canonica della migration è arrivata da Cowork/Nick e il file mirror rispecchia `schema_migrations` (disciplina §4-bis rispettata); la review avversariale post-implementazione ha trovato problemi reali (toast in inglese su percorsi non mappati; HTML injection del nome nell'email, amplificata dal nuovo mittente verificato) corretti prima della chiusura. Il classificatore ha bloccato la lettura MCP dalla corsia Code: la legge #11 regge anche quando "sarebbe comodo".
**Subottimale (+fix).** Il flusso nativo promosso a primario NON ha un percorso di reinvio: dopo un 502 Resend / email in spam / link scaduto, il retry risponde `alreadyLinked` senza inviare nulla (l'utente auth nasce già a `generateLink`) e nemmeno il fallback manuale recupera. **Fix di processo:** quando si promuove un flusso a "primario", chiedersi sempre «e il retry/reinvio?» prima del rollout — flaggato come task dedicato, non mescolato allo scope.
**Migliorie azionabili.** (1) Task flaggato: reinvio invito + hardening ramo attach + paginazione `listUsers`. (2) Al merge, delta Cowork su `HANDOFF §2` (la riga "edge fn non usata dalla UI" diventa falsa) e `PRODUCT_SPEC` (~r.262). (3) Task flaggato: ritiro del flusso manuale quando il nativo è provato.

### 2026-07-05 — motore-metodo M1: moduli deterministici in `generate-program/method/` (branch `claude/motore-metodo-m1`)

**Funzionato.** Asset Cowork (tabella RPE, seed neurotipo) committati così com'è con test falsificabili sopra (spot-check esatti dalla CSV); la regola "se un test contraddice la tabella vince la CSV" dichiarata da Nick PRIMA di scrivere i test toglie ogni ambiguità; `npx deno test` come runner (Deno non installato sulla macchina): binario ufficiale via cache npm, zero modifiche di sistema, 20/20 verdi.
**Subottimale (+fix).** Il primo run Deno ha creato `deno.lock` alla radice (untracked → rischio stash GHD, lezione nota): rimosso a fine lavoro, run successivi con `--no-lock`. **Fix:** se il motore Deno cresce (M2+), decidere con Nick se adottare `deno.json` + lock versionati.
**Migliorie azionabili.** (1) Prettier riformatta gli asset al commit (wrapping): i VALORI restano intatti e i test lo provano — se mai servisse il byte-identico, `method/` in `.prettierignore` (decisione Nick). (2) Il matching neurotipo→attributi è volutamente minimale (token + sinonimo `esplosivo→balistico`): da arricchire in M2 quando l'orchestrazione dirà quali voci dei seed servono davvero.

### 2026-07-05 — motore-metodo M2: forma B nella edge fn, via l'LLM (branch `claude/motore-metodo-m2`)

**Funzionato.** La review avversariale multi-agente PRIMA della chiusura ha trovato 3 difetti gravi che i test unit non vedevano perché stavano **nei confini** (edge↔FE, motore↔dati di onboarding): il gate che avrebbe bloccato il 100% degli atleti onboardati (`red_flags` è sempre un oggetto a 4 chiavi, anche da sani), la risposta gate/settimana-vuota che il FE trattava come successo **svuotando la settimana del builder**, e `experience_level` scritto in inglese dal FE. La risposta giusta l'ha data Nick (200 `{error, gate:true}` senza `days`): né la forma della spec né la mia proposta 422 — fermarsi sui conflitti di contratto paga.
**Subottimale (+fix).** (1) I moduli erano testati, i **contratti fra i moduli e il mondo** no: i fixture "puliti" non riproducevano la forma reale dei dati (`red_flags` di un atleta sano). **Fix di processo:** per ogni campo letto da `profiles`/jsonb, un test con il valore REALE che il FE scrive (aprire il writer, non immaginare il dato). (2) Schema drift: le colonne method di `exercises` vivono solo sul DB (niente migration-mirror, `types.ts` stale) — flaggato task di riconciliazione (legge #7 + §4-bis).
**Migliorie azionabili.** (1) Task flaggato: migration mirror `exercises` + regen `types.ts`. (2) Restano note (bassa): parsing equipment senza negazioni ("no bilanciere" = bilanciere disponibile), copy del dialog su mode 'continue' ora impreciso, paginazione libreria >1000 righe — da riprendere con l'iterazione FE/M3.
