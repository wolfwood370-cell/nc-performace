# SPEC — Migrazione API key: Fase B (18 edge function → chiavi nuove) + Fase C (spegni legacy)

## Intestazione

- **Tipo:** task-modulo
- **Stato:** pronto-per-Code
- **Eredita da:** CORE (`app/spec-CORE-2026-07-11.md` — §0 invarianti, auth/edge). Non ridefinisce contratti.
- **Repo/target:** `nc-performace` (Hub, modular monolith) · Supabase Hub UE `xgxtplqlewpqjzghvbke` · Vercel
- **Destinazione nel repo:** `docs/prompts/2026-07-18-migrazione-api-key.md`
- **Branch previsto:** `claude/api-key-migration`
- **Modulo/fetta:** core/infra (auth piattaforma). ⚠️ Eccezione dichiarata alla regola fetta-verticale: la migrazione chiavi è **trasversale per natura** (18 funzioni, 1 pattern). Spezzarla per modulo moltiplicherebbe i deploy senza ridurre il rischio: legacy e chiavi nuove **convivono** finché non si spegne (Fase C), quindi il taglio sicuro è «tutte in B, spegni in C».
- **Modalità toccate:** entrambe · **Tier toccati:** entrambi

## 0) Invarianti di sicurezza ereditati (in testa — non negoziabili)

- **Nessun gate clinico toccato:** questa fetta cambia SOLO l'autenticazione (quali chiavi leggono le funzioni e come si autentica il chiamante-servizio). Contratti request/response, gate del motore (consent art.22, dolore, guardrail nutrition), RLS: **INVARIATI**.
- **Invarianti propri della fetta:**
  1. **Nessun segreto in chat/log/commit** (lezione sess.75: la service*role è finita in chat). Il valore di `CRON_SECRET` e delle `sb_secret*…` non compare MAI in codice, log, test, commit message, chat.
  2. **Fail-closed:** env nuova mancante → errore esplicito (500/throw), MAI fallback silenzioso alla chiave legacy (dopo Fase C il fallback girerebbe su una chiave morta = rotture fantasma).
  3. La chiave `service_role`/secret **non fa mai da segreto di autenticazione del chiamante** (era il pattern di `compute-nutrition-target`, va rimosso).

## 1) Contesto (non parte del prompt a Code)

- **Posizione roadmap:** chiude la falla di sess.75 (service_role esposta in chat, ancora attiva) + sblocca lo smoke E2E nutrition parcheggiato + prerequisito per armare lo scheduler settimanale (pg_cron) al 1° atleta autonomo.
- **Già esistente da riusare:** frontend GIÀ migrato (Fase A, sess.76: bundle-grep del deploy live = publishable presente, 0 JWT legacy). `_shared/` esiste già (`method/`, `nutrition/`) → il nuovo helper segue la convenzione. `src/integrations/supabase/client.ts` legge già `VITE_SUPABASE_PUBLISHABLE_KEY`; `.env.local`/`.env.example` già puliti (solo PROJECT_ID/URL/PUBLISHABLE) → **zero lavoro frontend/env in questa fetta**.
- **Dipendenze:** B abilita C · C neutralizza la chiave esposta · B sblocca smoke nutrition + scheduler futuro.

## 2) Prerequisiti — PRIMA di lanciare la fetta

- **Nick (bloccanti, ~5 min):**
  1. Dashboard → **Project Settings → API Keys**: conferma che esista una **secret key** (`sb_secret_…`) e che il suo **nome sia `default`** (la publishable esiste già dalla Fase A). Se il nome è diverso, dillo: la spec usa `['default']`.
  2. Dashboard → **Edge Functions → Secrets**: conferma che compaiano `SUPABASE_SECRET_KEYS` e `SUPABASE_PUBLISHABLE_KEYS` (Supabase le auto-inietta quando le chiavi nuove esistono).
  3. Genera il segreto cron in locale: `openssl rand -base64 32` → settalo con `npx supabase secrets set CRON_SECRET=<valore> --project-ref xgxtplqlewpqjzghvbke` (o Dashboard → Edge Functions → Secrets → Add). **Non incollare il valore in chat.**
- **Cowork:** nessuna scrittura DB (questa fetta = ZERO DDL, ZERO scritture dati).
- **Blocker verificati live (2026-07-18, connettore + repo + DB):**
  - 18 edge function ACTIVE, **tutte al 100% su chiavi legacy** (0 già migrate). Ripartizione: 10 usano ANON+SERVICE_ROLE · 4 solo ANON · 4 solo SERVICE_ROLE.
  - `supabase/config.toml`: **16/18 pinnate** — MANCANO `submit-intake` (live true) e `forgot-password` (live **FALSE** → trappola, vedi §config.toml).
  - DB: `pg_cron` e `pg_net` **NON installati** · Vault **vuoto** · **zero** trigger http → non esistono chiamanti nascosti con chiavi legacy oltre alle 18 funzioni + frontend (già migrato).
  - Meccanismo doc-verificato (guida ufficiale migrazione): le nuove env nelle funzioni sono **oggetti JSON** → `JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']` (NON `Deno.env.get('SUPABASE_SECRET_KEYS')['default']` secco). Le due famiglie di chiavi **convivono** finché non si disattivano le legacy. Le secret key rispondono **401 se usate da browser** (protezione by-design).

---

## IL PROMPT — copia da qui (tutto il blocco)

```
**Task:** Migra le 18 edge function alle nuove API key Supabase (publishable/secret) e ri-patterna l'auth di compute-nutrition-target su un CRON_SECRET dedicato. NIENTE DDL · NIENTE scritture DB · NIENTE modifiche a src/ (il frontend è già migrato) · NIENTE cambi di contratto request/response.
**Data:** 2026-07-18
**Strumento di destinazione:** [x] Claude Code
**Branch previsto:** claude/api-key-migration

Lavori sul repo NC Performance Hub (frontend Vite SPA; edge functions = Deno). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice. Mantieni INVARIATO ogni contratto request/response; il frontend non deve rompersi.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)
- `CLAUDE.md` (regole repo).
- `supabase/functions/` — 18 funzioni + `_shared/` (method/, nutrition/). NON toccare `.claude/worktrees/**` (copie stale di un worktree passato).
- `supabase/config.toml` — oggi pinna 16/18 funzioni (mancano submit-intake e forgot-password).
- Meccanismo chiavi (doc ufficiale Supabase, verificato 2026-07-18): env auto-iniettate `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS` = stringhe JSON {nome→chiave}; si legge con JSON.parse(...)['default']. Legacy (`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) restano iniettate ma verranno DISATTIVATE (Fase C): mai usarle come fallback.
- Matrice per-funzione in fondo alla spec (§A) — ricognizione live 2026-07-18 sul codice DEPLOYATO.

## OBIETTIVO (osservabile)
1. `grep -r "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY" supabase/functions/` → **0 occorrenze**.
2. Ogni client Supabase interno alle funzioni usa: contesto-utente → publishable · admin → secret (helper condiviso, fail-fast).
3. `compute-nutrition-target`: autentica il chiamante con header `x-cron-secret` vs env `CRON_SECRET` (confronto timing-safe), `verify_jwt=false`; il body e le risposte di dominio restano INVARIATI (contratto motore v2: body opzionale {athlete_id}, assente = batch).
4. `supabase/config.toml` pinna `verify_jwt` per TUTTE e 18 (nessuna implicita).
5. `deno test` tutto verde (inclusi i test auth di compute-nutrition-target aggiornati al nuovo gate).

## ARCHITETTURA (dove va la logica)
- NUOVO `supabase/functions/_shared/apiKeys.ts` — unico punto di lettura chiavi (fail-fast, zero fallback) + confronto timing-safe:

  export function publishableKey(): string {
    const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    if (!raw) throw new Error("SUPABASE_PUBLISHABLE_KEYS mancante: creare le nuove API key nel Dashboard");
    const key = JSON.parse(raw)["default"];
    if (!key) throw new Error("publishable key 'default' assente");
    return key;
  }

  export function secretKey(): string {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) throw new Error("SUPABASE_SECRET_KEYS mancante: creare la secret key nel Dashboard");
    const key = JSON.parse(raw)["default"];
    if (!key) throw new Error("secret key 'default' assente");
    return key;
  }

  export function timingSafeEqualStr(a: string, b: string): boolean {
    const ab = new TextEncoder().encode(a);
    const bb = new TextEncoder().encode(b);
    if (ab.length !== bb.length) return false;
    let diff = 0;
    for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
    return diff === 0;
  }

- I due pattern di sostituzione (meccanici, per 17 funzioni):
  - Pattern U (client contesto-utente): createClient(URL, Deno.env.get('SUPABASE_ANON_KEY')!, {global:{headers:{Authorization: authHeader}}}) → createClient(URL, publishableKey(), {global:{headers:{Authorization: authHeader}}})
  - Pattern S (client admin): createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, opts) → createClient(URL, secretKey(), opts)
  (Adatta ai nomi/variabili reali di ogni file; alcune leggono l'env in una const in testa — sostituisci la lettura, non solo il createClient.)

- RE-PATTERN `compute-nutrition-target` (l'unica con auth da rifare — oggi la service_role fa DUE mestieri: chiave del client E segreto del chiamante):
  RIMUOVI il blocco attuale (const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") + parsing Bearer + confronto token === SERVICE_ROLE_KEY) e SOSTITUISCI con:

  // Auth chiamante-servizio: header x-cron-secret vs env CRON_SECRET (mai una chiave DB come segreto di auth)
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!cronSecret) return json({ ok: false, error: "server_misconfigured" }, 500);
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!provided) return json({ ok: false, error: "unauthorized" }, 401);
  if (!timingSafeEqualStr(provided, cronSecret)) return json({ ok: false, error: "forbidden" }, 403);

  const admin = createClient(SUPABASE_URL, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  Mantieni identici: helper json(), CORS/OPTIONS esistenti, contratto body {athlete_id?}, gate go-live (503 config_missing), CONCURRENCY, tutto il dominio.

## config.toml — TARGET (e la TRAPPOLA che chiude)
Pinna TUTTE e 18 (deterministico, niente drift dashboard/CLI):
- verify_jwt = **false** SOLO per: `forgot-password` · `stripe-webhook` · `compute-nutrition-target` (il chiamante-servizio non ha un JWT: la sb_secret è opaca, il gateway JWT la rifiuterebbe — stesso motivo per cui stripe-webhook e forgot-password sono già false).
- verify_jwt = **true** per le altre 15 (incluse `submit-intake`, oggi non pinnata).
⚠️ TRAPPOLA (motivo del pin totale): `forgot-password` oggi NON è nel config.toml ma live è `verify_jwt=false`. Un `supabase functions deploy` bulk senza pin la ridispiegherebbe col default `true` → il reset-password si rompe in silenzio. Stessa classe di rischio per ogni funzione non pinnata.

## INVARIANTI DA NON ROMPERE
1. Contratto request/response INVARIATO per tutte e 18 (questa fetta cambia SOLO auth/chiavi).
2. Gate di sicurezza del motore (consent art.22, guardrail, release-aware notify) INVARIATI.
3. Nessun segreto hardcoded/loggato/stampato nei test; mai il valore di CRON_SECRET o sb_secret in chiaro da nessuna parte.
4. Fail-closed: env nuova mancante → throw/500 esplicito. VIETATO il fallback alla legacy.
5. CORS: lascia gli header esistenti INVARIATI (scope-guard).
6. NIENTE refactor di `create-portal-session` (usa il client admin anche per validare l'utente = least-privilege violato; è DEBITO REGISTRATO, non di questa fetta): fai solo lo swap di chiave.
7. RLS deny-by-default resta com'è: la publishable ha gli stessi privilegi bassi della anon (doc), quindi il comportamento RLS non cambia.

## FILE
- NUOVI: `supabase/functions/_shared/apiKeys.ts`.
- MODIFICATI: i 18 `supabase/functions/<fn>/index.ts` (sostituzione lettura-chiavi; in compute-nutrition-target anche il gate) · `supabase/config.toml` (pin 18/18) · i test auth di compute-nutrition-target (+ nuovi casi: no-header→401 · header-errato→403 · CRON_SECRET-mancante→500). Se una funzione legge le env in un modulo interno oltre a index.ts, dichiara il file nel PIANO (grep prima).
- VIETATI: `src/**` · `.env*` · `supabase/migrations/**` (zero DDL) · `.claude/worktrees/**` · niente "while you're here".

## COME LAVORI
- Prima il PIANO (elenco esatto file→diff previsto per gruppo, firme helper, casi di test) → STOP per il mio OK → poi commit atomici suggeriti:
  1) `_shared/apiKeys.ts` + `config.toml` pin 18/18
  2) gruppo publishable-only (4): send-email · analyze-meal-photo · ask-copilot · check-achievements
  3) gruppo entrambe (10): delete-athlete · create-checkout-session · invite-athlete · analyze-athlete-week · generate-batch-checkins · generate-program · ingest-knowledge · chat-with-coach · submit-intake · release-autonomous-program
  4) gruppo secret-only swap (3): create-portal-session · forgot-password · stripe-webhook
  5) compute-nutrition-target re-pattern + test auth
- Chiudi con: `deno test` completo + `grep -r "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY" supabase/functions/` = 0 + `npx tsc --noEmit` (se configurato) e riporta gli output reali.
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = io (Nick) da GitHub Desktop. NIENTE deploy da Code.
```

---

## Acceptance (criteri falsificabili — ognuno può bocciare)

- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY" supabase/functions/` → **0 occorrenze** (vale anche per commenti).
- [ ] `config.toml`: 18/18 pinnate; `false` SOLO per forgot-password · stripe-webhook · compute-nutrition-target.
- [ ] `deno test` verde, inclusi i nuovi casi auth (401/403/500-misconfig) e i 26 esistenti del motore nutrition.
- [ ] Contratti invariati: nessuna shape di request/response cambiata (diff sui soli punti dichiarati).
- [ ] `git diff main..HEAD` tocca SOLO i file dichiarati (18 index.ts + \_shared/apiKeys.ts + config.toml + test).
- [ ] Nessun valore di chiave/segreto presente nel diff.

## Verifica (come si controlla — NON a memoria)

**Post-merge+deploy (Fase B), Cowork via connettore:**

1. `list_edge_functions`: 18 versioni bumpate; `verify_jwt=false` ESATTAMENTE su {forgot-password, stripe-webhook, compute-nutrition-target}, `true` sulle altre 15.
2. Grep sui sorgenti DEPLOYATI (get_edge_function, subagente): 0 riferimenti legacy; presenza `SUPABASE_SECRET_KEYS`/`SUPABASE_PUBLISHABLE_KEYS`.
3. Smoke negativi (Cowork, nessun segreto necessario): POST a compute-nutrition-target senza header → 401 · con `x-cron-secret` sbagliato → 403.
4. Smoke positivo (Nick, placeholder — il valore resta da lui): `curl -s -X POST https://xgxtplqlewpqjzghvbke.supabase.co/functions/v1/compute-nutrition-target -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{}'` → atteso `ok:true` (batch; con 0 atleti autonomi eleggibili = esito vuoto ma VALIDO) → questo **sparcheggia lo smoke E2E nutrition di sess.75**.
5. Un giro utente reale sull'app (login + una funzione JWT, es. dashboard/checkin) → 200.

**Fase C (gated sui punti 1-5 verdi):** Nick: Dashboard → Project Settings → API Keys → **Disable legacy API keys** (anon + service_role). Reversibile (re-enable possibile) = rollback a un click.
**Post-C, Cowork:** REST con la vecchia anon → 401 (prova che le legacy sono morte) · app funziona (i JWT utente NON dipendono dalle API key legacy: firmati dal JWT secret, che NON tocchiamo) · smoke positivo compute-nutrition-target ancora 200 → **la service_role esposta in sess.75 è NEUTRALIZZATA**.

## Rollback

- Fase B: redeploy del main precedente (le legacy sono ancora attive → tutto torna com'era).
- Fase C: re-enable delle legacy dal Dashboard (un click), poi si indaga.

## Chiusura

- Lato repo: aggiorna `docs/HANDOFF.md` + RETRO in `docs/auto-miglioramento.md`; merge/push = Nick.
- Lato Cowork: RETRO in `app/auto-miglioramento-app.md` + STATO in `app/HANDOFF-APP.md`/`app/PROMPT-APP.md`.

## Cosa resta a Nick / prossimo

- **Nick:** pre-flight chiavi (§2) · lancio Code · merge · `npx supabase functions deploy --project-ref xgxtplqlewpqjzghvbke` (bulk, rispetta config.toml) · smoke positivo · Fase C (disable legacy).
- **Cowork:** verifiche live post-deploy e post-C · poi chiusura STATO.
- **Prossima fetta:** smoke E2E nutrition completo + armare lo scheduler (pg_cron+pg_net da abilitare, CRON_SECRET in Vault, job settimanale) al 1° atleta autonomo · de-Lovable (pende la decisione OG di Nick).

## Appendice A — Matrice per-funzione (ricognizione live 2026-07-18, codice deployato)

| #   | funzione                   | vjwt live      | client interni                             | pattern                          |
| --- | -------------------------- | -------------- | ------------------------------------------ | -------------------------------- |
| 1   | send-email                 | true           | user(ANON)                                 | U                                |
| 2   | analyze-meal-photo         | true           | user(ANON)                                 | U                                |
| 3   | ask-copilot                | true           | user(ANON)                                 | U                                |
| 4   | check-achievements         | true           | user(ANON) — tutte le write via RLS        | U                                |
| 5   | delete-athlete             | true           | user(ANON) + admin(SR) — auth.admin delete | U+S                              |
| 6   | create-checkout-session    | true           | user(ANON) + admin(SR)                     | U+S                              |
| 7   | invite-athlete             | true           | user(ANON) + admin(SR) — inviteUserByEmail | U+S                              |
| 8   | analyze-athlete-week       | true           | user(ANON) + admin(SR)                     | U+S                              |
| 9   | generate-batch-checkins    | true           | user(ANON) + admin(SR)                     | U+S                              |
| 10  | generate-program           | true           | user(ANON) + admin(SR)                     | U+S                              |
| 11  | ingest-knowledge           | true           | user(ANON) + admin(SR)                     | U+S                              |
| 12  | chat-with-coach            | true           | user(ANON) + admin(SR, solo quota)         | U+S                              |
| 13  | submit-intake              | true           | user(ANON) + admin(SR)                     | U+S                              |
| 14  | release-autonomous-program | true           | user(ANON) + admin(SR)                     | U+S                              |
| 15  | create-portal-session      | true           | UNICO client SR (fa anche getUser)         | S (solo swap; refactor = debito) |
| 16  | forgot-password            | **false**      | admin(SR) — pubblica                       | S                                |
| 17  | stripe-webhook             | **false**      | admin(SR) — auth = firma Stripe            | S                                |
| 18  | compute-nutrition-target   | true→**false** | admin(SR) + gate token===SR                | RE-PATTERN (x-cron-secret)       |

## Appendice B — Blocco auth ATTUALE di compute-nutrition-target (dal deploy live, da rimuovere)

```ts
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
...
const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
if (!token) return json({ ok: false, error: "unauthorized" }, 401);
if (token !== SERVICE_ROLE_KEY) return json({ ok: false, error: "forbidden" }, 403);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
```

## Appendice C — Note e debiti registrati

- **Debito (non in questa fetta):** `create-portal-session` valida il JWT utente su un client admin → refactor least-privilege (user-client publishable per getUser + admin solo per i dati) quando si tocca il billing.
- **Nomi chiave:** la spec assume il nome `default` per publishable e secret (è il nome della chiave auto-provisionata). Se nel Dashboard il nome differisce, si cambia SOLO in `_shared/apiKeys.ts`.
- **Scheduler futuro (NON in questa fetta):** quando si arma → abilitare pg_cron+pg_net, mettere CRON_SECRET in Vault, job che invoca la funzione con header `x-cron-secret` via `net.http_post` (il segreto resta server-side). La ricetta sess.73 va aggiornata a questo contratto (non più service_role nell'header Authorization).
- **Worktree stale:** `.claude/worktrees/nutrition-review-notify/**` contiene copie vecchie delle funzioni — fuori scope, non toccare (pulizia repo separata).
- **JWT utente e Fase C:** disattivare le API key legacy NON invalida i token di sessione degli utenti (firmati dal JWT secret, che resta). Fonte: guida migrazione ufficiale (le due cose sono esplicitamente separate: le key si disattivano PRIMA di un'eventuale rotazione del JWT secret, che qui NON facciamo).
