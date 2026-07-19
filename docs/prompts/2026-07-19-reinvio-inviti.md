# PROMPT per Claude Code — Fetta reinvio inviti (re-port hardening)

> Estratto 1:1 dal blocco IL PROMPT di `app/spec-reinvio-inviti-2026-07-19.md` (fonte unica, corsia Cowork).
> Eseguito il 2026-07-19 su branch `claude/invite-resend-v2` (piano approvato da Nick con 2 correzioni: commit 4 docs + acceptance `listUsers`=0).

---

Task: Reinvio invito a utenti esistenti + hardening del ramo already-exists in `invite-athlete`, con feedback `resent` nel dialog coach. NIENTE DDL, NIENTE nuove env, NESSUN altro file toccato. È il re-port chirurgico del branch stantio `claude/invite-resend-hardening` (82fc631) sopra il main attuale: si riprendono le IDEE, non i commit. Data: 2026-07-19 Strumento di destinazione: [x] Claude Code Branch previsto: claude/invite-resend-v2

Lavori sul repo NC Performance Hub (frontend Vite SPA; edge functions = Deno). Piccoli passi: proponi un PIANO e ti FERMI per il mio OK PRIMA di toccare codice. Contratto request/response INVARIATO salvo l'additivo dichiarato (`resent`); il frontend vecchio non deve rompersi.

## VERITÀ DI RIFERIMENTO (leggi PRIMA di toccare codice)

- `supabase/functions/invite-athlete/index.ts` (main) — ramo primario GIÀ a posto (generateLink invite + inviteEmail() dal modulo + 502 senza details): NON toccarlo salvo l'estrazione dell'invio in un helper riusabile se serve. Il lavoro è nel ramo `isAlreadyExists`.
- `supabase/functions/_shared/email/templates.ts` — si USA (`inviteEmail({ firstName, actionLink })` → `{subject, html}`), NON si modifica: il reinvio usa lo stesso template dell'invito.
- `src/components/coach/InviteAthleteDialog.tsx` (main) — ha già selettori coachingMode/tier (zod). Si aggiunge SOLO `resent` a `SentInvite` + messaggi differenziati.
- Branch `claude/invite-resend-hardening` (82fc631, 4 commit del 5-lug, main +140) — SOLO riferimento di lettura: NON mergiarlo, NON rebasarlo. Nel PIANO dichiara cosa ne riprendi e cosa ne scarti (atteso: scarti l'helper `sendInviteEmail` con HTML inline, i 502 con `details`, la guardia onboarding incompleta).
- Lib pinnata `@supabase/supabase-js@2.49.1`: niente `getUserByEmail` in `auth.admin` → lookup mirato = `generateLink({type:"magiclink", email})`. NON aggiornare la lib in questa fetta. Se nel PIANO proponi un'alternativa, dimostrala sulla 2.49.1.
- Migrazione API key: la funzione usa `publishableKey`/`secretKey` da `_shared/apiKeys.ts` — NON toccare; il grep di acceptance (0 chiavi legacy in functions/) resta a 0.

## OBIETTIVO (osservabile)

Coach invita un'email GIÀ registrata:

1. Profilo assente → crea profilo collegato al coach (con mode/tier only-if-supplied) + reinvia email invito con link fresco → `{ success:true, email, attached:true, resent:true }`.
2. Atleta senza coach, NON onboardato → collega al coach + reinvia → `{ ..., attached:true, resent:true }`.
3. Atleta senza coach, GIÀ onboardato → collega al coach, NESSUNA email → `{ ..., attached:true, resent:false }`.
4. Già collegato a questo coach, NON onboardato (invito perso/scaduto) → reinvia → `{ ..., alreadyLinked:true, resent:true }`.
5. Già collegato e onboardato (account attivo) → nessuna email → `{ ..., alreadyLinked:true, resent:false }`.
6. Altro coach / ruolo non-athlete → conflitto come oggi (409, nessuna email). E in TUTTI i percorsi: un errore DB (select/insert/update) produce un errore esplicito (500), MAI un fall-through silenzioso.

## ARCHITETTURA (dove va la logica)

- Helper puro testabile (nuovo, dentro la funzione o in file locale alla fn): la decisione del ramo already-exists come funzione pura — input `{ profile: {role, coach_id, onboarding_completed} | null, coachId }` → output azione (`create+resend` | `attach+resend` | `attach-no-resend` | `resend-pending` | `no-resend-active` | `conflict`). Firme esatte le proponi tu nel PIANO. NIENTE fetch/Date/random dentro: deterministico.
- I/O nelle funzioni: lookup (`generateLink` magiclink), scritture profilo, invio via Resend (`inviteEmail()` del modulo) restano nel corpo della edge function. Il magiclink si genera UNA volta a inizio ramo (serve come lookup); per gli esiti no-resend il link si scarta e NON compare né in response né nei log.

## OUTPUT / CONTRATTO

- Request: INVARIATA (`email`, `fullName`, `coachingMode?`, `tier?`).
- Response: additiva — i rami already-exists aggiungono `resent: boolean`; il ramo primario resta `{ success:true, email, fullName }` (FE vecchio compatibile).
- 502 Resend-fail e 500 DB-fail: `{ error: "..." }` senza details (log server-side soltanto).
- Stringhe-utente in italiano (messaggi Dialog).

## INVARIANTI DA NON ROMPERE

1. Contratto request/response INVARIATO salvo `resent` (additivo dichiarato).
2. Guardia account-attivi su TUTTI i rami: `onboarding_completed=true` → nessun magiclink, `resent:false`.
3. L'`action_link` non compare MAI in response/log.
4. Template SOLO da `inviteEmail()` del modulo condiviso (zero HTML inline nuovo; il modulo non si tocca).
5. `coaching_mode`/`tier` only-if-supplied (pattern main): mai NULL su valori esistenti, il reinvio non sovrascrive stati.
6. 502/500 senza `details`/messaggi interni al client.
7. Errori select/insert/update propagati (500 esplicito), mai fall-through.
8. Zero DDL · zero nuove env · lib NON aggiornata · `config.toml` intatto.

## FILE

- NUOVI: test dell'helper decisionale (percorso/nome li proponi nel PIANO, coerenti con la suite Deno esistente).
- MODIFICATI: `supabase/functions/invite-athlete/index.ts` (solo ramo already-exists + helper) · `src/components/coach/InviteAthleteDialog.tsx` (solo `SentInvite.resent` + messaggi).
- VIETATI: `_shared/email/templates.ts` · `_shared/apiKeys.ts` · `_shared/method/**` · `_shared/nutrition/**` · altre funzioni · `config.toml` · tutto il resto di `src/**`. Niente "while you're here".

## COME LAVORI

- Prima il PIANO (firme helper, elenco test per i 6 casi + errori, mappa "cosa riprendo/scarto dal branch 82fc631", come verifichi ogni pezzo) → STOP per il mio OK → poi commit atomici (proposta: 1 helper+test · 2 edge function · 3 dialog).
- `deno test` e `npx tsc --noEmit` verdi; suite esistente intatta.
- Commit in italiano + `Co-Authored-By: Claude <noreply@anthropic.com>`. Merge/push = io (Nick) da GitHub Desktop. Il branch vecchio `invite-resend-hardening` lo chiudo io DOPO il merge (dammi il comando esatto in chiusura, remoto + locale).

---

## Addendum esecuzione (2026-07-19, correzioni all'OK del piano)

1. **Commit 4 (docs)** aggiunto al piano: questo prompt-file + `docs/HANDOFF.md` §0 + RETRO `docs/auto-miglioramento.md`. Acceptance finale aggiornata: `git diff main..HEAD` = 4 file codice + 3 docs.
2. **Acceptance aggiuntiva**: `grep -n "listUsers" supabase/functions/invite-athlete/index.ts` → 0 match.
3. **Caveat magiclink su email non confermata** (RETRO 82fc631): verificato da Nick sui doc ufficiali — la reference di `generateLink` non dichiara precondizioni di conferma per `type: "magiclink"`; resta dichiarato con mitigazione (500 esplicito, mai fall-through). Test decisivo = prova post-deploy con l'atleta di prova.
