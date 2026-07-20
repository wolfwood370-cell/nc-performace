# PROMPT per Claude Code — Fetta billing de-Lovable (origini Stripe)

> Estratto 1:1 dal blocco IL PROMPT di `app/spec-billing-de-lovable-2026-07-20.md` (fonte unica).
> Contenuto fedele al blocco incollato in Claude Code il 2026-07-20; impaginazione markdown di rito.

**Task:** Sostituire nelle 2 funzioni Stripe la whitelist-origini del vecchio provider con i domini del progetto, estraendo la logica in un modulo condiviso testato. NIENTE DDL, NIENTE scritture DB, nessuna env nuova obbligatoria, contratto request/response INVARIATO, frontend intatto.
**Data:** 2026-07-20
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** `claude/billing-de-lovable`

Lavori sul repo NC Performance Hub (frontend Vite SPA; edge functions = Deno). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- `supabase/functions/create-checkout-session/index.ts` — il lavoro è SOLO il blocco-origine (dal commento `// Origin whitelist` fino a `isAllowedOrigin()` compresa, più le 2 righe d'uso `requestOrigin`/`origin`). TUTTO il resto NON si tocca: corsHeaders (CORS ≠ whitelist redirect: due cose diverse), auth, ownership check `is_coach_of_athlete` (firma a 1 argomento, hotfix di ieri), fetch del piano, creazione product/price/session, insert `athlete_subscriptions` con status `incomplete`.
- `supabase/functions/create-portal-session/index.ts` — idem: solo blocco-origine; il commento sul debito least-privilege resta com'è.
- `supabase/functions/_shared/apiKeys.ts` + `apiKeys.test.ts` — pattern-casa per moduli condivisi + test: NON toccarli, solo imitarli (fail-fast documentato, test Deno).
- Call-site unico del checkout: `src/hooks/useBillingPlans.ts` (`generateCheckout`, invoke con `{plan_id, athlete_id}` → `{url}`): NON si tocca. Il portal non ha call-site.
- `supabase/config.toml` — intatto (18/18 pinnate: checkout/portal `verify_jwt=true`, webhook `false`).
- Domini REALI del progetto Vercel (verificati 2026-07-20 via connettore): `nc-performace-mu.vercel.app` (prod) · `nc-performace-nicolos-projects-7012398b.vercel.app` · `nc-performace-git-main-nicolos-projects-7012398b.vercel.app`.

## OBIETTIVO (osservabile)

1. Origin del chiamante ammessa → riflessa nei redirect Stripe (comportamento attuale conservato).
2. Origin assente / non ammessa / malformata → default di progetto `https://nc-performace-mu.vercel.app` (mai un dominio del vecchio provider, mai l'Origin ostile).
3. Sviluppo locale: `http://localhost:<porta>` e `http://127.0.0.1:<porta>` restano ammessi (parità attuale, match sul solo hostname).
4. Estensione senza toccare codice (servirà per il dominio brand, Fetta 3): env FACOLTATIVE
   - `ALLOWED_ORIGIN_HOSTS` = hostname separati da virgola, AGGIUNTI alla lista di default (mai in sostituzione);
   - `DEFAULT_ORIGIN_URL` = origin completa `https://…` che sostituisce il default; il suo hostname è implicitamente ammesso (è l'operatore a impostarla, non il chiamante). Assenti o malformate ⇒ si va coi default nel codice, MAI un errore.

## ARCHITETTURA (dove va la logica)

- NUOVO modulo condiviso `supabase/functions/_shared/origins.ts`: logica PURA e parametrizzata (niente fetch/Date/random; la lettura delle env isolata in un punto solo, testabile per iniezione). Le firme esatte le proponi nel PIANO; le proprietà OBBLIGATORIE: (a) match per hostname ESATTO su lista chiusa — MAI pattern/suffissi; (b) https-only, con la sola eccezione localhost/127.0.0.1 in http; (c) la risoluzione dell'origine non lancia MAI e nel dubbio restituisce il default (fail-safe); (d) parse difensivo delle env: trim, scarta vuoti/invalidi con un console.warn che elenca SOLO i valori scartati (qui non ci sono segreti), il resto sopravvive.
- Le 2 fn importano dal modulo (come già fanno con `apiKeys.ts`) e perdono il blocco duplicato; il commento che spiega il PERCHÉ della whitelist (l'Origin non fidato fluisce nei redirect Stripe → dirottamento possibile; warning advisor) vive nel modulo, nelle fn resta un puntatore breve.
- Default nel CODICE (deterministici): lista = i 3 hostname Vercel qui sopra; origin di default = `https://nc-performace-mu.vercel.app`.

## INVARIANTI DA NON ROMPERE

1. La whitelist si SOSTITUISCE, mai si rimuove né si allarga a pattern: VIETATO `endsWith(".vercel.app")` o simili — ammetterebbe i deploy Vercel di CHIUNQUE. Il perché del divieto resta scritto nel codice.
2. Mai fail-open: env assente/malformata ⇒ default; la risoluzione non lancia mai; nessun percorso restituisce l'Origin non verificata.
3. Contratto request/response delle 2 fn INVARIATO; `corsHeaders` INVARIATI; il frontend non cambia (zero file in `src/`).
4. Zero occorrenze del nome del vecchio provider nei sorgenti toccati, COMMENTI COMPRESI (acceptance grep): il riferimento storico vive nei messaggi di commit, non nel codice.
5. Zero DDL · zero scritture DB · zero env nuove obbligatorie · `config.toml` intatto · nessun'altra funzione toccata.
6. Il debito least-privilege del portal resta com'è (registrato, fuori fetta).
7. Determinismo: stesso input (origin + env) → stesso output, sempre.

## FILE

- NUOVI: `supabase/functions/_shared/origins.ts` · `supabase/functions/_shared/origins.test.ts` · `docs/prompts/2026-07-20-billing-de-lovable.md` (questo prompt).
- MODIFICATI: `supabase/functions/create-checkout-session/index.ts` · `supabase/functions/create-portal-session/index.ts` (solo blocco-origine → import dal modulo) · doc di rito repo (HANDOFF/auto-miglioramento in `docs/`).
- VIETATI: `stripe-webhook/**` · `_shared/apiKeys*` · `_shared/email/**` · `_shared/method/**` · `_shared/nutrition/**` · ogni altra funzione · tutto `src/**` (incluso `useBillingPlans.ts`) · `supabase/config.toml`. Niente "while you're here".

## COME LAVORI

- Prima il PIANO (firme del modulo, elenco test caso-per-caso, mappa esatta della sostituzione in ciascuna fn) → STOP per il mio OK → poi commit atomici (proposta: 1 origins+test · 2 checkout · 3 portal · 4 doc).
- `deno test` e `npx tsc --noEmit` verdi; suite esistente intatta.
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = io (Nick) da GitHub Desktop.

---

## Addendum esecuzione (2026-07-20, post-OK del piano)

- **Precisazione recepita all'OK**: le entry di `ALLOWED_ORIGIN_HOSTS` si processano nell'ordine **trim → lowercase → validazione** (hostname === entry GIÀ normalizzata), con test dedicato (`"App.Example-Finto.com"` → ammessa come `app.example-finto.com`, zero warn). Aggiunto anche il pin facoltativo: `https://nc-performace-mu.vercel.app:443` ammessa e riflessa normalizzata senza `:443`.
- **Micro-decisioni dichiarate nel piano**: (1) origin ammessa riflessa come `new URL(origin).origin` (normalizzata; per un vero header Origin è identica al raw — parità di fatto conservata); (2) hostname confrontati lowercase; (3) `https://localhost` resta NON ammessa (eccezione solo in http, parità attuale); (4) entry env vuote (virgole doppie) scartate in silenzio, solo le invalide non-vuote nel warn.
- **Esecuzione**: 4 commit come da proposta; 24 test Deno nuovi (`origins.test.ts`); `deno check --no-lock --node-modules-dir=none` sulle 2 `index.ts` (il flag serve nel worktree senza `node_modules`); acceptance grep `-i lovable` = 0 su tutti e 4 i sorgenti toccati.
- **Fuori fetta flaggato**: commento «Lovable AI Gateway» in `supabase/functions/ingest-knowledge/index.ts:95` (unico residuo del nome nelle functions, file non toccato da questa fetta).
